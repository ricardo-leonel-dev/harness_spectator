use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use sqlx::types::Uuid;
use sqlx::PgPool;
use tower::ServiceExt;

mod common;

use common::{build_test_app, make_token, valid_token, TEST_JWT_SECRET};
use harness_frontend_backend::harness::reader::{
    list_projects, read_dashboard, read_feature_log, read_project_state,
};

const OTHER_JWT_SECRET: &str = "other-jwt-secret-not-valid";
const PROJECTS_PATH: &str = "/api/harness/projects";
const DASHBOARD_PATH: &str = "/api/harness/dashboard";

async fn seed_features_with_statuses(
    pool: &PgPool,
    project_id: Uuid,
    first_number: i32,
    statuses: &[&str],
) {
    for (offset, status) in statuses.iter().enumerate() {
        let number = first_number + offset as i32;
        let name = format!("f{number}");
        seed_feature(pool, project_id, number, &name, status, false, false).await;
    }
}

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

fn log_path(slug: &str, name: &str) -> String {
    format!("/api/harness/projects/{slug}/features/{name}/log")
}

struct LogSessionSeed<'a> {
    local_id: i64,
    feature_id: Option<i64>,
    agent: &'a str,
    started_minutes_ago: i32,
    /// Fixed `started_at`; when set it replaces `now() - started_minutes_ago`.
    started_at_override: Option<chrono::DateTime<chrono::Utc>>,
    plan: Option<&'a [&'a str]>,
    next_step: Option<&'a [&'a str]>,
    changes: Option<&'a [&'a str]>,
    verification: Option<&'a str>,
    closure: Option<&'a str>,
    closed: bool,
    paused: bool,
    deleted: bool,
}

fn to_vec(s: Option<&[&str]>) -> Option<Vec<String>> {
    s.map(|arr| arr.iter().map(|v| v.to_string()).collect())
}

async fn seed_log_session(pool: &PgPool, project_id: Uuid, s: LogSessionSeed<'_>) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO session_log
           (project_id, local_id, feature_id, agent,
            plan, next_step, changes, verification, closure,
            started_at, closed_at, paused_at, deleted_at)
         VALUES ($1, $2, $3, $4,
                 $5, $6, $7, $8, $9,
                 COALESCE($14::timestamptz, now() - make_interval(mins => $10)),
                 CASE WHEN $11 THEN now() END,
                 CASE WHEN $12 THEN now() END,
                 CASE WHEN $13 THEN now() END)
         RETURNING id",
    )
    .bind(project_id)
    .bind(s.local_id)
    .bind(s.feature_id)
    .bind(s.agent)
    .bind(to_vec(s.plan))
    .bind(to_vec(s.next_step))
    .bind(to_vec(s.changes))
    .bind(s.verification)
    .bind(s.closure)
    .bind(s.started_minutes_ago)
    .bind(s.closed)
    .bind(s.paused)
    .bind(s.deleted)
    .bind(s.started_at_override)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn set_feature_description(pool: &PgPool, feature_id: i64, description: Option<&str>) {
    sqlx::query("UPDATE features SET description = $1 WHERE id = $2")
        .bind(description)
        .bind(feature_id)
        .execute(pool)
        .await
        .unwrap();
}

async fn set_feature_acceptance(pool: &PgPool, feature_id: i64, items: &[&str]) {
    let v: Vec<String> = items.iter().map(|s| s.to_string()).collect();
    sqlx::query("UPDATE features SET acceptance = $1 WHERE id = $2")
        .bind(&v)
        .bind(feature_id)
        .execute(pool)
        .await
        .unwrap();
}

async fn fetch_entry_created_at(pool: &PgPool, entry_id: i64) -> String {
    sqlx::query_scalar::<_, chrono::DateTime<chrono::Utc>>(
        "SELECT created_at FROM session_log_entries WHERE id = $1",
    )
    .bind(entry_id)
    .fetch_one(pool)
    .await
    .unwrap()
    .to_rfc3339()
}

