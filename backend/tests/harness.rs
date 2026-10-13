use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use sqlx::types::Uuid;
use sqlx::PgPool;
use tower::ServiceExt;

mod common;

use common::{build_test_app, make_token, valid_token, TEST_JWT_SECRET};
use harness_frontend_backend::harness::reader::{list_projects, read_project_state};

const OTHER_JWT_SECRET: &str = "other-jwt-secret-not-valid";
const PROJECTS_PATH: &str = "/api/harness/projects";

async fn seed_project(pool: &PgPool, slug: &str, description: Option<&str>, deleted: bool) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO projects (slug, description, deleted_at)
         VALUES ($1, $2, CASE WHEN $3 THEN now() END)
         RETURNING id",
    )
    .bind(slug)
    .bind(description)
    .bind(deleted)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn seed_feature(
    pool: &PgPool,
    project_id: Uuid,
    number: i32,
    name: &str,
    status: &str,
    sdd: bool,
    deleted: bool,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO features
           (project_id, local_id, feature_number, name, title, sdd, status, deleted_at)
         VALUES ($1, $2, $2, $3, $4, $5, $6::feature_status, CASE WHEN $7 THEN now() END)
         RETURNING id",
    )
    .bind(project_id)
    .bind(number)
    .bind(name)
    .bind(format!("Title of {name}"))
    .bind(sdd)
    .bind(status)
    .bind(deleted)
    .fetch_one(pool)
    .await
    .unwrap()
}

struct SessionSeed<'a> {
    local_id: i64,
    feature_id: Option<i64>,
    agent: &'a str,
    started_minutes_ago: i32,
    next_step: &'a [&'a str],
    closed: bool,
    paused: bool,
}

