use axum::body::Body;
use axum::http::{Request, StatusCode};
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;

use harness_frontend_backend::app::build_app;
use harness_frontend_backend::auth::jwt::Claims;
use harness_frontend_backend::config::Config;
use harness_frontend_backend::harness::reader::read_harness_state;

const TEST_JWT_SECRET: &str = "test-jwt-secret-for-integration-tests";
const TEST_PROJECT_SLUG: &str = "test-project";
const OTHER_JWT_SECRET: &str = "other-jwt-secret-not-valid";

fn build_test_config() -> Config {
    Config {
        port: 0,
        database_url: "unused".to_string(),
        supabase_jwt_secret: TEST_JWT_SECRET.to_string(),
        frontend_origin: "http://localhost:4200".to_string(),
        project_slug: TEST_PROJECT_SLUG.to_string(),
    }
}

async fn build_test_app(pool: PgPool) -> axum::Router {
    build_app(pool, build_test_config())
}

fn make_token(secret: &str, exp_offset: i64, aud: &str) -> String {
    let exp = (Utc::now().timestamp() + exp_offset) as usize;
    let claims = Claims {
        sub: "user-1".to_string(),
        exp,
        aud: aud.to_string(),
    };
    encode(
        &Header::new(jsonwebtoken::Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .unwrap()
}

#[sqlx::test]
async fn state_with_valid_token_returns_200_and_seeded_data(pool: PgPool) {
    sqlx::query("INSERT INTO projects (slug, description) VALUES ($1, $2)")
        .bind(TEST_PROJECT_SLUG)
        .bind("test desc")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        "INSERT INTO features (project_id, feature_number, name, title, description, sdd, status)
         SELECT id, $2, $3, $4, $5, $6, $7 FROM projects WHERE slug = $1",
    )
    .bind(TEST_PROJECT_SLUG)
    .bind(1_i32)
    .bind("first_feat")
    .bind("First feature")
    .bind("first")
    .bind(true)
    .bind("in_progress")
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO features (project_id, feature_number, name, title, description, sdd, status)
         SELECT id, $2, $3, $4, $5, $6, $7 FROM projects WHERE slug = $1",
    )
    .bind(TEST_PROJECT_SLUG)
    .bind(2_i32)
    .bind("second_feat")
    .bind("Second feature")
    .bind("second")
    .bind(false)
    .bind("done")
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO session_log (project_id, feature_id, agent, started_at, plan, next_step)
         SELECT p.id, f.id, $3, $4, '[]'::jsonb, $5
         FROM projects p JOIN features f ON f.project_id = p.id
         WHERE p.slug = $1 AND f.name = $2",
    )
    .bind(TEST_PROJECT_SLUG)
    .bind("first_feat")
    .bind("implementer")
    .bind(Utc::now())
    .bind(serde_json::json!(["T1 next"]))
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO blocked_features (feature_id, note)
         SELECT f.id, $2 FROM features f JOIN projects p ON p.id = f.project_id
         WHERE p.slug = $1 AND f.name = 'first_feat'",
    )
    .bind(TEST_PROJECT_SLUG)
    .bind("waiting on X")
    .execute(&pool)
    .await
    .unwrap();

    let app = build_test_app(pool).await;
    let token = make_token(TEST_JWT_SECRET, 3600, "authenticated");

    let req = Request::builder()
        .method("GET")
        .uri("/api/harness/state")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&body_bytes).unwrap();

    assert_eq!(body["project"]["slug"], TEST_PROJECT_SLUG);
    assert_eq!(body["features"].as_array().unwrap().len(), 2);
    assert_eq!(body["features"][0]["name"], "first_feat");
    assert_eq!(body["features"][0]["status"], "in_progress");
    assert_eq!(body["features"][0]["sdd"], true);
    assert_eq!(body["openSession"]["agent"], "implementer");
    assert_eq!(body["openSession"]["feature"], "first_feat");
    assert_eq!(body["openSession"]["nextStep"], "T1 next");
    assert_eq!(body["blockedFeatures"].as_array().unwrap().len(), 1);
    assert_eq!(body["blockedFeatures"][0]["name"], "first_feat");
    assert_eq!(body["blockedFeatures"][0]["note"], "waiting on X");
}

#[sqlx::test]
async fn state_without_auth_header_returns_401_and_no_state(pool: PgPool) {
    let app = build_test_app(pool).await;
    let req = Request::builder()
        .method("GET")
        .uri("/api/harness/state")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    let body_bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(body["error"], "unauthorized");
    assert!(body.get("project").is_none());
    assert!(body.get("features").is_none());
}

#[sqlx::test]
async fn state_with_wrong_signature_returns_401(pool: PgPool) {
    let app = build_test_app(pool).await;
    let token = make_token(OTHER_JWT_SECRET, 3600, "authenticated");
    let req = Request::builder()
        .method("GET")
        .uri("/api/harness/state")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    let body_bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(body["error"], "unauthorized");
    assert!(body.get("features").is_none());
}

#[sqlx::test]
async fn state_with_expired_token_returns_401(pool: PgPool) {
    let app = build_test_app(pool).await;
    let token = make_token(TEST_JWT_SECRET, -3600, "authenticated");
    let req = Request::builder()
        .method("GET")
        .uri("/api/harness/state")
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();

    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    let body_bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(body["error"], "unauthorized");
    assert!(body.get("features").is_none());
}

/// The reader must be SELECT-only: snapshot the per-table modification counters
/// in `pg_stat_user_tables` (which only advances for DML, not for SELECT), run
/// the reader, and assert nothing changed. This is the contributor-visible
/// enforcement of R5 — the route under test must not issue any INSERT, UPDATE,
/// or DELETE against the harness schema.
#[sqlx::test]
async fn reader_performs_only_select_queries(pool: PgPool) -> sqlx::Result<()> {
    sqlx::query("INSERT INTO projects (slug, description) VALUES ($1, '') ON CONFLICT DO NOTHING")
        .bind(TEST_PROJECT_SLUG)
        .execute(&pool)
        .await?;

    let stats_before: Vec<(String, i64, i64, i64)> = sqlx::query_as(
        "SELECT relname, n_tup_ins, n_tup_upd, n_tup_del
         FROM pg_stat_user_tables
         WHERE schemaname = current_schema()",
    )
    .fetch_all(&pool)
    .await?;

    // Run the reader directly — this is the same function the route handler
    // calls. We do not mock the router.
    let _response = read_harness_state(&pool, TEST_PROJECT_SLUG)
        .await
        .expect("reader should succeed against the seeded schema");

    let stats_after: Vec<(String, i64, i64, i64)> = sqlx::query_as(
        "SELECT relname, n_tup_ins, n_tup_upd, n_tup_del
         FROM pg_stat_user_tables
         WHERE schemaname = current_schema()",
    )
    .fetch_all(&pool)
    .await?;

    // `pg_stat_user_tables` may report a row we didn't see before (lazy
    // statistics collection), but the counts for any row we *did* see must
    // not have increased.
    for before in &stats_before {
        let after = stats_after
            .iter()
            .find(|(name, _, _, _)| name == &before.0)
            .expect("table that existed before must still exist");
        assert_eq!(
            after.1, before.1,
            "table {} had n_tup_ins advance from {} to {}",
            before.0, before.1, after.1
        );
        assert_eq!(
            after.2, before.2,
            "table {} had n_tup_upd advance from {} to {}",
            before.0, before.2, after.2
        );
        assert_eq!(
            after.3, before.3,
            "table {} had n_tup_del advance from {} to {}",
            before.0, before.3, after.3
        );
    }

    Ok(())
}