async fn insert_entry_with_offset(
    pool: &PgPool,
    session_id: i64,
    local_id: i64,
    entry: &str,
    minutes_ago: i32,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO session_log_entries (session_id, local_id, entry, created_at)
         VALUES ($1, $2, $3, now() - make_interval(mins => $4))
         RETURNING id",
    )
    .bind(session_id)
    .bind(local_id)
    .bind(entry)
    .bind(minutes_ago)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn insert_entry_at(
    pool: &PgPool,
    session_id: i64,
    local_id: i64,
    entry: &str,
    created_at: chrono::DateTime<chrono::Utc>,
) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO session_log_entries (session_id, local_id, entry, created_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id",
    )
    .bind(session_id)
    .bind(local_id)
    .bind(entry)
    .bind(created_at)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Re-closes a session with a fresh `closed_at`. `closed_at` is indexed, so
/// Postgres writes a new tuple version at the end of the heap plus a new
/// `(project_id, closed_at)` index entry that now sorts after rows closed
/// earlier. Afterwards neither a seq scan nor that index returns tied rows in
/// `id` order, so only an explicit `id ASC` tie-break does.
async fn relocate_session(pool: &PgPool, id: i64) {
    sqlx::query("UPDATE session_log SET closed_at = clock_timestamp() WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
}

/// Rewrites an entry's `created_at` away and back. The column is indexed, so
/// each update writes a new heap tuple and index entry (no HOT update),
/// moving the row behind its tied siblings in scan order.
async fn relocate_entry(pool: &PgPool, id: i64) {
    for secs in [1, -1] {
        sqlx::query(
            "UPDATE session_log_entries SET created_at = created_at + make_interval(secs => $2)
             WHERE id = $1",
        )
        .bind(id)
        .bind(f64::from(secs))
        .execute(pool)
        .await
        .unwrap();
    }
}

struct SessionTimestamps {
    started_at: String,
    closed_at: Option<String>,
    paused_at: Option<String>,
}

async fn fetch_session_timestamps(pool: &PgPool, session_id: i64) -> SessionTimestamps {
    let row: (
        chrono::DateTime<chrono::Utc>,
        Option<chrono::DateTime<chrono::Utc>>,
        Option<chrono::DateTime<chrono::Utc>>,
    ) = sqlx::query_as("SELECT started_at, closed_at, paused_at FROM session_log WHERE id = $1")
        .bind(session_id)
        .fetch_one(pool)
        .await
        .unwrap();
    SessionTimestamps {
        started_at: row.0.to_rfc3339(),
        closed_at: row.1.map(|t| t.to_rfc3339()),
        paused_at: row.2.map(|t| t.to_rfc3339()),
    }
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
async fn harness_endpoints_return_401_without_a_valid_token(pool: PgPool) {
    let project = seed_project(&pool, "test-project", Some("secret desc"), false).await;
    seed_feature(&pool, project, 1, "first_feat", "done", false, false).await;

    for uri in [
        PROJECTS_PATH.to_string(),
        state_path("test-project"),
        log_path("test-project", "first_feat"),
        DASHBOARD_PATH.to_string(),
    ] {
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

    let log = read_feature_log(&read_only_pool, "test-project", "blocked_feat")
        .await
        .expect("read_feature_log should succeed on a read-only connection");
    assert_eq!(log.feature.name, "blocked_feat");
    assert_eq!(log.sessions.len(), 1);
    assert_eq!(log.sessions[0].entries.len(), 1);
    assert_eq!(log.sessions[0].entries[0].entry, "note");

    let dashboard = read_dashboard(&read_only_pool)
        .await
        .expect("read_dashboard should succeed on a read-only connection");
    assert_eq!(dashboard.overall.total, 1);

    read_only_pool.close().await;
    Ok(())
}

#[sqlx::test]
async fn feature_log_returns_header_and_sessions(pool: PgPool) {
    let project = seed_project(&pool, "test-project", Some("proj desc"), false).await;
    let feature = seed_feature(
        &pool,
        project,
        6,
        "feature_process_log",
        "in_progress",
        true,
        false,
    )
    .await;
    set_feature_description(&pool, feature, Some("feature desc")).await;
    set_feature_acceptance(&pool, feature, &["first acceptance", "second acceptance"]).await;

    let session = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 13,
            feature_id: Some(feature),
            agent: "leader -> implementer (claude-opus-5-5)",
            started_minutes_ago: 30,
            started_at_override: None,
            plan: Some(&["Ground design", "Write requirements.md"]),
            next_step: None,
            changes: Some(&["src/harness/reader.rs", "src/harness/router.rs"]),
            verification: Some("cargo test green"),
            closure: Some("Closed after verification"),
            closed: true,
            paused: false,
            deleted: false,
        },
    )
    .await;
    let session_ts = fetch_session_timestamps(&pool, session).await;
    let entry1_id =
        insert_entry_with_offset(&pool, session, 1, "Grounding: spec is approved", 25).await;
    let entry2_id = insert_entry_with_offset(&pool, session, 2, "Implementation complete", 5).await;
    let entry1_ts = fetch_entry_created_at(&pool, entry1_id).await;
    let entry2_ts = fetch_entry_created_at(&pool, entry2_id).await;

    let (status, body) = get(
        pool.clone(),
        &log_path("test-project", "feature_process_log"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["feature"]["featureNumber"], 6);
    assert_eq!(body["feature"]["name"], "feature_process_log");
    assert_eq!(body["feature"]["title"], "Title of feature_process_log");
    assert_eq!(body["feature"]["status"], "in_progress");
    assert_eq!(body["feature"]["sdd"], true);
    assert_eq!(body["feature"]["description"], "feature desc");
    assert_eq!(
        body["feature"]["acceptance"],
        json!(["first acceptance", "second acceptance"])
    );
    let sessions = body["sessions"].as_array().expect("sessions array");
    assert_eq!(sessions.len(), 1);
    let s = &sessions[0];
    assert_eq!(s["localId"], 13);
    assert_eq!(s["agent"], "leader -> implementer (claude-opus-5-5)");
    assert_eq!(s["startedAt"], session_ts.started_at);
    let closed_at = session_ts
        .closed_at
        .as_ref()
        .expect("seeded closed session must have closed_at");
    assert_eq!(s["closedAt"], closed_at.as_str());
    assert_eq!(s["pausedAt"], Value::Null);
    assert_eq!(s["plan"], json!(["Ground design", "Write requirements.md"]));
    assert_eq!(s["nextStep"], Value::Null);
    assert_eq!(
        s["changes"],
        json!(["src/harness/reader.rs", "src/harness/router.rs"])
    );
    assert_eq!(s["verification"], "cargo test green");
    assert_eq!(s["closure"], "Closed after verification");
    let entries = s["entries"].as_array().expect("entries array");
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["entry"], "Grounding: spec is approved");
    assert_eq!(entries[0]["createdAt"], entry1_ts);
    assert_eq!(entries[1]["entry"], "Implementation complete");
    assert_eq!(entries[1]["createdAt"], entry2_ts);
}

#[sqlx::test]
async fn feature_log_orders_sessions_and_entries_ascending(pool: PgPool) {
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(
        &pool,
        project,
        1,
        "ordering_feat",
        "in_progress",
        false,
        false,
    )
    .await;

    // Tied rows share one literal timestamp, later than every relative one, so
    // "tie-a"/"tie-b" still sort after "new" and only `id ASC` separates them.
    let tied_started_at = chrono::DateTime::parse_from_rfc3339("2100-01-01T00:00:00Z")
        .unwrap()
        .with_timezone(&chrono::Utc);
    let tied_created_at = chrono::DateTime::parse_from_rfc3339("2100-01-01T00:05:00Z")
        .unwrap()
        .with_timezone(&chrono::Utc);

    let _mid = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 1,
            feature_id: Some(feature),
            agent: "mid",
            started_minutes_ago: 20,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: true,
            paused: false,
            deleted: false,
        },
    )
    .await;
    let _old = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 2,
            feature_id: Some(feature),
            agent: "old",
            started_minutes_ago: 30,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: true,
            paused: false,
            deleted: false,
        },
    )
    .await;
    let new = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 3,
            feature_id: Some(feature),
            agent: "new",
            started_minutes_ago: 10,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: true,
            paused: false,
            deleted: false,
        },
    )
    .await;

    let tie_a = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 5,
            feature_id: Some(feature),
            agent: "tie-a",
            started_minutes_ago: 5,
            started_at_override: Some(tied_started_at),
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: true,
            paused: false,
            deleted: false,
        },
    )
    .await;
    let tie_b = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 4,
            feature_id: Some(feature),
            agent: "tie-b",
            started_minutes_ago: 5,
            started_at_override: Some(tied_started_at),
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: true,
            paused: false,
            deleted: false,
        },
    )
    .await;

    insert_entry_with_offset(&pool, new, 1, "new-late", 8).await;
    insert_entry_with_offset(&pool, new, 2, "new-early", 15).await;

    let tie1 = insert_entry_at(&pool, tie_a, 1, "tie", tied_created_at).await;
    let tie2 = insert_entry_at(&pool, tie_a, 2, "tie2", tied_created_at).await;
    let tie3 = insert_entry_at(&pool, tie_a, 3, "tie3", tied_created_at).await;

    // Move the lower-id tied rows behind the higher-id ones physically, so the
    // expected order is only reachable through the `id ASC` tie-break. tie-a and
    // tie-b also carry swapped local_ids so an index scan on
    // (project_id, local_id) cannot return them in id order either.
    relocate_session(&pool, tie_a).await;
    relocate_entry(&pool, tie1).await;
    relocate_entry(&pool, tie2).await;

    assert!(tie_a < tie_b && tie1 < tie2 && tie2 < tie3);
    let distinct_started: i64 =
        sqlx::query_scalar("SELECT COUNT(DISTINCT started_at) FROM session_log WHERE id = ANY($1)")
            .bind(&[tie_a, tie_b][..])
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(distinct_started, 1, "tie-a and tie-b must share started_at");
    let distinct_created: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT created_at) FROM session_log_entries WHERE id = ANY($1)",
    )
    .bind(&[tie1, tie2, tie3][..])
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(distinct_created, 1, "tie/tie2/tie3 must share created_at");

    let (status, body) = get(
        pool.clone(),
        &log_path("test-project", "ordering_feat"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let sessions = body["sessions"].as_array().expect("sessions array");
    assert_eq!(sessions.len(), 5);
    let agents: Vec<&str> = sessions
        .iter()
        .map(|s| s["agent"].as_str().unwrap())
        .collect();
    assert_eq!(agents, vec!["old", "mid", "new", "tie-a", "tie-b"]);

    let new_entries = sessions[2]["entries"].as_array().unwrap();
    let entry_texts: Vec<&str> = new_entries
        .iter()
        .map(|e| e["entry"].as_str().unwrap())
        .collect();
    assert_eq!(entry_texts, vec!["new-early", "new-late"]);

    let tie_entries = sessions[3]["entries"].as_array().unwrap();
    let tie_entry_texts: Vec<&str> = tie_entries
        .iter()
        .map(|e| e["entry"].as_str().unwrap())
        .collect();
    assert_eq!(tie_entry_texts, vec!["tie", "tie2", "tie3"]);
}

#[sqlx::test]
async fn feature_log_excludes_soft_deleted_sessions_and_entries(pool: PgPool) {
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "soft_del", "done", false, false).await;

    let live = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 1,
            feature_id: Some(feature),
            agent: "live",
            started_minutes_ago: 10,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: true,
            paused: false,
            deleted: false,
        },
    )
    .await;
    insert_entry_with_offset(&pool, live, 1, "live-1", 8).await;
    insert_entry_with_offset(&pool, live, 2, "live-deleted", 5).await;
    sqlx::query(
        "UPDATE session_log_entries SET deleted_at = now() WHERE session_id = $1 AND local_id = 2",
    )
    .bind(live)
    .execute(&pool)
    .await
    .unwrap();
    insert_entry_with_offset(&pool, live, 3, "live-3", 2).await;

    let deleted_session = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 2,
            feature_id: Some(feature),
            agent: "deleted",
            started_minutes_ago: 20,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: true,
            paused: false,
            deleted: true,
        },
    )
    .await;
    insert_entry_with_offset(&pool, deleted_session, 1, "should-be-hidden", 15).await;

    let (status, body) = get(
        pool.clone(),
        &log_path("test-project", "soft_del"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let sessions = body["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 1, "deleted session must be omitted");
    assert_eq!(sessions[0]["agent"], "live");
    let entries = sessions[0]["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 2, "deleted entry must be omitted");
    let texts: Vec<&str> = entries
        .iter()
        .map(|e| e["entry"].as_str().unwrap())
        .collect();
    assert_eq!(texts, vec!["live-1", "live-3"]);
}

#[sqlx::test]
async fn feature_log_excludes_sessions_of_other_features(pool: PgPool) {
    let project = seed_project(&pool, "test-project", None, false).await;
    let target = seed_feature(
        &pool,
        project,
        1,
        "target_feat",
        "in_progress",
        false,
        false,
    )
    .await;
    let sibling = seed_feature(&pool, project, 2, "sibling_feat", "pending", false, false).await;

    seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 1,
            feature_id: Some(target),
            agent: "target-own",
            started_minutes_ago: 10,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: false,
            paused: false,
            deleted: false,
        },
    )
    .await;

    seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 2,
            feature_id: Some(sibling),
            agent: "sibling-session",
            started_minutes_ago: 8,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: true,
            paused: false,
            deleted: false,
        },
    )
    .await;

    seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 3,
            feature_id: None,
            agent: "feature-null",
            started_minutes_ago: 6,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: true,
            paused: false,
            deleted: false,
        },
    )
    .await;

    let (status, body) = get(
        pool.clone(),
        &log_path("test-project", "target_feat"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let sessions = body["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0]["agent"], "target-own");
}

#[sqlx::test]
async fn feature_log_with_no_sessions_returns_empty_list(pool: PgPool) {
    let project = seed_project(&pool, "test-project", None, false).await;
    seed_feature(&pool, project, 1, "lonely_feat", "pending", false, false).await;

    let (status, body) = get(
        pool.clone(),
        &log_path("test-project", "lonely_feat"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["feature"]["name"], "lonely_feat");
    assert_eq!(body["sessions"], json!([]));
}

#[sqlx::test]
async fn feature_log_renders_nulls_explicitly(pool: PgPool) {
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "null_feat", "in_progress", false, false).await;
    set_feature_description(&pool, feature, None).await;

    let nulls = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 1,
            feature_id: Some(feature),
            agent: "null-agent",
            started_minutes_ago: 30,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: false,
            paused: false,
            deleted: false,
        },
    )
    .await;
    let nulls_ts = fetch_session_timestamps(&pool, nulls).await;
    insert_entry_with_offset(&pool, nulls, 1, "n1", 20).await;

    let paused = seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 2,
            feature_id: Some(feature),
            agent: "paused-agent",
            started_minutes_ago: 5,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: false,
            paused: true,
            deleted: false,
        },
    )
    .await;
    let paused_ts = fetch_session_timestamps(&pool, paused).await;

    let (status, body) = get(
        pool.clone(),
        &log_path("test-project", "null_feat"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["feature"]["description"], Value::Null);

    let sessions = body["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 2);

    let first = &sessions[0];
    assert_eq!(first["localId"], 1);
    assert_eq!(first["startedAt"], nulls_ts.started_at);
    assert_eq!(first["closedAt"], Value::Null);
    assert_eq!(first["pausedAt"], Value::Null);
    assert_eq!(first["plan"], Value::Null);
    assert_eq!(first["nextStep"], Value::Null);
    assert_eq!(first["changes"], Value::Null);
    assert_eq!(first["verification"], Value::Null);
    assert_eq!(first["closure"], Value::Null);

    let second = &sessions[1];
    assert_eq!(second["localId"], 2);
    let paused_at = paused_ts
        .paused_at
        .as_ref()
        .expect("paused session must have paused_at");
    assert_eq!(second["pausedAt"], paused_at.as_str());
    assert_eq!(second["closedAt"], Value::Null);
}

#[sqlx::test]
async fn feature_log_for_unknown_or_deleted_project_returns_404(pool: PgPool) {
    seed_project(&pool, "deleted-project", None, true).await;

    let project = seed_project(&pool, "alive-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "some_feat", "in_progress", false, false).await;
    seed_log_session(
        &pool,
        project,
        LogSessionSeed {
            local_id: 1,
            feature_id: Some(feature),
            agent: "x",
            started_minutes_ago: 1,
            started_at_override: None,
            plan: None,
            next_step: None,
            changes: None,
            verification: None,
            closure: None,
            closed: false,
            paused: false,
            deleted: false,
        },
    )
    .await;

    for slug in ["missing-project", "deleted-project"] {
        let (status, body) = get(pool.clone(), &log_path(slug, "any"), Some(valid_token())).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "slug {slug}");
        assert_eq!(body, json!({ "error": "not found" }), "slug {slug}");
    }
}

#[sqlx::test]
async fn feature_log_for_unknown_or_deleted_feature_returns_404(pool: PgPool) {
    let project = seed_project(&pool, "test-project", None, false).await;
    seed_feature(&pool, project, 1, "alive_feat", "in_progress", false, false).await;
    seed_feature(
        &pool,
        project,
        2,
        "deleted_feat",
        "in_progress",
        false,
        true,
    )
    .await;

    for name in ["missing-feat", "deleted_feat"] {
        let (status, body) = get(
            pool.clone(),
            &log_path("test-project", name),
            Some(valid_token()),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "name {name}");
        assert_eq!(body, json!({ "error": "not found" }), "name {name}");
    }
}

#[sqlx::test]
async fn feature_log_does_not_cross_projects(pool: PgPool) {
    let project = seed_project(&pool, "test-project", None, false).await;
    let other = seed_project(&pool, "other-project", None, false).await;
    seed_feature(
        &pool,
        project,
        1,
        "shared_name",
        "in_progress",
        false,
        false,
    )
    .await;
    seed_feature(&pool, other, 1, "shared_name", "in_progress", false, false).await;

    let (status, body) = get(
        pool.clone(),
        &log_path("test-project", "shared_name"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["feature"]["name"], "shared_name");
    let sessions = body["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 0);

    let (other_status, _) = get(
        pool.clone(),
        &log_path("other-project", "shared_name"),
        Some(valid_token()),
    )
    .await;
    assert_eq!(other_status, StatusCode::OK);
}

#[sqlx::test]
async fn dashboard_with_empty_mirror_returns_zeroes(pool: PgPool) {
    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "overall": {
                "done": 0,
                "total": 0,
                "percentage": 0.0,
                "byStatus": {
                    "pending": 0,
                    "specDrafting": 0,
                    "specReady": 0,
                    "inProgress": 0,
                    "blocked": 0,
                    "done": 0
                }
            },
            "topProjects": []
        })
    );
}

