// Each integration test crate uses a different subset of these helpers.
#![allow(dead_code)]

use std::collections::HashMap;

use argon2::password_hash::PasswordHasher;
use argon2::{Algorithm, Argon2, Params, Version};
use axum::Router;
use chrono::Utc;
use jsonwebtoken::{encode, EncodingKey, Header};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

use harness_frontend_backend::app::build_app;
use harness_frontend_backend::auth::jwt::Claims;
use harness_frontend_backend::auth::local_token::LocalClaims;
use harness_frontend_backend::config::{AuthConfig, Config};

/// Single source of truth for the test fixture's `Config`. Every integration
/// test that builds the app under test (including the CORS regression tests in
/// `tests/cors.rs`) goes through `build_test_config` or
/// `build_test_config_local`, so the test app's `frontend_origin` and secrets
/// are guaranteed to agree with the constants in this module — no test ever
/// hardcodes an `FRONTEND_ORIGIN` literal that could silently drift away from
/// what the app is actually configured with.
pub const TEST_JWT_SECRET: &str = "test-jwt-secret-for-integration-tests";
pub const TEST_FRONTEND_ORIGIN: &str = "http://localhost:4200";

pub const TEST_LOCAL_SECRET: &str = "test-local-secret-for-integration-tests!!";
pub const TEST_LOCAL_EMAIL: &str = "alice@example.com";
pub const TEST_LOCAL_PASSWORD: &str = "correct horse battery staple";
pub const TEST_LOCAL_TTL_SECS: u64 = 900;

pub fn build_test_config() -> Config {
    Config {
        port: 0,
        database_url: "unused".to_string(),
        frontend_origin: TEST_FRONTEND_ORIGIN.to_string(),
        auth: AuthConfig::Supabase {
            jwt_secret: TEST_JWT_SECRET.to_string(),
        },
    }
}

pub fn cheap_hash(password: &str) -> String {
    Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        Params::new(8, 1, 1, None).unwrap(),
    )
    .hash_password(password.as_bytes())
    .unwrap()
    .to_string()
}

pub fn build_test_config_local() -> Config {
    let vars: HashMap<&str, String> = HashMap::from([
        ("DATABASE_URL", "unused".to_string()),
        ("FRONTEND_ORIGIN", TEST_FRONTEND_ORIGIN.to_string()),
        ("AUTH_MODE", "local".to_string()),
        ("LOCAL_AUTH_SECRET", TEST_LOCAL_SECRET.to_string()),
        (
            "LOCAL_AUTH_USERS",
            format!("{TEST_LOCAL_EMAIL}:{}", cheap_hash(TEST_LOCAL_PASSWORD)),
        ),
        (
            "LOCAL_AUTH_TOKEN_TTL_SECONDS",
            TEST_LOCAL_TTL_SECS.to_string(),
        ),
    ]);
    Config::from_lookup(|k| vars.get(k).cloned()).expect("local test config must load")
}

pub fn build_test_app_with(pool: PgPool, config: Config) -> Router {
    build_app(pool, config)
}

pub async fn build_test_app(pool: PgPool) -> Router {
    build_app(pool, build_test_config())
}

pub fn lazy_pool() -> PgPool {
    PgPoolOptions::new()
        .connect_lazy("postgres://unused@localhost/unused")
        .unwrap()
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

pub fn make_local_token(secret: &str, exp_offset: i64, aud: &str, iss: &str) -> String {
    let now = Utc::now().timestamp();
    let claims = LocalClaims {
        sub: TEST_LOCAL_EMAIL.to_string(),
        email: TEST_LOCAL_EMAIL.to_string(),
        iss: iss.to_string(),
        aud: aud.to_string(),
        iat: now as u64,
        exp: (now + exp_offset) as u64,
    };
    encode(
        &Header::new(jsonwebtoken::Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .unwrap()
}
