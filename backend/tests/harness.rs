#![recursion_limit = "256"]

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use sqlx::types::Uuid;
use sqlx::PgPool;
use tower::ServiceExt;

mod common;

use common::{build_test_app, make_token, valid_token, TestDb, TEST_JWT_SECRET};
use harness_frontend_backend::harness::reader::{
    list_projects, read_dashboard, read_feature_agent_usage, read_feature_log,
    read_features_by_status, read_project_state,
};

const OTHER_JWT_SECRET: &str = "other-jwt-secret-not-valid";
const PROJECTS_PATH: &str = "/api/harness/projects";
const DASHBOARD_PATH: &str = "/api/harness/dashboard";
const FEATURES_PATH: &str = "/api/harness/features";

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

async fn get_text(pool: PgPool, uri: &str, token: Option<String>) -> (StatusCode, String) {
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
    (status, String::from_utf8(body_bytes.to_vec()).unwrap())
}

fn state_path(slug: &str) -> String {
    format!("/api/harness/projects/{slug}/state")
}

fn log_path(slug: &str, name: &str) -> String {
    format!("/api/harness/projects/{slug}/features/{name}/log")
}

fn agent_usage_path(slug: &str, name: &str) -> String {
    format!("/api/harness/projects/{slug}/features/{name}/agent-usage")
}

struct AgentRunSeed<'a> {
    local_id: i64,
    feature_id: Option<i64>,
    runtime: &'a str,
    external_id: &'a str,
    parent_external_id: Option<&'a str>,
    spawn_depth: Option<i32>,
    agent_role: Option<&'a str>,
    label: Option<&'a str>,
    model: Option<&'a str>,
    /// Seconds after `B` = 2026-01-01T00:00:00Z.
    started_offset_secs: Option<i64>,
    finished_offset_secs: Option<i64>,
    duration_seconds: Option<f64>,
    /// input, cache_read, cache_write, output, reasoning, total.
    tokens: [Option<i64>; 6],
    deleted: bool,
}

fn run_seed<'a>(local_id: i64, feature_id: Option<i64>, external_id: &'a str) -> AgentRunSeed<'a> {
    AgentRunSeed {
        local_id,
        feature_id,
        runtime: "claude",
        external_id,
        parent_external_id: None,
        spawn_depth: None,
        agent_role: None,
        label: None,
        model: None,
        started_offset_secs: None,
        finished_offset_secs: None,
        duration_seconds: None,
        tokens: [None; 6],
        deleted: false,
    }
}

fn base_plus(offset_secs: Option<i64>) -> Option<chrono::DateTime<chrono::Utc>> {
    offset_secs.map(|secs| {
        chrono::DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc)
            + chrono::TimeDelta::seconds(secs)
    })
}

async fn seed_agent_run(pool: &PgPool, project_id: Uuid, s: AgentRunSeed<'_>) -> i64 {
    sqlx::query_scalar(
        "INSERT INTO agent_runs
           (project_id, local_id, feature_id, runtime, external_id, parent_external_id,
            spawn_depth, agent_role, label, model, started_at, finished_at, duration_seconds,
            input_tokens, cache_read_tokens, cache_write_tokens, output_tokens,
            reasoning_tokens, total_tokens, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 $14, $15, $16, $17, $18, $19, CASE WHEN $20 THEN now() END)
         RETURNING id",
    )
    .bind(project_id)
    .bind(s.local_id)
    .bind(s.feature_id)
    .bind(s.runtime)
    .bind(s.external_id)
    .bind(s.parent_external_id)
    .bind(s.spawn_depth)
    .bind(s.agent_role)
    .bind(s.label)
    .bind(s.model)
    .bind(base_plus(s.started_offset_secs))
    .bind(base_plus(s.finished_offset_secs))
    .bind(s.duration_seconds)
    .bind(s.tokens[0])
    .bind(s.tokens[1])
    .bind(s.tokens[2])
    .bind(s.tokens[3])
    .bind(s.tokens[4])
    .bind(s.tokens[5])
    .bind(s.deleted)
    .fetch_one(pool)
    .await
    .unwrap()
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

#[tokio::test]
async fn projects_returns_non_deleted_projects_with_counts_ordered_by_slug() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn project_state_returns_mirror_data_for_the_requested_slug() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn project_state_reports_no_open_session_when_only_paused_or_closed_exist() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn project_state_for_unknown_or_deleted_slug_returns_404() {
    let db = TestDb::new().await;
    let pool = db.pool();
    seed_project(&pool, "deleted-project", None, true).await;

    for slug in ["missing-project", "deleted-project"] {
        let (status, body) = get(pool.clone(), &state_path(slug), Some(valid_token())).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "slug {slug}");
        assert_eq!(body, json!({ "error": "not found" }), "slug {slug}");
    }
}

#[tokio::test]
async fn project_state_prefers_active_project_over_deleted_one_with_same_slug() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn old_state_route_is_gone() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn harness_endpoints_return_401_without_a_valid_token() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "test-project", Some("secret desc"), false).await;
    seed_feature(&pool, project, 1, "first_feat", "done", false, false).await;

    for uri in [
        PROJECTS_PATH.to_string(),
        state_path("test-project"),
        log_path("test-project", "first_feat"),
        agent_usage_path("test-project", "first_feat"),
        DASHBOARD_PATH.to_string(),
        format!("{FEATURES_PATH}?status=done"),
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
#[tokio::test]
async fn reader_performs_only_select_queries() -> sqlx::Result<()> {
    let db = TestDb::new().await;
    let pool = db.pool();
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
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            started_offset_secs: Some(0),
            ..run_seed(1, Some(feature), "run-1")
        },
    )
    .await;

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
    assert_eq!(dashboard.agent_usage.totals.runs, 1);

    let usage = read_feature_agent_usage(&read_only_pool, "test-project", "blocked_feat")
        .await
        .expect("read_feature_agent_usage should succeed on a read-only connection");
    assert_eq!(usage.runs.len(), 1);

    let blocked = read_features_by_status(&read_only_pool, "blocked")
        .await
        .expect("read_features_by_status should succeed on a read-only connection");
    assert_eq!(blocked.len(), 1);

    read_only_pool.close().await;
    Ok(())
}