#[sqlx::test]
async fn dashboard_aggregates_counts_across_projects(pool: PgPool) {
    let alpha = seed_project(&pool, "alpha", Some("alpha desc"), false).await;
    let beta = seed_project(&pool, "beta", Some("beta desc"), false).await;

    seed_features_with_statuses(
        &pool,
        alpha,
        1,
        &[
            "pending",
            "spec_drafting",
            "spec_ready",
            "in_progress",
            "blocked",
            "done",
            "done",
        ],
    )
    .await;
    seed_features_with_statuses(&pool, beta, 1, &["done", "pending", "pending"]).await;

    let (status, body) = get(pool.clone(), DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);

    assert_eq!(
        body,
        json!({
            "overall": {
                "done": 3,
                "total": 10,
                "percentage": 30.0,
                "byStatus": {
                    "pending": 3,
                    "specDrafting": 1,
                    "specReady": 1,
                    "inProgress": 1,
                    "blocked": 1,
                    "done": 3
                }
            },
            "topProjects": [
                { "slug": "alpha", "done": 2, "total": 7, "percentage": 28.57 },
                { "slug": "beta", "done": 1, "total": 3, "percentage": 33.33 }
            ]
        })
    );

    let top_projects = body["topProjects"].as_array().expect("topProjects array");
    for entry in top_projects {
        let slug = entry["slug"].as_str().unwrap();
        let (state_status, _) = get(pool.clone(), &state_path(slug), Some(valid_token())).await;
        assert_eq!(
            state_status,
            StatusCode::OK,
            "state for {slug} must resolve"
        );
    }
}

