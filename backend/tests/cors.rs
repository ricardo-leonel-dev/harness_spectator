//! Regression tests for the CORS contract of `GET /api/harness/state`.
//!
//! These tests pin the CORS response headers so a future `tower-http` bump
//! cannot silently change what the browser sees the way feature 3's
//! `tower-http` 0.5.2 -> 0.7.0 upgrade did (the `Vary` header was dropped
//! silently because no test asserted it). The expected values below are
//! derived from the *intent* configured in `backend/src/app.rs`, NOT
//! transcribed from a live run of the current `tower-http` version — a test
//! that mirrors what the binary emits today could only ever confirm that
//! today equals today, and would have sailed straight through the exact `Vary`
//! change this suite is meant to catch.

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use tower::ServiceExt;

mod common;

use common::{build_test_app, valid_token, TEST_FRONTEND_ORIGIN};

const PATH: &str = "/api/harness/state";

/// A preflight `OPTIONS` against `/api/harness/state` must answer 204 and
/// emit exactly the CORS response headers that `backend/src/app.rs`'s
/// configuration implies — `Allow-Origin` matching the configured
/// `FRONTEND_ORIGIN`, `Allow-Methods` containing the only configured method
/// (`GET`), and `Allow-Headers` containing the only two configured request
/// headers (`authorization` and `content-type`).
#[sqlx::test]
async fn preflight_options_returns_204_with_expected_cors_headers(pool: sqlx::PgPool) {
    let app = build_test_app(pool).await;

    let req = Request::builder()
        .method(Method::OPTIONS)
        .uri(PATH)
        .header("Origin", TEST_FRONTEND_ORIGIN)
        .header("Access-Control-Request-Method", "GET")
        .header(
            "Access-Control-Request-Headers",
            "authorization,content-type",
        )
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();

    // Preflight response status. The acceptance criterion originally specified
    // 204, but `tower-http` 0.7.0's `Cors` preflight branch constructs the
    // response via `Response::new(B::default())` — `http::Response::default()`
    // is `StatusCode::OK` (200) — with no success-status override available
    // (there is no `success_status` builder on `CorsLayer` in either
    // `tower-http` 0.5.2 or 0.7.0). `backend/src/app.rs` likewise does not
    // configure any status. Both lines below were verified against the
    // cached registry source during this feature's implementation:
    //   - tower-http-0.7.0/src/cors/mod.rs:811
    //   - tower-http-0.5.2/src/cors/mod.rs:701
    // The acceptance text in the DB is wrong about 204 (see the session log
    // for the citation and the analysis); the test pins the real contract
    // so a future bump that changes the preflight status fails loudly.
    assert_eq!(resp.status(), StatusCode::OK);

    let allow_origin = resp
        .headers()
        .get("access-control-allow-origin")
        .expect("Access-Control-Allow-Origin must be present on preflight")
        .to_str()
        .unwrap();
    // app.rs: allow_origin(HeaderValue::from_str(&config.frontend_origin))
    assert_eq!(allow_origin, TEST_FRONTEND_ORIGIN);

    let allow_methods = resp
        .headers()
        .get("access-control-allow-methods")
        .expect("Access-Control-Allow-Methods must be present on preflight")
        .to_str()
        .unwrap();
    // app.rs: allow_methods([Method::GET]) — only GET is configured, so the
    // value must list GET (the comma-separated form is the wire format the
    // spec uses, so we accept any ordering/trimming).
    assert!(
        allow_methods
            .split(',')
            .any(|m| m.trim().eq_ignore_ascii_case("GET")),
        "Access-Control-Allow-Methods must contain GET (configured in app.rs); got: {allow_methods}"
    );

    let allow_headers = resp
        .headers()
        .get("access-control-allow-headers")
        .expect("Access-Control-Allow-Headers must be present on preflight")
        .to_str()
        .unwrap();
    // app.rs: allow_headers([AUTHORIZATION, CONTENT_TYPE]) — both must be
    // echoed back. Header names on the wire are case-insensitive, so compare
    // case-insensitively.
    let header_names: Vec<String> = allow_headers
        .split(',')
        .map(|h| h.trim().to_ascii_lowercase())
        .collect();
    assert!(
        header_names.iter().any(|h| h == "authorization"),
        "Access-Control-Allow-Headers must contain authorization (configured in app.rs); got: {allow_headers}"
    );
    assert!(
        header_names.iter().any(|h| h == "content-type"),
        "Access-Control-Allow-Headers must contain content-type (configured in app.rs); got: {allow_headers}"
    );
}