async fn seed_session(pool: &PgPool, project_id: Uuid, s: SessionSeed<'_>) -> i64 {
    let next_step: Vec<String> = s.next_step.iter().map(|v| v.to_string()).collect();
    sqlx::query_scalar(
        "INSERT INTO session_log
           (project_id, local_id, feature_id, agent, next_step, started_at, closed_at, paused_at)
         VALUES ($1, $2, $3, $4, $5,
                 now() - make_interval(mins => $6),
                 CASE WHEN $7 THEN now() END,
                 CASE WHEN $8 THEN now() END)
         RETURNING id",
    )
    .bind(project_id)
    .bind(s.local_id)
    .bind(s.feature_id)
    .bind(s.agent)
    .bind(next_step)
    .bind(s.started_minutes_ago)
    .bind(s.closed)
    .bind(s.paused)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn seed_entry(
    pool: &PgPool,
    session_id: i64,
    local_id: i64,
    entry: &str,
    minutes_ago: i32,
    deleted: bool,
) {
    sqlx::query(
        "INSERT INTO session_log_entries (session_id, local_id, entry, created_at, deleted_at)
         VALUES ($1, $2, $3, now() - make_interval(mins => $4), CASE WHEN $5 THEN now() END)",
    )
    .bind(session_id)
    .bind(local_id)
    .bind(entry)
    .bind(minutes_ago)
    .bind(deleted)
    .execute(pool)
    .await
    .unwrap();
}

async fn get(pool: PgPool, uri: &str, token: Option<String>) -> (StatusCode, Value) {
    let app = build_test_app(pool).await;
    let mut builder = Request::builder().method("GET").uri(uri);
    if let Some(token) = token {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    let resp = app
        .oneshot(builder.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = resp.status();
    let body_bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    (status, serde_json::from_slice(&body_bytes).unwrap())
}

fn state_path(slug: &str) -> String {
    format!("/api/harness/projects/{slug}/state")
}

#[sqlx::test]
async fn projects_returns_non_deleted_projects_with_counts_ordered_by_slug(pool: PgPool) {
    let alpha = seed_project(&pool, "alpha", Some("Alpha project"), false).await;
    seed_project(&pool, "beta", None, false).await;
    let gamma = seed_project(&pool, "gamma", Some("deleted"), true).await;

    seed_feature(&pool, alpha, 1, "a1", "done", false, false).await;
    seed_feature(&pool, alpha, 2, "a2", "done", false, false).await;
    seed_feature(&pool, alpha, 3, "a3", "in_progress", true, false).await;
    seed_feature(&pool, alpha, 4, "a4", "blocked", false, false).await;
    seed_feature(&pool, alpha, 5, "a5", "pending", false, false).await;
    seed_feature(&pool, alpha, 6, "a6", "superseded", false, false).await;
    seed_feature(&pool, alpha, 7, "a7", "done", false, true).await;
    seed_feature(&pool, gamma, 1, "g1", "done", false, false).await;

    let (status, body) = get(pool, PROJECTS_PATH, Some(valid_token())).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!([
            {
                "slug": "alpha",
                "description": "Alpha project",
                "counts": { "total": 6, "done": 2, "inProgress": 1, "blocked": 1 }
            },
            {
                "slug": "beta",
                "description": "",
                "counts": { "total": 0, "done": 0, "inProgress": 0, "blocked": 0 }
            }
        ])
    );
}

#[sqlx::test]
async fn project_state_returns_mirror_data_for_the_requested_slug(pool: PgPool) {
    let project = seed_project(&pool, "test-project", Some("test desc"), false).await;
    let other = seed_project(&pool, "other-project", None, false).await;

    let first = seed_feature(&pool, project, 1, "first_feat", "in_progress", true, false).await;
    seed_feature(&pool, project, 2, "second_feat", "done", false, false).await;
    seed_feature(&pool, project, 3, "deleted_feat", "pending", false, true).await;
    let blocked = seed_feature(&pool, project, 4, "blocked_feat", "blocked", false, false).await;
    seed_feature(&pool, project, 5, "blocked_no_log", "blocked", false, false).await;
    seed_feature(&pool, other, 1, "other_feat", "blocked", false, false).await;

    let old_blocked_session = seed_session(
        &pool,
        project,
        SessionSeed {
            local_id: 1,
            feature_id: Some(blocked),
            agent: "implementer",
            started_minutes_ago: 120,
            next_step: &[],
            closed: true,
            paused: false,
        },
    )
    .await;
    seed_entry(
        &pool,
        old_blocked_session,
        1,
        "note from an older session",
        5,
        false,
    )
    .await;

    let paused_session = seed_session(
        &pool,
        project,
        SessionSeed {
            local_id: 2,
            feature_id: Some(blocked),
            agent: "paused-agent",
            started_minutes_ago: 1,
            next_step: &["paused next"],
            closed: false,
            paused: true,
        },
    )
    .await;
    seed_entry(&pool, paused_session, 2, "earlier entry", 30, false).await;
    seed_entry(&pool, paused_session, 3, "waiting on X", 20, false).await;
    seed_entry(
        &pool,
        paused_session,
        4,
        "soft-deleted newest entry",
        10,
        true,
    )
    .await;

    seed_session(
        &pool,
        project,
        SessionSeed {
            local_id: 3,
            feature_id: Some(first),
            agent: "implementer",
            started_minutes_ago: 60,
            next_step: &["T1 next", "T2 next"],
            closed: false,
            paused: false,
        },
    )
    .await;

    let (status, body) = get(pool, &state_path("test-project"), Some(valid_token())).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["project"],
        json!({ "slug": "test-project", "description": "test desc" })
    );
    assert_eq!(
        body["features"],
        json!([
            { "featureNumber": 1, "name": "first_feat", "title": "Title of first_feat", "status": "in_progress", "sdd": true },
            { "featureNumber": 2, "name": "second_feat", "title": "Title of second_feat", "status": "done", "sdd": false },
            { "featureNumber": 4, "name": "blocked_feat", "title": "Title of blocked_feat", "status": "blocked", "sdd": false },
            { "featureNumber": 5, "name": "blocked_no_log", "title": "Title of blocked_no_log", "status": "blocked", "sdd": false }
        ])
    );
    assert_eq!(body["openSession"]["agent"], "implementer");
    assert_eq!(body["openSession"]["feature"], "first_feat");
    assert_eq!(body["openSession"]["nextStep"], "T1 next | T2 next");
    assert!(body["openSession"]["startedAt"].is_string());
    assert_eq!(
        body["blockedFeatures"],
        json!([
            { "name": "blocked_feat", "note": "waiting on X" },
            { "name": "blocked_no_log", "note": "" }
        ])
    );
}

#[sqlx::test]
async fn project_state_reports_no_open_session_when_only_paused_or_closed_exist(pool: PgPool) {
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "blocked_feat", "blocked", false, false).await;
    let latest = seed_session(
        &pool,
        project,
        SessionSeed {
            local_id: 1,
            feature_id: Some(feature),
            agent: "implementer",
            started_minutes_ago: 1,
            next_step: &[],
            closed: false,
            paused: true,
        },
    )
    .await;
    let older = seed_session(
        &pool,
        project,
        SessionSeed {
            local_id: 2,
            feature_id: Some(feature),
            agent: "implementer",
            started_minutes_ago: 90,
            next_step: &[],
            closed: true,
            paused: false,
        },
    )
    .await;
    seed_entry(&pool, older, 1, "older session note", 1, false).await;
    sqlx::query("UPDATE session_log SET deleted_at = now() WHERE id = $1")
        .bind(latest)
        .execute(&pool)
        .await
        .unwrap();
    seed_session(
        &pool,
        project,
        SessionSeed {
            local_id: 3,
            feature_id: None,
            agent: "deleted-open",
            started_minutes_ago: 0,
            next_step: &[],
            closed: false,
            paused: false,
        },
    )
    .await;
    sqlx::query("UPDATE session_log SET deleted_at = now() WHERE local_id = 3")
        .execute(&pool)
        .await
        .unwrap();

    let (status, body) = get(pool, &state_path("test-project"), Some(valid_token())).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["project"]["description"], "");
    assert!(body["openSession"].is_null());
    assert_eq!(
        body["blockedFeatures"],
        json!([{ "name": "blocked_feat", "note": "older session note" }])
    );
}