#[sqlx::test]
async fn dashboard_excludes_deleted_and_superseded_features(pool: PgPool) {
    let alpha = seed_project(&pool, "alpha", None, false).await;
    let beta = seed_project(&pool, "beta", None, false).await;
    let gamma = seed_project(&pool, "gamma", None, false).await;

    seed_features_with_statuses(&pool, alpha, 1, &["done"]).await;
    seed_features_with_statuses(&pool, alpha, 2, &["pending"]).await;
    seed_feature(&pool, alpha, 3, "alpha-deleted-done", "done", false, true).await;
    seed_feature(
        &pool,
        alpha,
        4,
        "alpha-superseded",
        "superseded",
        false,
        false,
    )
    .await;

    seed_feature(
        &pool,
        beta,
        1,
        "beta-superseded",
        "superseded",
        false,
        false,
    )
    .await;
    seed_feature(
        &pool,
        beta,
        2,
        "beta-deleted-pending",
        "pending",
        false,
        true,
    )
    .await;

    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["overall"],
        json!({
            "done": 1,
            "total": 2,
            "percentage": 50.0,
            "byStatus": {
                "pending": 1,
                "specDrafting": 0,
                "specReady": 0,
                "inProgress": 0,
                "blocked": 0,
                "done": 1
            }
        })
    );
    assert_eq!(
        body["topProjects"],
        json!([{ "slug": "alpha", "done": 1, "total": 2, "percentage": 50.0 }])
    );

    let _ = gamma;
}