#[tokio::test]
async fn feature_log_returns_header_and_sessions() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn feature_log_orders_sessions_and_entries_ascending() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn feature_log_excludes_soft_deleted_sessions_and_entries() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn feature_log_excludes_sessions_of_other_features() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn feature_log_with_no_sessions_returns_empty_list() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn feature_log_renders_nulls_explicitly() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn feature_log_for_unknown_or_deleted_project_returns_404() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn feature_log_for_unknown_or_deleted_feature_returns_404() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn feature_log_does_not_cross_projects() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

/// The R18 value: what `agentUsage` must be when no counted run exists.
fn empty_agent_usage() -> Value {
    let zero = json!({
        "runs": 0,
        "effortSeconds": 0.0,
        "tokens": {"input": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0, "reasoning": 0, "total": 0}
    });
    json!({
        "runs": 0,
        "effortSeconds": 0.0,
        "tokens": {"input": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0, "reasoning": 0, "total": 0},
        "byRuntime": {"claude": zero, "codex": zero},
        "byModel": [],
        "byRole": [],
        "topProjects": []
    })
}

#[tokio::test]
async fn dashboard_with_empty_mirror_returns_zeroes() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "agentUsage": empty_agent_usage(),
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

#[tokio::test]
async fn dashboard_aggregates_counts_across_projects() {
    let db = TestDb::new().await;
    let pool = db.pool();
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
            "agentUsage": empty_agent_usage(),
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

#[tokio::test]
async fn dashboard_excludes_deleted_and_superseded_features() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn dashboard_excludes_deleted_projects() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn dashboard_percentage_is_zero_when_nothing_is_countable() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn dashboard_orders_projects_by_done_then_percentage_then_slug() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

#[tokio::test]
async fn dashboard_limits_top_projects_to_ten() {
    let db = TestDb::new().await;
    let pool = db.pool();
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

fn usage_bucket(runs: i64, effort: f64, tokens: [i64; 6]) -> Value {
    json!({
        "runs": runs,
        "effortSeconds": effort,
        "tokens": {
            "input": tokens[0],
            "cacheRead": tokens[1],
            "cacheWrite": tokens[2],
            "output": tokens[3],
            "reasoning": tokens[4],
            "total": tokens[5]
        }
    })
}

fn with_key(key: &str, value: Value, bucket: Value) -> Value {
    let mut obj = bucket.as_object().unwrap().clone();
    obj.insert(key.to_string(), value);
    Value::Object(obj)
}

#[tokio::test]
async fn dashboard_agent_usage_aggregates_runs_across_projects() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let alpha = seed_project(&pool, "alpha", None, false).await;
    let beta = seed_project(&pool, "beta", None, false).await;
    let gamma = seed_project(&pool, "gamma", None, false).await;
    let gone = seed_project(&pool, "gone", None, true).await;

    let a1 = seed_feature(&pool, alpha, 1, "a1", "done", false, false).await;
    let a2 = seed_feature(&pool, alpha, 2, "a2", "superseded", false, false).await;
    let b1 = seed_feature(&pool, beta, 1, "b1", "done", false, true).await;
    seed_feature(&pool, gamma, 1, "g1", "pending", false, false).await;

    let opus = Some("claude-opus-5-5");
    let gpt = Some("gpt-5-codex");
    seed_agent_run(
        &pool,
        alpha,
        AgentRunSeed {
            agent_role: Some("leader"),
            model: opus,
            duration_seconds: Some(100.0),
            tokens: [Some(10), Some(1000), Some(200), Some(50), None, Some(1260)],
            ..run_seed(1, Some(a1), "r1")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        alpha,
        AgentRunSeed {
            agent_role: Some("implementer"),
            model: opus,
            duration_seconds: Some(30.5),
            tokens: [Some(5), Some(500), Some(100), Some(20), None, Some(625)],
            ..run_seed(2, None, "r2")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        alpha,
        AgentRunSeed {
            runtime: "codex",
            agent_role: Some("implementer"),
            model: gpt,
            duration_seconds: Some(12.25),
            tokens: [Some(100), Some(0), Some(0), Some(40), Some(8), Some(140)],
            ..run_seed(3, Some(a2), "r3")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        alpha,
        AgentRunSeed {
            agent_role: Some("reviewer"),
            model: Some("claude-sonnet-5"),
            duration_seconds: Some(1000.0),
            tokens: [Some(1), Some(1), Some(1), Some(1), Some(1), Some(99999)],
            deleted: true,
            ..run_seed(4, Some(a1), "r4")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        beta,
        AgentRunSeed {
            tokens: [Some(1), Some(0), Some(0), Some(1), None, Some(2)],
            ..run_seed(5, Some(b1), "r5")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        beta,
        AgentRunSeed {
            runtime: "codex",
            agent_role: Some("reviewer"),
            model: gpt,
            duration_seconds: Some(2.0),
            tokens: [Some(300), Some(0), Some(0), Some(60), Some(12), Some(360)],
            ..run_seed(6, None, "r6")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        gone,
        AgentRunSeed {
            agent_role: Some("leader"),
            model: opus,
            duration_seconds: Some(50.0),
            tokens: [Some(1), Some(1), Some(1), Some(1), Some(1), Some(5000)],
            ..run_seed(7, None, "r7")
        },
    )
    .await;

    let (status, body) = get(pool.clone(), DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);

    let mut agent_usage = usage_bucket(5, 144.75, [416, 1500, 300, 171, 20, 2387]);
    let extra = json!({
        "byRuntime": {
            "claude": usage_bucket(3, 130.5, [16, 1500, 300, 71, 0, 1887]),
            "codex": usage_bucket(2, 14.25, [400, 0, 0, 100, 20, 500])
        },
        "byModel": [
            with_key("model", json!("claude-opus-5-5"), usage_bucket(2, 130.5, [15, 1500, 300, 70, 0, 1885])),
            with_key("model", json!("gpt-5-codex"), usage_bucket(2, 14.25, [400, 0, 0, 100, 20, 500])),
            with_key("model", Value::Null, usage_bucket(1, 0.0, [1, 0, 0, 1, 0, 2]))
        ],
        "byRole": [
            with_key("role", json!("leader"), usage_bucket(1, 100.0, [10, 1000, 200, 50, 0, 1260])),
            with_key("role", json!("implementer"), usage_bucket(2, 42.75, [105, 500, 100, 60, 8, 765])),
            with_key("role", json!("reviewer"), usage_bucket(1, 2.0, [300, 0, 0, 60, 12, 360])),
            with_key("role", Value::Null, usage_bucket(1, 0.0, [1, 0, 0, 1, 0, 2]))
        ],
        "topProjects": [
            with_key("slug", json!("alpha"), usage_bucket(3, 142.75, [115, 1500, 300, 110, 8, 2025])),
            with_key("slug", json!("beta"), usage_bucket(2, 2.0, [301, 0, 0, 61, 12, 362]))
        ]
    });
    agent_usage
        .as_object_mut()
        .unwrap()
        .extend(extra.as_object().unwrap().clone());

    assert_eq!(
        body,
        json!({
            "overall": {
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
            },
            "topProjects": [
                { "slug": "alpha", "done": 1, "total": 1, "percentage": 100.0 },
                { "slug": "gamma", "done": 0, "total": 1, "percentage": 0.0 }
            ],
            "agentUsage": agent_usage
        })
    );

    for entry in body["agentUsage"]["topProjects"].as_array().unwrap() {
        let slug = entry["slug"].as_str().unwrap();
        let (state_status, _) = get(pool.clone(), &state_path(slug), Some(valid_token())).await;
        assert_eq!(
            state_status,
            StatusCode::OK,
            "state for {slug} must resolve"
        );
    }
}

#[tokio::test]
async fn dashboard_agent_usage_orders_breakdowns_and_ranking() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let p_a = seed_project(&pool, "p-a", None, false).await;
    let p_b = seed_project(&pool, "p-b", None, false).await;
    let p_c = seed_project(&pool, "p-c", None, false).await;
    let p_d = seed_project(&pool, "p-d", None, false).await;

    type OrderRun<'a> = (Uuid, i64, Option<&'a str>, Option<&'a str>, Option<i64>);
    let runs: [OrderRun; 5] = [
        (p_a, 1, Some("m-b"), Some("implementer"), Some(100)),
        (p_b, 2, Some("m-a"), Some("explorer"), Some(100)),
        (p_c, 3, Some("m-z"), Some("reviewer"), Some(300)),
        (p_d, 4, Some("m-c"), Some("leader"), None),
        (p_d, 5, None, None, None),
    ];
    for (project, local_id, model, role, total) in runs {
        let external_id = format!("run-{local_id}");
        seed_agent_run(
            &pool,
            project,
            AgentRunSeed {
                model,
                agent_role: role,
                tokens: [None, None, None, None, None, total],
                ..run_seed(local_id, None, &external_id)
            },
        )
        .await;
    }

    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    let usage = &body["agentUsage"];

    let pick = |arr: &Value, key: &str| -> Vec<Value> {
        arr.as_array()
            .unwrap()
            .iter()
            .map(|e| e[key].clone())
            .collect()
    };
    assert_eq!(
        pick(&usage["topProjects"], "slug"),
        vec![json!("p-c"), json!("p-a"), json!("p-b"), json!("p-d")]
    );
    assert_eq!(
        pick(&usage["byModel"], "model"),
        vec![
            json!("m-z"),
            json!("m-a"),
            json!("m-b"),
            json!("m-c"),
            Value::Null
        ]
    );
    assert_eq!(
        pick(&usage["byRole"], "role"),
        vec![
            json!("reviewer"),
            json!("explorer"),
            json!("implementer"),
            json!("leader"),
            Value::Null
        ]
    );
    assert_eq!(usage["topProjects"][3]["slug"], json!("p-d"));
    assert_eq!(usage["topProjects"][3]["tokens"]["total"], json!(0));
    assert_eq!(usage["topProjects"][3]["runs"], json!(2));
}

#[tokio::test]
async fn dashboard_agent_usage_limits_top_projects_to_ten() {
    let db = TestDb::new().await;
    let pool = db.pool();
    for n in 1..=12_i64 {
        let slug = format!("u{n:02}");
        let project = seed_project(&pool, &slug, None, false).await;
        seed_agent_run(
            &pool,
            project,
            AgentRunSeed {
                tokens: [None, None, None, None, None, Some((13 - n) * 10)],
                ..run_seed(n, None, "run")
            },
        )
        .await;
    }

    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    let usage = &body["agentUsage"];
    let slugs: Vec<&str> = usage["topProjects"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["slug"].as_str().unwrap())
        .collect();
    let expected: Vec<String> = (1..=10).map(|n| format!("u{n:02}")).collect();
    assert_eq!(
        slugs,
        expected.iter().map(String::as_str).collect::<Vec<_>>()
    );
    assert_eq!(usage["runs"], json!(12));
    assert_eq!(usage["tokens"]["total"], json!(780));
}

#[tokio::test]
async fn dashboard_agent_usage_is_empty_when_only_deleted_runs_exist() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let live = seed_project(&pool, "live", None, false).await;
    let gone = seed_project(&pool, "gone", None, true).await;
    seed_feature(&pool, live, 1, "l1", "done", false, false).await;
    seed_agent_run(
        &pool,
        live,
        AgentRunSeed {
            duration_seconds: Some(5.0),
            tokens: [Some(1), Some(1), Some(1), Some(1), Some(1), Some(5)],
            deleted: true,
            ..run_seed(1, None, "deleted-run")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        gone,
        AgentRunSeed {
            duration_seconds: Some(7.0),
            tokens: [Some(1), Some(1), Some(1), Some(1), Some(1), Some(7)],
            ..run_seed(1, None, "orphaned-run")
        },
    )
    .await;

    let (status, body) = get(pool, DASHBOARD_PATH, Some(valid_token())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "overall": {
                "done": 1,
                "total": 1,
                "percentage": 100.0,
                "byStatus": {
                    "pending": 0,
                    "specDrafting": 0,
                    "specReady": 0,
                    "inProgress": 0,
                    "blocked": 0,
                    "done": 1
                }
            },
            "topProjects": [
                { "slug": "live", "done": 1, "total": 1, "percentage": 100.0 }
            ],
            "agentUsage": empty_agent_usage()
        })
    );
}

#[tokio::test]
async fn agent_usage_returns_run_tree_and_totals() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "usage_feat", "done", true, false).await;
    let f = Some(feature);
    let opus = Some("claude-opus-5-5");

    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            parent_external_id: Some("lead"),
            spawn_depth: Some(1),
            agent_role: Some("reviewer"),
            label: Some("review feature"),
            model: opus,
            started_offset_secs: Some(50),
            finished_offset_secs: Some(70),
            duration_seconds: Some(20.0),
            tokens: [Some(3), Some(300), Some(50), Some(15), None, Some(368)],
            ..run_seed(1, f, "rev")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            runtime: "codex",
            parent_external_id: Some("outside-thread"),
            spawn_depth: Some(1),
            agent_role: Some("implementer"),
            model: Some("gpt-5.1-codex"),
            started_offset_secs: Some(200),
            finished_offset_secs: Some(210),
            duration_seconds: Some(10.0),
            tokens: [Some(2), Some(0), Some(0), Some(5), Some(3), Some(7)],
            ..run_seed(2, f, "thread-x")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            parent_external_id: Some("impl"),
            spawn_depth: Some(2),
            agent_role: Some("explorer"),
            label: Some("explore code"),
            model: Some("claude-sonnet-5"),
            started_offset_secs: Some(20),
            finished_offset_secs: Some(30),
            duration_seconds: Some(10.0),
            tokens: [Some(2), Some(200), Some(40), Some(9), None, Some(251)],
            ..run_seed(3, f, "explore")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            spawn_depth: Some(0),
            agent_role: Some("leader"),
            model: opus,
            started_offset_secs: Some(0),
            finished_offset_secs: Some(100),
            duration_seconds: Some(100.0),
            tokens: [Some(10), Some(1000), Some(200), Some(50), None, Some(1260)],
            ..run_seed(4, f, "lead")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            parent_external_id: Some("lead"),
            spawn_depth: Some(1),
            agent_role: Some("implementer"),
            label: Some("implement feature"),
            model: opus,
            started_offset_secs: Some(10),
            finished_offset_secs: Some(40),
            duration_seconds: Some(30.0),
            tokens: [Some(5), Some(500), Some(100), Some(20), None, Some(625)],
            ..run_seed(5, f, "impl")
        },
    )
    .await;

    let (status, body) = get(
        pool.clone(),
        &agent_usage_path("test-project", "usage_feat"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        json!({
            "runs": [
                {
                    "externalId": "lead",
                    "parentExternalId": null,
                    "runtime": "claude",
                    "role": "leader",
                    "label": null,
                    "model": "claude-opus-5-5",
                    "spawnDepth": 0,
                    "startedAt": "2026-01-01T00:00:00+00:00",
                    "finishedAt": "2026-01-01T00:01:40+00:00",
                    "durationSeconds": 100.0,
                    "tokens": { "input": 10, "cacheRead": 1000, "cacheWrite": 200, "output": 50, "reasoning": null, "total": 1260 },
                    "children": [
                        {
                            "externalId": "impl",
                            "parentExternalId": "lead",
                            "runtime": "claude",
                            "role": "implementer",
                            "label": "implement feature",
                            "model": "claude-opus-5-5",
                            "spawnDepth": 1,
                            "startedAt": "2026-01-01T00:00:10+00:00",
                            "finishedAt": "2026-01-01T00:00:40+00:00",
                            "durationSeconds": 30.0,
                            "tokens": { "input": 5, "cacheRead": 500, "cacheWrite": 100, "output": 20, "reasoning": null, "total": 625 },
                            "children": [
                                {
                                    "externalId": "explore",
                                    "parentExternalId": "impl",
                                    "runtime": "claude",
                                    "role": "explorer",
                                    "label": "explore code",
                                    "model": "claude-sonnet-5",
                                    "spawnDepth": 2,
                                    "startedAt": "2026-01-01T00:00:20+00:00",
                                    "finishedAt": "2026-01-01T00:00:30+00:00",
                                    "durationSeconds": 10.0,
                                    "tokens": { "input": 2, "cacheRead": 200, "cacheWrite": 40, "output": 9, "reasoning": null, "total": 251 },
                                    "children": []
                                }
                            ]
                        },
                        {
                            "externalId": "rev",
                            "parentExternalId": "lead",
                            "runtime": "claude",
                            "role": "reviewer",
                            "label": "review feature",
                            "model": "claude-opus-5-5",
                            "spawnDepth": 1,
                            "startedAt": "2026-01-01T00:00:50+00:00",
                            "finishedAt": "2026-01-01T00:01:10+00:00",
                            "durationSeconds": 20.0,
                            "tokens": { "input": 3, "cacheRead": 300, "cacheWrite": 50, "output": 15, "reasoning": null, "total": 368 },
                            "children": []
                        }
                    ]
                },
                {
                    "externalId": "thread-x",
                    "parentExternalId": "outside-thread",
                    "runtime": "codex",
                    "role": "implementer",
                    "label": null,
                    "model": "gpt-5.1-codex",
                    "spawnDepth": 1,
                    "startedAt": "2026-01-01T00:03:20+00:00",
                    "finishedAt": "2026-01-01T00:03:30+00:00",
                    "durationSeconds": 10.0,
                    "tokens": { "input": 2, "cacheRead": 0, "cacheWrite": 0, "output": 5, "reasoning": 3, "total": 7 },
                    "children": []
                }
            ],
            "totals": {
                "effortSeconds": 170.0,
                "unionSeconds": 110.0,
                "tokens": { "input": 22, "cacheRead": 2000, "cacheWrite": 390, "output": 99, "reasoning": 3, "total": 2511 }
            }
        })
    );
}

#[tokio::test]
async fn agent_usage_renders_nulls_and_orders_by_start_then_id() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "null_feat", "done", false, false).await;
    let f = Some(feature);

    seed_agent_run(&pool, project, run_seed(1, f, "n1")).await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            started_offset_secs: Some(0),
            duration_seconds: Some(5.0),
            ..run_seed(2, f, "n2")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            started_offset_secs: Some(10),
            finished_offset_secs: Some(5),
            ..run_seed(3, f, "n3")
        },
    )
    .await;
    let n5 = seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            started_offset_secs: Some(20),
            finished_offset_secs: Some(30),
            ..run_seed(5, f, "n5")
        },
    )
    .await;
    let n4 = seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            started_offset_secs: Some(20),
            finished_offset_secs: Some(30),
            tokens: [Some(7), None, None, None, None, None],
            ..run_seed(4, f, "n4")
        },
    )
    .await;
    assert!(n5 < n4, "n5 must have the lower id");

    let (status, body) = get(
        pool.clone(),
        &agent_usage_path("test-project", "null_feat"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let runs = body["runs"].as_array().expect("runs array");
    let order: Vec<&str> = runs
        .iter()
        .map(|r| r["externalId"].as_str().unwrap())
        .collect();
    assert_eq!(order, vec!["n2", "n3", "n5", "n4", "n1"]);
    assert_eq!(
        runs[4],
        json!({
            "externalId": "n1",
            "parentExternalId": null,
            "runtime": "claude",
            "role": null,
            "label": null,
            "model": null,
            "spawnDepth": null,
            "startedAt": null,
            "finishedAt": null,
            "durationSeconds": null,
            "tokens": { "input": null, "cacheRead": null, "cacheWrite": null, "output": null, "reasoning": null, "total": null },
            "children": []
        })
    );
    assert_eq!(runs[0]["startedAt"], "2026-01-01T00:00:00+00:00");
    assert_eq!(runs[0]["finishedAt"], Value::Null);
    assert_eq!(runs[0]["durationSeconds"], json!(5.0));
    assert_eq!(runs[3]["tokens"]["input"], json!(7));
    assert_eq!(runs[3]["tokens"]["total"], Value::Null);
    assert_eq!(
        body["totals"],
        json!({
            "effortSeconds": 5.0,
            "unionSeconds": 10.0,
            "tokens": { "input": 7, "cacheRead": 0, "cacheWrite": 0, "output": 0, "reasoning": 0, "total": 0 }
        })
    );
}

#[tokio::test]
async fn agent_usage_places_runs_without_a_parent_at_root() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "orphan_feat", "done", false, false).await;
    let other = seed_feature(&pool, project, 2, "other_feat", "done", false, false).await;
    let f = Some(feature);

    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            runtime: "codex",
            spawn_depth: Some(0),
            started_offset_secs: Some(0),
            ..run_seed(1, f, "codex-lead")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            spawn_depth: Some(0),
            started_offset_secs: Some(1),
            ..run_seed(2, Some(other), "other-lead")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            spawn_depth: Some(0),
            started_offset_secs: Some(5),
            deleted: true,
            ..run_seed(3, f, "gone")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            parent_external_id: Some("self"),
            spawn_depth: Some(1),
            started_offset_secs: Some(10),
            ..run_seed(4, f, "self")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            parent_external_id: Some("codex-lead"),
            spawn_depth: Some(2),
            started_offset_secs: Some(20),
            ..run_seed(5, f, "cross")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            parent_external_id: Some("gone"),
            spawn_depth: Some(1),
            started_offset_secs: Some(30),
            ..run_seed(6, f, "child-of-gone")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            parent_external_id: Some("other-lead"),
            spawn_depth: Some(1),
            started_offset_secs: Some(40),
            ..run_seed(7, f, "elsewhere")
        },
    )
    .await;

    let (status, body) = get(
        pool.clone(),
        &agent_usage_path("test-project", "orphan_feat"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let roots: Vec<(String, Value, usize)> = body["runs"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| {
            (
                r["externalId"].as_str().unwrap().to_string(),
                r["spawnDepth"].clone(),
                r["children"].as_array().unwrap().len(),
            )
        })
        .collect();
    assert_eq!(
        roots,
        vec![
            ("codex-lead".to_string(), json!(0), 0),
            ("self".to_string(), json!(1), 0),
            ("cross".to_string(), json!(2), 0),
            ("child-of-gone".to_string(), json!(1), 0),
            ("elsewhere".to_string(), json!(1), 0),
        ]
    );
}

#[tokio::test]
async fn agent_usage_breaks_parent_cycles_at_the_earliest_run() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "cycle_feat", "done", false, false).await;
    let f = Some(feature);

    for (local_id, ext, parent, start) in [(1, "b", "a", 10), (2, "c", "a", 5), (3, "a", "b", 0)] {
        seed_agent_run(
            &pool,
            project,
            AgentRunSeed {
                parent_external_id: Some(parent),
                started_offset_secs: Some(start),
                ..run_seed(local_id, f, ext)
            },
        )
        .await;
    }

    let (status, body) = get(
        pool.clone(),
        &agent_usage_path("test-project", "cycle_feat"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let runs = body["runs"].as_array().unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0]["externalId"], "a");
    let children: Vec<(&str, usize)> = runs[0]["children"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| {
            (
                c["externalId"].as_str().unwrap(),
                c["children"].as_array().unwrap().len(),
            )
        })
        .collect();
    assert_eq!(children, vec![("c", 0), ("b", 0)]);

    let text = body.to_string();
    for ext in ["a", "b", "c"] {
        assert_eq!(
            text.matches(&format!(r#""externalId":"{ext}""#)).count(),
            1,
            "{ext} must appear exactly once"
        );
    }
}

#[tokio::test]
async fn agent_usage_excludes_deleted_runs_and_other_features() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "test-project", None, false).await;
    let other_project = seed_project(&pool, "other-project", None, false).await;
    let target = seed_feature(&pool, project, 1, "shared_name", "done", false, false).await;
    let sibling = seed_feature(&pool, project, 2, "sibling_feat", "done", false, false).await;
    let foreign = seed_feature(&pool, other_project, 1, "shared_name", "done", false, false).await;

    let noisy = |local_id, feature_id, ext, deleted| AgentRunSeed {
        started_offset_secs: Some(1000),
        finished_offset_secs: Some(2000),
        duration_seconds: Some(1000.0),
        tokens: [Some(100); 6],
        deleted,
        ..run_seed(local_id, feature_id, ext)
    };

    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            started_offset_secs: Some(0),
            finished_offset_secs: Some(30),
            duration_seconds: Some(30.0),
            tokens: [Some(1), Some(2), Some(3), Some(4), Some(5), Some(10)],
            ..run_seed(1, Some(target), "live")
        },
    )
    .await;
    seed_agent_run(&pool, project, noisy(2, Some(target), "deleted", true)).await;
    seed_agent_run(&pool, project, noisy(3, Some(sibling), "sibling", false)).await;
    seed_agent_run(&pool, project, noisy(4, None, "unattributed", false)).await;
    seed_agent_run(
        &pool,
        other_project,
        noisy(1, Some(foreign), "foreign", false),
    )
    .await;

    let (status, body) = get(
        pool.clone(),
        &agent_usage_path("test-project", "shared_name"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    let runs = body["runs"].as_array().unwrap();
    let ids: Vec<&str> = runs
        .iter()
        .map(|r| r["externalId"].as_str().unwrap())
        .collect();
    assert_eq!(ids, vec!["live"]);
    assert_eq!(
        body["totals"],
        json!({
            "effortSeconds": 30.0,
            "unionSeconds": 30.0,
            "tokens": { "input": 1, "cacheRead": 2, "cacheWrite": 3, "output": 4, "reasoning": 5, "total": 10 }
        })
    );
}

#[tokio::test]
async fn agent_usage_with_no_runs_returns_empty_tree_and_zero_totals() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "quiet_feat", "done", false, false).await;
    seed_session(
        &pool,
        project,
        SessionSeed {
            local_id: 1,
            feature_id: Some(feature),
            agent: "implementer",
            started_minutes_ago: 5,
            next_step: &[],
            closed: true,
            paused: false,
        },
    )
    .await;

    let (status, body) = get_text(
        pool.clone(),
        &agent_usage_path("test-project", "quiet_feat"),
        Some(valid_token()),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body,
        r#"{"runs":[],"totals":{"effortSeconds":0.0,"unionSeconds":0.0,"tokens":{"input":0,"cacheRead":0,"cacheWrite":0,"output":0,"reasoning":0,"total":0}}}"#
    );
}