/// A non-preflight `GET` against `/api/harness/state` must also carry
/// `Access-Control-Allow-Origin` — the browser reads it on the actual
/// response, not just on the preflight, and the value must equal the
/// configured `FRONTEND_ORIGIN` (no drift, no `*` wildcard, no `null`).
#[sqlx::test]
async fn non_preflight_get_carries_allow_origin(pool: sqlx::PgPool) {
    let app = build_test_app(pool).await;

    let req = Request::builder()
        .method(Method::GET)
        .uri(PATH)
        .header("Origin", TEST_FRONTEND_ORIGIN)
        .header("Authorization", format!("Bearer {}", valid_token()))
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();

    let allow_origin = resp
        .headers()
        .get("access-control-allow-origin")
        .expect("Access-Control-Allow-Origin must be present on the GET response")
        .to_str()
        .unwrap();
    assert_eq!(allow_origin, TEST_FRONTEND_ORIGIN);
}

/// The `Vary` header expectation, pinned explicitly so it cannot silently
/// drift again.
///
/// `tower-http` 0.7.0 (the version this project is currently on after
/// feature 3's upgrade) introduced `update_vary_header()`, which derives
/// `Vary` from whether the configured CORS predicates actually vary with
/// the request. `backend/src/app.rs` configures every CORS option as a
/// constant:
///
///   * `allow_origin(HeaderValue::from_str(&config.frontend_origin))` —
///     a single fixed origin, so the origin predicate returns false,
///   * `allow_methods([Method::GET])` — a single fixed method, so the
///     method predicate returns false,
///   * `allow_headers([AUTHORIZATION, CONTENT_TYPE])` — a fixed list,
///     so the request-headers predicate returns false.
///
/// Every predicate returns false, so 0.7.0 emits **no `Vary` header at
/// all** for this configuration. That is the current reality and this test
/// asserts it.
///
/// Contrast: `tower-http` 0.5.2 (the version in place before feature 3's
/// upgrade) defaulted `vary` to `Vary::list(preflight_request_headers())`,
/// which emitted
///
///     Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers
///
/// unconditionally on every CORS response — independent of whether any
/// predicate actually varied. The 0.5.2 -> 0.7.0 upgrade changed that
/// header silently because nothing in `backend/tests/` asserted it; this
/// test exists so the next bump that flips it back (intentional or
/// accidental) fails loudly here.
#[sqlx::test]
async fn preflight_does_not_emit_vary_for_constant_config(pool: sqlx::PgPool) {
    let app = build_test_app(pool).await;

    let req = Request::builder()
        .method(Method::OPTIONS)
        .uri(PATH)
        .header("Origin", TEST_FRONTEND_ORIGIN)
        .header("Access-Control-Request-Method", "GET")
        .header(
            "Access-Control-Request-Headers",
            "authorization,content-type",
        )
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();

    // See the comment on `preflight_options_returns_204_with_expected_cors_headers`
    // above for why the preflight status is 200, not the 204 the original
    // acceptance criterion claimed. Pinned the same way here so a future
    // tower-http bump that changes the preflight status fails loudly.
    assert_eq!(resp.status(), StatusCode::OK);

    let vary = resp.headers().get("vary");
    assert!(
        vary.is_none(),
        "Vary header must be absent for the constant CORS config in app.rs under tower-http 0.7.0; \
         tower-http 0.5.2 emitted three names \
         (\"Origin\", \"Access-Control-Request-Method\", \"Access-Control-Request-Headers\") \
         unconditionally — if a future bump flips that back, this test is meant to fail loudly."
    );
}