#[sqlx::test]
async fn dashboard_excludes_deleted_projects(pool: PgPool) {
    let deleted = seed_project(&pool, "ghost", None, true).await;
    let live = seed_project(&pool, "alive", None, false).await;

    seed_features_with_statuses(&pool, deleted, 1, &["done", "done", "done"]).await;
    seed_features_with_statuses(&pool, live, 1, &["pending"]).await;

    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["overall"]["done"], 0);
    assert_eq!(body["overall"]["total"], 1);
    assert_eq!(body["overall"]["percentage"], 0.0);
    assert_eq!(
        body["overall"]["byStatus"],
        json!({
            "pending": 1,
            "specDrafting": 0,
            "specReady": 0,
            "inProgress": 0,
            "blocked": 0,
            "done": 0
        })
    );
    let slugs: Vec<&str> = body["topProjects"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["slug"].as_str().unwrap())
        .collect();
    assert_eq!(slugs, vec!["alive"]);
}

#[sqlx::test]
async fn dashboard_percentage_is_zero_when_nothing_is_countable(pool: PgPool) {
    let only = seed_project(&pool, "only", None, false).await;
    seed_feature(
        &pool,
        only,
        1,
        "only-superseded",
        "superseded",
        false,
        false,
    )
    .await;
    seed_feature(
        &pool,
        only,
        2,
        "only-deleted-pending",
        "pending",
        false,
        true,
    )
    .await;

    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["overall"],
        json!({
            "done": 0,
            "total": 0,
            "percentage": 0.0,
            "byStatus": {
                "pending": 0,
                "specDrafting": 0,
                "specReady": 0,
                "inProgress": 0,
                "blocked": 0,
                "done": 0
            }
        })
    );
    assert_eq!(body["topProjects"], json!([]));
}

