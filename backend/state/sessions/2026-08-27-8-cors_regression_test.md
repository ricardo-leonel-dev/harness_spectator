---
session_id: 8
feature: cors_regression_test
agent: leader -> implementer (Claude Sonnet)
started_at: 2026-08-27T17:06:02.000Z
closed_at: 2026-08-27T17:22:08.000Z
---

## Plan
- Read app.rs, derive intended CORS contract from configured constants (allow_origin=FRONTEND_ORIGIN, allow_methods=[GET], allow_headers=[AUTHORIZATION,CONTENT_TYPE])
- Create backend/tests/common/mod.rs to share the test fixture (config builder + token) so the cors test reads FRONTEND_ORIGIN from the same Config the app is built with
- Write backend/tests/cors.rs with three tests: preflight OPTIONS assertions, non-preflight GET Allow-Origin assertion, explicit Vary absence with a comment recording what 0.5.2 emitted
- Run ./init.sh and confirm green
- Write progress/impl_cors_regression_test.md handoff and report readiness

## Log
- Claimed feature 4 cors_regression_test. Read backend/src/app.rs: configured constants are allow_origin(FRONTEND_ORIGIN), allow_methods([GET]), allow_headers([AUTHORIZATION, CONTENT_TYPE]). Under tower-http 0.7.0 all three predicates are constant so no Vary header is emitted; 0.5.2 emitted Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers unconditionally.
- Wrote backend/tests/common/mod.rs (shared config + token helpers, exposes TEST_FRONTEND_ORIGIN as the single source of truth) and backend/tests/cors.rs (three #[sqlx::test] cases: preflight OPTIONS contract, non-preflight GET Allow-Origin, explicit Vary absence with the 0.5.2-emitted-three-names comment). Expected values are derived from backend/src/app.rs's configured constants, not transcribed from a live run. Did NOT touch backend/src/app.rs.
- BLOCKER: acceptance item 1 asserts preflight OPTIONS returns 204, but tower-http 0.7.0's CorsLayer (see tower-http-0.7.0/src/cors/mod.rs PreflightCall branch) constructs the preflight response via 'Response::new(B::default())' which is StatusCode::OK (200). Verified by test failure: left=200, right=204. No success_status() is configured in backend/src/app.rs, so this is the library default, not application config. The acceptance's 204 can only be made real by adding .success_status(StatusCode::NO_CONTENT) to the CorsLayer in app.rs, which the prompt forbids. Need leader guidance: (a) update acceptance to 200, or (b) add success_status(204) to app.rs.
- CORRECTION (per coordinator): the original acceptance text said '204' but that was wrong. tower-http emits 200 on preflight in BOTH versions: tower-http-0.5.2/src/cors/mod.rs:701 and tower-http-0.7.0/src/cors/mod.rs:811 both do 'let mut response = Response::new(B::default());' with no status override (and there is no 'success_status' builder on CorsLayer in either version — verified via grep on ~/.cargo/registry/src/.../tower-http-0.{5,7}.0/src/). Since backend/src/app.rs does not configure a preflight status either, the only honest assertion is 200. Updated both preflight tests in backend/tests/cors.rs to assert StatusCode::OK with a comment cross-referencing these two source lines and pointing at the DB acceptance text's error. Acceptance text in the DB cannot be edited via the harness CLI — this log entry is the canonical record of the divergence. The reviewer needs this to reconcile the test vs. the acceptance item.

## Next Step

## Verification


## Closure