#[tokio::test]
async fn agent_usage_for_unknown_or_deleted_project_returns_404() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let deleted = seed_project(&pool, "deleted-project", None, true).await;
    seed_feature(&pool, deleted, 1, "some_feat", "done", false, false).await;
    let alive = seed_project(&pool, "alive-project", None, false).await;
    seed_feature(&pool, alive, 1, "some_feat", "done", false, false).await;

    for slug in ["missing-project", "deleted-project"] {
        let (status, body) = get(
            pool.clone(),
            &agent_usage_path(slug, "some_feat"),
            Some(valid_token()),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "slug {slug}");
        assert_eq!(body, json!({ "error": "not found" }), "slug {slug}");
    }
}

#[tokio::test]
async fn agent_usage_for_unknown_or_deleted_feature_returns_404() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "test-project", None, false).await;
    seed_feature(&pool, project, 1, "alive_feat", "done", false, false).await;
    seed_feature(&pool, project, 2, "deleted_feat", "done", false, true).await;

    for name in ["missing-feat", "deleted_feat", "Alive_feat"] {
        let (status, body) = get(
            pool.clone(),
            &agent_usage_path("test-project", name),
            Some(valid_token()),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "name {name}");
        assert_eq!(body, json!({ "error": "not found" }), "name {name}");
    }
}