#[sqlx::test]
async fn dashboard_orders_projects_by_done_then_percentage_then_slug(pool: PgPool) {
    let c = seed_project(&pool, "c-proj", None, false).await;
    let a = seed_project(&pool, "a-proj", None, false).await;
    let b = seed_project(&pool, "b-proj", None, false).await;
    let d = seed_project(&pool, "d-proj", None, false).await;
    let e = seed_project(&pool, "e-proj", None, false).await;

    seed_features_with_statuses(&pool, c, 1, &["done", "done"]).await;
    seed_features_with_statuses(&pool, a, 1, &["done"]).await;
    seed_features_with_statuses(&pool, b, 1, &["done"]).await;
    seed_features_with_statuses(&pool, d, 1, &["done", "pending", "pending", "pending"]).await;
    seed_features_with_statuses(&pool, e, 1, &["pending", "pending", "pending"]).await;

    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    let slugs: Vec<&str> = body["topProjects"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["slug"].as_str().unwrap())
        .collect();
    assert_eq!(
        slugs,
        vec!["c-proj", "a-proj", "b-proj", "d-proj", "e-proj"]
    );
}

#[sqlx::test]
async fn dashboard_limits_top_projects_to_ten(pool: PgPool) {
    for n in 1..=12 {
        let slug = format!("p{n:02}");
        let project = seed_project(&pool, &slug, None, false).await;
        let count = 13 - n;
        let statuses: Vec<String> = (0..count).map(|_| "done".to_string()).collect();
        let status_refs: Vec<&str> = statuses.iter().map(String::as_str).collect();
        seed_features_with_statuses(&pool, project, 1, &status_refs).await;
    }

    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    let top = body["topProjects"].as_array().expect("topProjects array");
    let slugs: Vec<&str> = top.iter().map(|p| p["slug"].as_str().unwrap()).collect();
    let expected: Vec<String> = (1..=10).map(|n| format!("p{n:02}")).collect();
    let expected_refs: Vec<&str> = expected.iter().map(String::as_str).collect();
    assert_eq!(slugs, expected_refs);

    let total_per_project: i64 = (1..=12).map(|n| 13 - n).sum();
    assert_eq!(body["overall"]["done"].as_i64().unwrap(), total_per_project);
    assert_eq!(
        body["overall"]["total"].as_i64().unwrap(),
        total_per_project
    );
}
