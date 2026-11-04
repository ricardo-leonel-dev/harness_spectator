use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use tower::ServiceExt;

mod common;

use common::{build_test_app, build_test_app_with, build_test_config, lazy_pool, TestDb};

async fn get_health(app: axum::Router) -> (StatusCode, Value) {
    let req = Request::builder()
        .uri("/api/health")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    let status = resp.status();
    let body = to_bytes(resp.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

#[tokio::test]
async fn health_returns_ok_without_auth_when_database_answers() {
    let db = TestDb::new().await;
    let app = build_test_app(db.pool()).await;

    let (status, body) = get_health(app).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "status": "ok" }));
}

#[tokio::test]
async fn health_returns_503_when_database_is_unreachable() {
    let app = build_test_app_with(lazy_pool(), build_test_config());

    let (status, body) = get_health(app).await;

    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body, json!({ "status": "unavailable" }));
}