#[sqlx::test]
async fn project_state_for_unknown_or_deleted_slug_returns_404(pool: PgPool) {
    seed_project(&pool, "deleted-project", None, true).await;

    for slug in ["missing-project", "deleted-project"] {
        let (status, body) = get(pool.clone(), &state_path(slug), Some(valid_token())).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "slug {slug}");
        assert_eq!(body, json!({ "error": "not found" }), "slug {slug}");
    }
}

#[sqlx::test]
async fn project_state_prefers_active_project_over_deleted_one_with_same_slug(pool: PgPool) {
    let deleted = seed_project(&pool, "reused", Some("old"), true).await;
    seed_feature(&pool, deleted, 1, "old_feat", "done", false, false).await;
    let active = seed_project(&pool, "reused", Some("new"), false).await;
    seed_feature(&pool, active, 1, "new_feat", "pending", false, false).await;

    let (status, body) = get(pool, &state_path("reused"), Some(valid_token())).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["project"]["description"], "new");
    assert_eq!(body["features"].as_array().unwrap().len(), 1);
    assert_eq!(body["features"][0]["name"], "new_feat");
}

#[sqlx::test]
async fn old_state_route_is_gone(pool: PgPool) {
    let app = build_test_app(pool).await;
    let req = Request::builder()
        .method("GET")
        .uri("/api/harness/state")
        .header("Authorization", format!("Bearer {}", valid_token()))
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

fn unauthorized_cases() -> Vec<(&'static str, Option<String>)> {
    vec![
        ("missing header", None),
        (
            "wrong signature",
            Some(make_token(OTHER_JWT_SECRET, 3600, "authenticated")),
        ),
        (
            "expired",
            Some(make_token(TEST_JWT_SECRET, -3600, "authenticated")),
        ),
        (
            "wrong audience",
            Some(make_token(TEST_JWT_SECRET, 3600, "anon")),
        ),
    ]
}

#[sqlx::test]
async fn both_endpoints_return_401_without_a_valid_token(pool: PgPool) {
    let project = seed_project(&pool, "test-project", Some("secret desc"), false).await;
    seed_feature(&pool, project, 1, "first_feat", "done", false, false).await;

    for uri in [PROJECTS_PATH.to_string(), state_path("test-project")] {
        for (case, token) in unauthorized_cases() {
            let (status, body) = get(pool.clone(), &uri, token).await;
            assert_eq!(status, StatusCode::UNAUTHORIZED, "{uri}: {case}");
            assert_eq!(body, json!({ "error": "unauthorized" }), "{uri}: {case}");
        }
    }
}

/// The reader must be SELECT-only: run both reader functions over a pool whose
/// sessions default to read-only transactions, where any INSERT/UPDATE/DELETE
/// fails with an error instead of succeeding.
#[sqlx::test]
async fn reader_performs_only_select_queries(pool: PgPool) -> sqlx::Result<()> {
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "blocked_feat", "blocked", false, false).await;
    let session = seed_session(
        &pool,
        project,
        SessionSeed {
            local_id: 1,
            feature_id: Some(feature),
            agent: "implementer",
            started_minutes_ago: 1,
            next_step: &["next"],
            closed: false,
            paused: false,
        },
    )
    .await;
    seed_entry(&pool, session, 1, "note", 0, false).await;

    let read_only_options = (*pool.connect_options())
        .clone()
        .options([("default_transaction_read_only", "on")]);
    let read_only_pool = PgPool::connect_with(read_only_options).await?;

    let write_attempt = sqlx::query("DELETE FROM session_log_entries")
        .execute(&read_only_pool)
        .await;
    assert!(write_attempt.is_err(), "read-only pool must reject writes");

    let projects = list_projects(&read_only_pool)
        .await
        .expect("list_projects should succeed on a read-only connection");
    assert_eq!(projects.len(), 1);
    let state = read_project_state(&read_only_pool, "test-project")
        .await
        .expect("read_project_state should succeed on a read-only connection");
    assert_eq!(state.blocked_features[0].note, "note");

    read_only_pool.close().await;
    Ok(())
}
