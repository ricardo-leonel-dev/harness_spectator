use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use axum::Router;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::ServiceExt;

mod common;

use common::{
    build_test_app_with, build_test_config, build_test_config_local, lazy_pool, make_local_token,
    valid_token, TEST_JWT_SECRET, TEST_LOCAL_EMAIL, TEST_LOCAL_PASSWORD, TEST_LOCAL_SECRET,
    TEST_LOCAL_TTL_SECS,
};
use harness_frontend_backend::auth::local_token::{LOCAL_TOKEN_AUDIENCE, LOCAL_TOKEN_ISSUER};

const PROJECTS: &str = "/api/harness/projects";

fn local_app() -> Router {
    build_test_app_with(lazy_pool(), build_test_config_local())
}

fn supabase_app() -> Router {
    build_test_app_with(lazy_pool(), build_test_config())
}

async fn send(app: Router, req: Request<Body>) -> (StatusCode, Vec<u8>) {
    let resp = app.oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap()
        .to_vec();
    (status, bytes)
}

fn json_body(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).expect("body must be JSON")
}

fn login_request(body: &str) -> Request<Body> {
    Request::builder()
        .method(Method::POST)
        .uri("/api/auth/login")
        .header("Content-Type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn login_json(email: &str, password: &str) -> Request<Body> {
    login_request(&json!({ "email": email, "password": password }).to_string())
}

fn get_with_token(uri: &str, token: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .header("Authorization", format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

async fn assert_projects_unauthorized(app: Router, token: &str) {
    let (status, body) = send(app, get_with_token(PROJECTS, token)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(json_body(&body), json!({ "error": "unauthorized" }));
}

#[tokio::test]
async fn mode_endpoint_reports_supabase() {
    let req = Request::builder()
        .uri("/api/auth/mode")
        .body(Body::empty())
        .unwrap();
    let (status, body) = send(supabase_app(), req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, br#"{"mode":"supabase"}"#);
}

#[tokio::test]
async fn mode_endpoint_reports_local() {
    let req = Request::builder()
        .uri("/api/auth/mode")
        .body(Body::empty())
        .unwrap();
    let (status, body) = send(local_app(), req).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, br#"{"mode":"local"}"#);
}

#[tokio::test]
async fn login_returns_token_with_expected_claims() {
    let (status, body) = send(
        local_app(),
        login_json(" Alice@Example.com ", TEST_LOCAL_PASSWORD),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let body = json_body(&body);
    let object = body.as_object().expect("login body must be an object");
    let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(keys, ["accessToken", "expiresAt"]);
    let token = body["accessToken"].as_str().expect("accessToken string");
    let expires_at = body["expiresAt"].as_u64().expect("expiresAt integer");

    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[LOCAL_TOKEN_AUDIENCE]);
    validation.leeway = 0;
    let data = decode::<Value>(
        token,
        &DecodingKey::from_secret(TEST_LOCAL_SECRET.as_bytes()),
        &validation,
    )
    .expect("token must verify with LOCAL_AUTH_SECRET and HS256");
    assert_eq!(data.header.alg, Algorithm::HS256);

    let claims = data.claims.as_object().unwrap();
    let mut claim_names: Vec<&str> = claims.keys().map(String::as_str).collect();
    claim_names.sort_unstable();
    assert_eq!(claim_names, ["aud", "email", "exp", "iat", "iss", "sub"]);
    assert_eq!(claims["sub"], TEST_LOCAL_EMAIL);
    assert_eq!(claims["email"], TEST_LOCAL_EMAIL);
    assert_eq!(claims["iss"], "harness-spectator");
    assert_eq!(claims["aud"], "harness-spectator-local");
    let iat = claims["iat"].as_u64().unwrap();
    let exp = claims["exp"].as_u64().unwrap();
    assert_eq!(exp - iat, TEST_LOCAL_TTL_SECS);
    assert_eq!(expires_at, exp);
}

#[tokio::test]
async fn login_rejects_wrong_password_and_unknown_email_identically() {
    let (wrong_status, wrong_body) =
        send(local_app(), login_json(TEST_LOCAL_EMAIL, "wrong password")).await;
    let (unknown_status, unknown_body) = send(
        local_app(),
        login_json("nobody@example.com", TEST_LOCAL_PASSWORD),
    )
    .await;

    assert_eq!(wrong_status, StatusCode::UNAUTHORIZED);
    assert_eq!(unknown_status, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong_body, br#"{"error":"unauthorized"}"#);
    assert_eq!(wrong_body, unknown_body);
}

#[tokio::test]
async fn login_rejects_malformed_body_with_400() {
    let no_content_type = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/login")
        .body(Body::from(
            json!({ "email": TEST_LOCAL_EMAIL, "password": TEST_LOCAL_PASSWORD }).to_string(),
        ))
        .unwrap();
    let text_content_type = Request::builder()
        .method(Method::POST)
        .uri("/api/auth/login")
        .header("Content-Type", "text/plain")
        .body(Body::from(
            json!({ "email": TEST_LOCAL_EMAIL, "password": TEST_LOCAL_PASSWORD }).to_string(),
        ))
        .unwrap();
    let cases = [
        ("invalid JSON", login_request("{not json")),
        (
            "missing password",
            login_request(&json!({ "email": TEST_LOCAL_EMAIL }).to_string()),
        ),
        (
            "numeric email",
            login_request(&json!({ "email": 42, "password": "pw" }).to_string()),
        ),
        ("array body", login_request("[]")),
        ("no Content-Type", no_content_type),
        ("non-JSON Content-Type", text_content_type),
    ];
    for (name, req) in cases {
        let (status, body) = send(local_app(), req).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{name}");
        assert_eq!(body, br#"{"error":"bad request"}"#, "{name}");
    }
}

#[tokio::test]
async fn login_route_absent_in_supabase_mode() {
    let (status, _) = send(
        supabase_app(),
        login_json(TEST_LOCAL_EMAIL, TEST_LOCAL_PASSWORD),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn refresh_and_logout_routes_do_not_exist() {
    for app in [local_app(), supabase_app()] {
        for path in ["/api/auth/refresh", "/api/auth/logout"] {
            let req = Request::builder()
                .method(Method::POST)
                .uri(path)
                .header("Content-Type", "application/json")
                .body(Body::from("{}"))
                .unwrap();
            let (status, _) = send(app.clone(), req).await;
            assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
        }
    }
}

#[sqlx::test]
async fn local_token_from_login_reads_projects(pool: PgPool) {
    let app = build_test_app_with(pool, build_test_config_local());
    let (status, body) = send(
        app.clone(),
        login_json(TEST_LOCAL_EMAIL, TEST_LOCAL_PASSWORD),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let token = json_body(&body)["accessToken"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, body) = send(app, get_with_token(PROJECTS, &token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json_body(&body), json!([]));
}

#[tokio::test]
async fn local_mode_rejects_supabase_token() {
    assert_projects_unauthorized(local_app(), &valid_token()).await;
}

#[tokio::test]
async fn local_mode_rejects_local_secret_with_supabase_audience() {
    let token = make_local_token(TEST_LOCAL_SECRET, 600, "authenticated", LOCAL_TOKEN_ISSUER);
    assert_projects_unauthorized(local_app(), &token).await;
}

#[tokio::test]
async fn local_mode_rejects_wrong_issuer() {
    let token = make_local_token(
        TEST_LOCAL_SECRET,
        600,
        LOCAL_TOKEN_AUDIENCE,
        "https://example.supabase.co/auth/v1",
    );
    assert_projects_unauthorized(local_app(), &token).await;
}

#[tokio::test]
async fn local_mode_rejects_expired_token() {
    let token = make_local_token(
        TEST_LOCAL_SECRET,
        -10,
        LOCAL_TOKEN_AUDIENCE,
        LOCAL_TOKEN_ISSUER,
    );
    assert_projects_unauthorized(local_app(), &token).await;
}

#[tokio::test]
async fn local_mode_rejects_token_signed_with_other_secret() {
    let token = make_local_token(
        "some-other-secret-that-is-long-enough-too",
        600,
        LOCAL_TOKEN_AUDIENCE,
        LOCAL_TOKEN_ISSUER,
    );
    assert_projects_unauthorized(local_app(), &token).await;
}

#[tokio::test]
async fn supabase_mode_rejects_local_token_signed_with_supabase_secret() {
    let token = make_local_token(
        TEST_JWT_SECRET,
        600,
        LOCAL_TOKEN_AUDIENCE,
        LOCAL_TOKEN_ISSUER,
    );
    assert_projects_unauthorized(supabase_app(), &token).await;
}

const FEATURE_LOG_PATH: &str = "/api/harness/projects/test-project/features/first_feat/log";
const DASHBOARD_PATH: &str = "/api/harness/dashboard";

async fn send_log_request(app: Router, token: Option<&str>) -> (StatusCode, Vec<u8>) {
    let mut builder = Request::builder().method(Method::GET).uri(FEATURE_LOG_PATH);
    if let Some(token) = token {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    let req = builder.body(Body::empty()).unwrap();
    let resp = app.oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap()
        .to_vec();
    (status, bytes)
}

#[tokio::test]
async fn local_mode_rejects_supabase_token_on_feature_log() {
    let (status, body) = send_log_request(local_app(), Some(&valid_token())).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body, br#"{"error":"unauthorized"}"#);
}

#[tokio::test]
async fn local_mode_rejects_missing_token_on_feature_log() {
    let (status, body) = send_log_request(local_app(), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body, br#"{"error":"unauthorized"}"#);
}

async fn send_dashboard_request(app: Router, token: Option<&str>) -> (StatusCode, Vec<u8>) {
    let mut builder = Request::builder().method(Method::GET).uri(DASHBOARD_PATH);
    if let Some(token) = token {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    let req = builder.body(Body::empty()).unwrap();
    let resp = app.oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap()
        .to_vec();
    (status, bytes)
}

#[tokio::test]
async fn local_mode_rejects_supabase_token_on_dashboard() {
    let (status, body) = send_dashboard_request(local_app(), Some(&valid_token())).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body, br#"{"error":"unauthorized"}"#);
}

#[tokio::test]
async fn local_mode_rejects_missing_token_on_dashboard() {
    let (status, body) = send_dashboard_request(local_app(), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body, br#"{"error":"unauthorized"}"#);
}

const AGENT_USAGE_PATH: &str = "/api/harness/projects/test-project/features/first_feat/agent-usage";

async fn send_agent_usage_request(app: Router, token: Option<&str>) -> (StatusCode, Vec<u8>) {
    let mut builder = Request::builder().method(Method::GET).uri(AGENT_USAGE_PATH);
    if let Some(token) = token {
        builder = builder.header("Authorization", format!("Bearer {token}"));
    }
    let req = builder.body(Body::empty()).unwrap();
    let resp = app.oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .unwrap()
        .to_vec();
    (status, bytes)
}

#[tokio::test]
async fn local_mode_rejects_supabase_token_on_agent_usage() {
    let (status, body) = send_agent_usage_request(local_app(), Some(&valid_token())).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body, br#"{"error":"unauthorized"}"#);
}

#[tokio::test]
async fn local_mode_rejects_missing_token_on_agent_usage() {
    let (status, body) = send_agent_usage_request(local_app(), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body, br#"{"error":"unauthorized"}"#);
}
