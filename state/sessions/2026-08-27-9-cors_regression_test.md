---
session_id: 9
feature: cors_regression_test
agent: unknown
started_at: 2026-08-27T17:23:34.000Z
closed_at: 2026-08-27T17:23:57.000Z
---

## Plan

## Log
- REOPENED: reopen to record proper log-out with --changes/--verification/--closure flags including the 204→200 discrepancy in closure text; previous log-out ran without flags
- Reopened session 8 to record proper log-out with --changes/--verification/--closure flags (previous log-out closed the session without the metadata flags, so the closure summary including the 204→200 discrepancy was not persisted). Re-logging out now with the coordinator-requested flags.

## Next Step
- session closed with proper --changes/--verification/--closure flags; feature marked done

## Verification
./init.sh green: cargo fmt --check, cargo clippy --all-targets -- -D warnings, cargo build, cargo test (4 unit + 3 cors + 5 harness + 2 toolchain = 14/14 pass), and npm --prefix frontend run lint, build, test (5/5 Karma tests) all pass. Snapshot regenerated at state/.

## Closure
Added backend/tests/common/mod.rs (shared test fixture: TEST_FRONTEND_ORIGIN as single source of truth for the configured origin, build_test_config/build_test_app/make_token/valid_token helpers) and backend/tests/cors.rs (three #[sqlx::test] cases: preflight OPTIONS contract with the 204->200 correction documented in-test, non-preflight GET Allow-Origin, Vary absence with the 0.5.2-three-names comment). backend/src/app.rs intentionally untouched per the prompt's scope rules. IMPORTANT for future readers: the test asserts StatusCode::OK (200) on the preflight, while acceptance item 1 in the DB still says 204 -- the 204 was a transcription error in the original feature text (coordinator-confirmed; both tower-http-0.5.2/src/cors/mod.rs:701 and tower-http-0.7.0/src/cors/mod.rs:811 do Response::new(B::default()) with no status override, and there is no success_status builder on CorsLayer in either version -- verified via grep). The DB acceptance text cannot be edited through the harness CLI; the session log (session 8) is the on-disk record of why the test says 200 and the acceptance says 204, and the test comments cross-reference that log entry.
