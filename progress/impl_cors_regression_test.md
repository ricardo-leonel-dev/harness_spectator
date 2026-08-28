# Implementer handoff — feature 4 `cors_regression_test`

## Outcome

Ready for review. All three `#[sqlx::test]` cases in
`backend/tests/cors.rs` pass; the 5 pre-existing `harness.rs` tests and the
2 `toolchain.rs` tests still pass; `./init.sh` is green.

**Heads-up for the reviewer (NOT buried):** acceptance item 1's text in the
DB says "204 status", but the test asserts `StatusCode::OK` (200). This is
intentional and verified — see "204 vs 200" below. The acceptance text is
unchanged in the DB (the harness CLI does not expose an edit path for it);
the only on-disk record of why the test diverges from the literal
acceptance text is the session log (read `scripts/harness.sh log` for
session 8) and the comment in `backend/tests/cors.rs` on the
preflight-status assertions. Please read both before approving.

## What I added

- `backend/tests/common/mod.rs` — extracted shared integration-test fixture
  (`build_test_config`, `build_test_app`, `make_token`, `valid_token`,
  constants `TEST_JWT_SECRET`, `TEST_PROJECT_SLUG`, `TEST_FRONTEND_ORIGIN`).
  `harness.rs` is unchanged — its local copies of the helpers remain
  (deliberate: minimum diff to existing code).
- `backend/tests/cors.rs` — three `#[sqlx::test]` cases that pin the CORS
  contract derived from the *intent* configured in `backend/src/app.rs`
  (`allow_origin = FRONTEND_ORIGIN`, `allow_methods = [GET]`,
  `allow_headers = [AUTHORIZATION, CONTENT_TYPE]`):

  1. `preflight_options_returns_204_with_expected_cors_headers` —
     preflight `OPTIONS` for `/api/harness/state`: asserts `200` (see
     "204 vs 200" below), `Access-Control-Allow-Origin = TEST_FRONTEND_ORIGIN`,
     `Access-Control-Allow-Methods` contains `GET`,
     `Access-Control-Allow-Headers` contains `authorization` and
     `content-type`. (Function name kept as written for traceability to
     acceptance item 1.)
  2. `non_preflight_get_carries_allow_origin` — asserts the `GET`
     response carries `Access-Control-Allow-Origin = TEST_FRONTEND_ORIGIN`.
  3. `preflight_does_not_emit_vary_for_constant_config` — asserts the
     `Vary` header is absent, with a multi-paragraph comment explaining
     why (`app.rs` configures all three predicates as constants so 0.7.0's
     `update_vary_header()` emits nothing) and what `tower-http` 0.5.2 used
     to emit (`Vary: Origin, Access-Control-Request-Method,
     Access-Control-Request-Headers`), so a future bump that flips it back
     fails loudly.

## How each acceptance item is met

| # | Acceptance item | Status |
|---|-----------------|--------|
| 1 | preflight OPTIONS: 204 status, Allow-Origin = FRONTEND_ORIGIN, Allow-Methods contains GET, Allow-Headers contains authorization and content-type | Met on the three header sub-assertions. The `204` sub-assertion is intentionally `StatusCode::OK` (200) — see "204 vs 200" below. |
| 2 | non-preflight GET carries Allow-Origin = FRONTEND_ORIGIN | Met. |
| 3 | Vary header expectation asserted explicitly with 0.5.2-three-names comment | Met — `preflight_does_not_emit_vary_for_constant_config` asserts absence with the required comment. |
| 4 | Expected values derived from `app.rs` config, not transcribed from live run | Met — every expected header value is computed from the constants configured in `app.rs`. The `Vary` assertion is derived from the same configuration logic (`update_vary_header()` returns nothing when all three predicates are constant). |
| 5 | `./init.sh` passes green | Met. |

## 204 vs 200 (the divergence the reviewer MUST read)

The acceptance text says "204 status" for the preflight. The test asserts
`StatusCode::OK` (200). Both sides of the divergence have a verified,
citable source:

- `tower-http-0.5.2/src/cors/mod.rs:701` and
  `tower-http-0.7.0/src/cors/mod.rs:811` *both* do
  `let mut response = Response::new(B::default());` in the
  `KindProj::PreflightCall` arm. `http::Response::default()` is
  `StatusCode::OK`. No status override is applied.
- There is **no `success_status` builder on `CorsLayer`** in either
  `tower-http` 0.5.2 or 0.7.0 (verified via `grep -rn success_status`
  across both `src/` trees). My initial `BLOCKER` log proposed
  `.success_status(StatusCode::NO_CONTENT)` as a way to make the
  acceptance's 204 actually emit 204; that proposal was wrong on its
  face — the API does not exist.
- `backend/src/app.rs` does not configure any preflight status either —
  no `success_status` call, no status-shaping middleware between
  `CorsLayer` and the route.

So 200 is the actual, intentional, configurable contract for the
preflight in both `tower-http` versions (this is **not** a
0.5.2-vs-0.7.0 behavior change, unlike the `Vary` header). The
acceptance's "204" was a transcription error (per the coordinator,
copied from a feature-3 reviewer remark about "synthetic 204 response"
that was not verified against the library).

The acceptance text in the DB cannot be edited through the harness CLI,
so this log entry and the comment in `backend/tests/cors.rs` on both
preflight status assertions are the on-disk record of why the test says
200 and the acceptance says 204. If a later session wants the DB
acceptance text to reflect 200 (recommended), it would need a small
SQLite edit against `harness.db` and a `snapshot.sh` regeneration —
that's out of scope for this implementer pass and the prompt
specifically forbade changing `app.rs` or running `log-out`.

The test does what acceptance item 4 asked of it: the preflight status
is not transcribed from a live run (it is derived from the cached
registry source of the library + a verified `grep` of the library's
public builder API), and the assertion is pinned so that any future
bump of `tower-http` that changes the preflight status fails loudly
here, the same way the `Vary` test fails loudly if a future bump
re-introduces the 0.5.2 three-name `Vary`.

## Source derivation trail (per acceptance item 4)

| Assertion | Derived from |
|-----------|-------------|
| `Access-Control-Allow-Origin = TEST_FRONTEND_ORIGIN` | `app.rs` `allow_origin(HeaderValue::from_str(&config.frontend_origin))` |
| `Access-Control-Allow-Methods` contains `GET` | `app.rs` `allow_methods([Method::GET])` |
| `Access-Control-Allow-Headers` contains `authorization` and `content-type` | `app.rs` `allow_headers([axum::http::header::AUTHORIZATION, axum::http::header::CONTENT_TYPE])` |
| `Vary` header absent on preflight | All three predicates above are constant → `tower-http` 0.7.0's `update_vary_header()` emits nothing for a constant config. (Explicitly commented in the test.) |
| `Access-Control-Allow-Origin` present on non-preflight GET | `CorsLayer` is the outermost layer in `app.rs`, so it decorates every response, not just preflights. |
| Preflight status `200 OK` | `tower-http`'s `PreflightCall` arm constructs `Response::new(B::default())` in both 0.5.2 (line 701) and 0.7.0 (line 811). `Response::default()` is `StatusCode::OK`. There is no status override available. Verified via `grep -rn success_status` on the cached source: no matches in either version. |

## Verification summary

- `cargo fmt --check` — green.
- `cargo clippy --all-targets -- -D warnings` — green.
- `cargo build` — green.
- `cargo test` — green: 4 unit + 3 cors + 5 harness + 2 toolchain = **14/14 pass**.
- `npm --prefix frontend run lint`, `build`,
  `test --watch=false --browsers=ChromeHeadless` — green (5/5 Karma tests).
- `./init.sh` overall — green. Snapshot regenerated at `state/`.
- `[WARN] bootstrap_project sync failed: HTTP 404: {"code":"PGRST125"...}`
  emitted by the Supabase mirror sync — same warning that appears on every
  session startup in this environment (no Supabase project configured);
  not introduced by this feature.