#[tokio::test]
async fn agent_usage_does_not_cross_projects() {
    let db = TestDb::new().await;
    let pool = db.pool();
    seed_project(&pool, "project-a", None, false).await;
    let b = seed_project(&pool, "project-b", None, false).await;
    let feature = seed_feature(&pool, b, 1, "b_only", "done", false, false).await;
    seed_agent_run(&pool, b, run_seed(1, Some(feature), "run-b")).await;

    let (status, body) = get(
        pool.clone(),
        &agent_usage_path("project-a", "b_only"),
        Some(valid_token()),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body, json!({ "error": "not found" }));

    let (b_status, b_body) = get(
        pool.clone(),
        &agent_usage_path("project-b", "b_only"),
        Some(valid_token()),
    )
    .await;
    assert_eq!(b_status, StatusCode::OK);
    assert_eq!(b_body["runs"][0]["externalId"], "run-b");
}

#[tokio::test]
async fn feature_log_is_unchanged_when_agent_runs_exist() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "test-project", None, false).await;
    let feature = seed_feature(&pool, project, 1, "logged_feat", "done", true, false).await;
    let session = seed_session(
        &pool,
        project,
        SessionSeed {
            local_id: 1,
            feature_id: Some(feature),
            agent: "implementer",
            started_minutes_ago: 5,
            next_step: &["next"],
            closed: true,
            paused: false,
        },
    )
    .await;
    seed_entry(&pool, session, 1, "note", 1, false).await;

    let path = log_path("test-project", "logged_feat");
    let (before_status, before) = get(pool.clone(), &path, Some(valid_token())).await;

    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            started_offset_secs: Some(0),
            finished_offset_secs: Some(10),
            ..run_seed(1, Some(feature), "lead")
        },
    )
    .await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            parent_external_id: Some("lead"),
            ..run_seed(2, Some(feature), "child")
        },
    )
    .await;

    let (after_status, after) = get(pool.clone(), &path, Some(valid_token())).await;

    assert_eq!(before_status, StatusCode::OK);
    assert_eq!(after_status, StatusCode::OK);
    assert_eq!(after, before);
    let mut keys: Vec<&String> = after.as_object().unwrap().keys().collect();
    keys.sort();
    assert_eq!(keys, vec!["feature", "sessions"]);
}

