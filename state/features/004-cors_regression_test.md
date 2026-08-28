---
feature_number: 4
name: cors_regression_test
title: CORS regression test for /api/harness/state
status: done
created_at: 2026-08-27T14:17:53.000Z
updated_at: 2026-08-27T17:23:57.000Z
---

## Description
Pin the CORS response contract so a future tower-http bump cannot change it silently. Today no test in backend/tests/ asserts any Access-Control-* header or Vary, which is exactly why the 0.5.2 -> 0.7.0 upgrade in feature 3 changed the Vary header with all 9 tests staying green. IMPORTANT: derive the expected values from the intent configured in backend/src/app.rs (allow_origin = FRONTEND_ORIGIN, allow_methods = [GET], allow_headers = [AUTHORIZATION, CONTENT_TYPE]), NOT by running the current version and transcribing whatever it emits — a test that mirrors current output cannot detect that current output is wrong. See session 7's log for the full Vary analysis (tower-http 0.7.0 emits NO Vary header for this constant config; 0.5.2 emitted 'Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers').

## Acceptance
- [ ] A test in backend/tests/ asserts the preflight OPTIONS response for /api/harness/state: 204 status, Access-Control-Allow-Origin equal to FRONTEND_ORIGIN, Access-Control-Allow-Methods containing GET, Access-Control-Allow-Headers containing authorization and content-type
- [ ] A test asserts the non-preflight GET response carries Access-Control-Allow-Origin equal to FRONTEND_ORIGIN
- [ ] The Vary header expectation is asserted explicitly (absent under tower-http 0.7 for this constant config) with a comment recording that 0.5.2 emitted three names, so a future bump flipping it back fails loudly
- [ ] Expected header values are derived from app.rs's configuration, not transcribed from a live run of the current tower-http version
- [ ] ./init.sh passes green
