use axum::Router;
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use sqlx::PgPool;

use harness_frontend_backend::app::build_app;
use harness_frontend_backend::auth::jwt::Claims;
use harness_frontend_backend::config::Config;

/// Single source of truth for the test fixture's `Config`. Every integration
/// test that builds the app under test (including the CORS regression tests in
/// `tests/cors.rs`) goes through `build_test_config`, so the test app's
/// `frontend_origin`, `supabase_jwt_secret`, and `project_slug` are guaranteed
/// to agree with the constants in this module — no test ever hardcodes an
/// `FRONTEND_ORIGIN` literal that could silently drift away from what the app
/// is actually configured with.
pub const TEST_JWT_SECRET: &str = "test-jwt-secret-for-integration-tests";
pub const TEST_PROJECT_SLUG: &str = "test-project";
pub const TEST_FRONTEND_ORIGIN: &str = "http://localhost:4200";

pub fn build_test_config() -> Config {
    Config {
        port: 0,
        database_url: "unused".to_string(),
        supabase_jwt_secret: TEST_JWT_SECRET.to_string(),
        frontend_origin: TEST_FRONTEND_ORIGIN.to_string(),
        project_slug: TEST_PROJECT_SLUG.to_string(),
    }
}

pub async fn build_test_app(pool: PgPool) -> Router {
    build_app(pool, build_test_config())
}

pub fn make_token(secret: &str, exp_offset: i64, aud: &str) -> String {
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

pub fn valid_token() -> String {
    make_token(TEST_JWT_SECRET, 3600, "authenticated")
}