#[tokio::test]
async fn test_schema_reproduces_toolkit_agent_runs() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let columns: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT column_name::text, data_type::text, is_nullable::text, column_default::text
         FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'agent_runs'
         ORDER BY ordinal_position",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let col = |name: &str, ty: &str, nullable: &str, default: Option<&str>| {
        (
            name.to_string(),
            ty.to_string(),
            nullable.to_string(),
            default.map(str::to_string),
        )
    };
    let tstz = "timestamp with time zone";
    assert_eq!(
        columns,
        vec![
            col(
                "id",
                "bigint",
                "NO",
                Some("nextval('agent_runs_id_seq'::regclass)")
            ),
            col("project_id", "uuid", "NO", None),
            col("local_id", "bigint", "NO", None),
            col("session_id", "bigint", "YES", None),
            col("feature_id", "bigint", "YES", None),
            col("runtime", "text", "NO", None),
            col("agent_role", "text", "YES", None),
            col("label", "text", "YES", None),
            col("external_id", "text", "NO", None),
            col("parent_external_id", "text", "YES", None),
            col("spawn_depth", "integer", "YES", None),
            col("model", "text", "YES", None),
            col("started_at", tstz, "YES", None),
            col("finished_at", tstz, "YES", None),
            col("duration_seconds", "double precision", "YES", None),
            col("input_tokens", "bigint", "YES", None),
            col("cache_read_tokens", "bigint", "YES", None),
            col("cache_write_tokens", "bigint", "YES", None),
            col("output_tokens", "bigint", "YES", None),
            col("reasoning_tokens", "bigint", "YES", None),
            col("total_tokens", "bigint", "YES", None),
            col("created_at", tstz, "NO", Some("now()")),
            col("updated_at", tstz, "NO", Some("now()")),
            col("deleted_at", tstz, "YES", None),
        ]
    );

    let constraints: Vec<String> = sqlx::query_scalar(
        "SELECT pg_get_constraintdef(oid)
         FROM pg_constraint
         WHERE conrelid = 'agent_runs'::regclass
         ORDER BY 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let mut expected_constraints = vec![
        "PRIMARY KEY (id)",
        "FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE",
        "FOREIGN KEY (session_id) REFERENCES session_log(id) ON DELETE SET NULL",
        "FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE SET NULL",
        "CHECK ((runtime = ANY (ARRAY['claude'::text, 'codex'::text])))",
    ];
    expected_constraints.sort();
    let mut actual_constraints = constraints.clone();
    actual_constraints.sort();
    assert_eq!(actual_constraints, expected_constraints);

    let schema: String = sqlx::query_scalar("SELECT current_schema()::text")
        .fetch_one(&pool)
        .await
        .unwrap();
    let indexes: Vec<(String, String)> = sqlx::query_as(
        "SELECT indexname::text, indexdef
         FROM pg_indexes
         WHERE schemaname = current_schema() AND tablename = 'agent_runs'
         ORDER BY indexname",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let idx = |name: &str, def: String| (name.to_string(), def);
    assert_eq!(
        indexes,
        vec![
            idx(
                "agent_runs_external_active",
                format!("CREATE UNIQUE INDEX agent_runs_external_active ON {schema}.agent_runs USING btree (project_id, runtime, external_id) WHERE (deleted_at IS NULL)"),
            ),
            idx(
                "agent_runs_local_id",
                format!("CREATE UNIQUE INDEX agent_runs_local_id ON {schema}.agent_runs USING btree (project_id, local_id)"),
            ),
            idx(
                "agent_runs_pkey",
                format!("CREATE UNIQUE INDEX agent_runs_pkey ON {schema}.agent_runs USING btree (id)"),
            ),
            idx(
                "idx_agent_runs_feature",
                format!("CREATE INDEX idx_agent_runs_feature ON {schema}.agent_runs USING btree (feature_id, started_at)"),
            ),
            idx(
                "idx_agent_runs_session",
                format!("CREATE INDEX idx_agent_runs_session ON {schema}.agent_runs USING btree (session_id)"),
            ),
        ]
    );

    let view_columns: Vec<String> = sqlx::query_scalar(
        "SELECT column_name::text
         FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'active_agent_runs'
         ORDER BY ordinal_position",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    let table_columns: Vec<String> = columns.into_iter().map(|c| c.0).collect();
    assert_eq!(view_columns, table_columns);

    let project = seed_project(&pool, "test-project", None, false).await;
    seed_agent_run(&pool, project, run_seed(1, None, "live")).await;
    seed_agent_run(
        &pool,
        project,
        AgentRunSeed {
            deleted: true,
            ..run_seed(2, None, "deleted")
        },
    )
    .await;
    let active: i64 = sqlx::query_scalar("SELECT count(*) FROM active_agent_runs")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(active, 1);
}

fn listed(slug: &str, name: &str, status: &str) -> Value {
    json!({
        "projectSlug": slug,
        "name": name,
        "title": format!("Title of {name}"),
        "status": status,
    })
}

/// `alpha` gets two live features per status (except `in_progress`, which the
/// schema caps at one per project), inserted out of `feature_number` order.
#[tokio::test]
async fn features_by_status_filters_each_status_across_projects() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let statuses = [
        "pending",
        "spec_drafting",
        "spec_ready",
        "in_progress",
        "blocked",
        "done",
    ];
    let beta = seed_project(&pool, "beta", None, false).await;
    let alpha = seed_project(&pool, "alpha", None, false).await;
    let ghost = seed_project(&pool, "ghost", None, true).await;
    for (i, status) in statuses.iter().enumerate() {
        let n = i as i32 * 10;
        let beta_name = format!("beta-{status}");
        seed_feature(&pool, beta, n + 1, &beta_name, status, false, false).await;
        if *status != "in_progress" {
            let second = format!("alpha-{status}-2");
            seed_feature(&pool, alpha, n + 2, &second, status, false, false).await;
        }
        let first = format!("alpha-{status}-1");
        seed_feature(&pool, alpha, n + 1, &first, status, false, false).await;
        let gone = format!("alpha-{status}-gone");
        seed_feature(&pool, alpha, n + 3, &gone, status, false, true).await;
        let ghost_name = format!("ghost-{status}");
        seed_feature(&pool, ghost, n + 1, &ghost_name, status, false, false).await;
    }
    seed_feature(
        &pool,
        alpha,
        99,
        "alpha-superseded",
        "superseded",
        false,
        false,
    )
    .await;

    for status in statuses {
        let mut expected = vec![listed("alpha", &format!("alpha-{status}-1"), status)];
        if status != "in_progress" {
            expected.push(listed("alpha", &format!("alpha-{status}-2"), status));
        }
        expected.push(listed("beta", &format!("beta-{status}"), status));

        let uri = format!("{FEATURES_PATH}?status={status}");
        let (code, body) = get(pool.clone(), &uri, Some(valid_token())).await;
        assert_eq!(code, StatusCode::OK, "{status}");
        assert_eq!(body, Value::Array(expected), "{status}");
    }
}

#[tokio::test]
async fn features_by_status_returns_empty_list_when_nothing_matches() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "alpha", None, false).await;
    seed_feature(&pool, project, 1, "only_done", "done", false, false).await;
    seed_feature(&pool, project, 2, "deleted_blocked", "blocked", false, true).await;

    let uri = format!("{FEATURES_PATH}?status=blocked");
    let (code, body) = get(pool, &uri, Some(valid_token())).await;
    assert_eq!(code, StatusCode::OK);
    assert_eq!(body, json!([]));
}

#[tokio::test]
async fn features_by_status_rejects_missing_or_invalid_status() {
    let db = TestDb::new().await;
    let pool = db.pool();
    let project = seed_project(&pool, "alpha", None, false).await;
    seed_feature(&pool, project, 1, "old", "superseded", false, false).await;

    for uri in [
        FEATURES_PATH.to_string(),
        format!("{FEATURES_PATH}?status="),
        format!("{FEATURES_PATH}?status=bogus"),
        format!("{FEATURES_PATH}?status=superseded"),
        format!("{FEATURES_PATH}?status=inProgress"),
        format!("{FEATURES_PATH}?status=DONE"),
        format!("{FEATURES_PATH}?status=done%27%20OR%201=1"),
    ] {
        let (code, body) = get(pool.clone(), &uri, Some(valid_token())).await;
        assert_eq!(code, StatusCode::BAD_REQUEST, "{uri}");
        assert_eq!(body, json!({ "error": "bad request" }), "{uri}");
    }
}

/// Feature 12 regression: test databases must be unique per invocation, not per
/// test path, so concurrent `cargo test` processes cannot collide on them, and
/// each one must be dropped when its owner goes out of scope.
#[tokio::test]
async fn test_db_names_are_unique_per_invocation_and_dropped_after_use() {
    let first = TestDb::new().await;
    let second = TestDb::new().await;
    assert_ne!(first.name(), second.name());

    let admin = PgPool::connect(&std::env::var("DATABASE_URL").unwrap())
        .await
        .unwrap();
    let exists = |name: String| {
        let admin = admin.clone();
        async move {
            sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)",
            )
            .bind(name)
            .fetch_one(&admin)
            .await
            .unwrap()
        }
    };

    let projects: i64 = sqlx::query_scalar("SELECT count(*) FROM projects")
        .fetch_one(&first.pool())
        .await
        .unwrap();
    assert_eq!(projects, 0, "each test database starts migrated and empty");

    let first_name = first.name().to_string();
    assert!(exists(first_name.clone()).await);
    drop(first);
    assert!(
        !exists(first_name).await,
        "dropped TestDb must remove its database"
    );
    assert!(exists(second.name().to_string()).await);
}
