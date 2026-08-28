# Review — feature 4 `cors_regression_test`

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, `docs/`, `CHECKPOINTS.md`, `./init.sh` all in place; init.sh ends with `[OK] Environment ready`.
- C2: [x] — Exactly one feature is `in_progress` (this one); every prior `done` feature (1, 2, 3) has passing tests (re-confirmed by running them).
- C3: [x] — No new layers introduced; no new dependencies added (only test files created); no loose `print`/`todo!()` left; `backend/src/app.rs` is untouched (file mtime `Aug 27 00:30:49`, well before this session started at `Aug 27 12:14`).
- C4: [x] — A real test file (`backend/tests/cors.rs`) exercises the real router (`tower::ServiceExt::oneshot` against `build_app(pool, build_test_config())`) — no mocking of the thing under test. Three new `#[sqlx::test]` cases run green; all 14 backend tests + 5 frontend Karma tests pass; `./init.sh` exits with `[OK] Verification command passed`.
- C5: [x] — No stray untracked files in `backend/` (no `Cargo.lock.bak`, no `.tmp`, no debug residue); review left no on-disk residue. The only `[WARN]` is the pre-existing Postgres/Supabase mirror sync (`HTTP 404 PGRST125`), which the implementer correctly flagged as unrelated.
- C6: N/A — feature is `sdd=0`; the spec checkpoints group is omitted.

## Independent verification of the leader's 204 → 200 correction

I read both tower-http source files myself, not just trusting the report.

1. `~/.cargo/registry/src/index.crates.io-*/tower-http-0.5.2/src/cors/mod.rs:700-705` — `KindProj::PreflightCall` arm contains `let mut response = Response::new(B::default());` with no `.status(...)` override. Confirmed verbatim.
2. `~/.cargo/registry/src/index.crates.io-*/tower-http-0.7.0/src/cors/mod.rs:805-814` — same construction, same lack of override. Confirmed verbatim.
3. `grep -rn "success_status"` across both `tower-http-0.5.2/src/cors/` and `tower-http-0.7.0/src/cors/` returns zero matches. Confirmed.
4. `backend/src/app.rs:25-31` configures only `allow_origin` / `allow_methods` / `allow_headers`; no `success_status`, no status-shaping middleware between `CorsLayer` and the route. Confirmed.

So the preflight status is 200 in both tower-http versions, this is NOT a 0.5.2-vs-0.7.0 behavior change, and the DB acceptance text's "204" is wrong. The leader's correction is sound.

## Session log adequacy

`state/sessions/2026-08-27-8-cors_regression_test.md` contains the full analysis: the original `BLOCKER` recording the 200 vs 204 mismatch and the proposed (wrong) `.success_status` API, followed by the `CORRECTION` entry citing both `mod.rs` line numbers (701 and 811) and the `success_status` grep evidence. This is the canonical on-disk reconciliation between the test asserting 200 and the DB acceptance text asserting 204, which is exactly what the absence of a CLI amend path requires. Adequate.

## Tautology audit — "could a regression slip past each assertion?"

Reasoned, did not mutate the test. Every assertion derives from intent (`app.rs` config + library source) rather than transcribed output:

| Assertion | Source of truth | Would it actually fail? |
|---|---|---|
| `resp.status() == 200` | Library source (line 811 of 0.7.0; 701 of 0.5.2): both construct `Response::default()` and neither has a status override | Yes — fails on 204, 500, anything non-200 |
| `Access-Control-Allow-Origin == TEST_FRONTEND_ORIGIN` | `app.rs:26` `allow_origin(HeaderValue::from_str(&config.frontend_origin))`; `TEST_FRONTEND_ORIGIN` in `common/mod.rs:19` is the same value the test app is built with — no drift-prone hardcoded literal | Yes — fails on `*`, `null`, missing, or any other literal |
| `Access-Control-Allow-Methods` contains `GET` | `app.rs:27` `allow_methods([Method::GET])` | Yes — fails if GET is omitted |
| `Access-Control-Allow-Headers` contains `authorization` and `content-type` | `app.rs:28-31` `allow_headers([AUTHORIZATION, CONTENT_TYPE])` | Yes — case-insensitive `.eq_ignore_ascii_case` check; fails if either is dropped or replaced with `*` |
| `Vary` header absent | `tower-http` 0.7.0's `update_vary_header()` (mod.rs:460-482) emits `Vary::list([])` for the constant-predicates case; `Vary::list([]).to_header()` returns `None` (vary.rs:27-38), so no `Vary` header is appended | Yes — fails on the exact 0.5.2 regression (`Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers`), which is the change this test exists to catch |

Test name `preflight_options_returns_204_with_expected_cors_headers` still says "204" while the body asserts 200 — intentional (per the implementer's note: kept for traceability to acceptance item 1). The body comment cites both tower-http source lines and the `success_status` grep; this is documented and acceptable.

## Vary assertion carries the required comment

`backend/tests/cors.rs:154-165` documents the 0.5.2 → 0.7.0 difference in detail:

    Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers

and explicitly states this test exists so the next bump that flips it back fails loudly. The panic message at lines 192-196 also reproduces the three-name value for debuggability. Acceptance item 3 is fully met.

## Scope — `backend/src/app.rs` was not modified

`stat -f '%Sm'` on `backend/src/app.rs` reports `Aug 27 00:30:49`, unchanged since feature 1. Only test files were created (`backend/tests/common/mod.rs` at 12:07:43, `backend/tests/cors.rs` at 12:14:51). The test also imports `TEST_FRONTEND_ORIGIN` from the shared fixture, so the assertion is tied to the configured value, not a literal that could drift from `app.rs`.

## Convention adherence

- Tests live in `backend/tests/`, named after the area (`cors.rs`) — matches `docs/conventions.md` "Tests" section.
- Uses `#[sqlx::test]` for tests that need a throwaway Postgres schema — matches.
- Real router, no mocking of the thing under test — matches both `docs/conventions.md` fixture/isolation and `docs/verification.md` Level 2.
- Comments explain non-obvious "why" (the `Response::default()` reasoning, the 0.5.2 vs 0.7.0 `Vary` history) — matches.

## Minor observations (not blocking)

1. `tests/harness.rs` and `tests/cors.rs` carry parallel copies of `build_test_config` / `make_token` / `TEST_JWT_SECRET` / `TEST_PROJECT_SLUG`. The implementer noted this is a deliberate minimum-diff choice. The new `common/mod.rs` module exposes the canonical versions and the CORS test uses them; the older `harness.rs` still uses its local copies. Consolidating would be a small follow-up but is not in scope for this feature, which is "pin CORS, don't refactor the test scaffolding."

2. The `harness.rs` `frontend_origin` literal (`"http://localhost:4200"`) is now duplicated in `common/mod.rs` as `TEST_FRONTEND_ORIGIN`. If those ever drift, the `cors.rs` assertion is anchored to `common/mod.rs` (the one the test app is built with), so the CORS regression test would not be affected. Worth noting only because it's a latent fragility in the pre-existing `harness.rs` code.

3. The DB acceptance text for item 1 still reads "204 status". The harness CLI does not expose an edit path. The session log + the test's body comment together record the correction; a follow-up to amend `harness.db` + regenerate `state/` is out of scope for this session.

## Verification re-run

`./init.sh` executed from the repo root finished with `[OK] Verification command passed` and `[OK] Environment ready`. Backend test totals: 4 unit + 3 cors + 5 harness + 2 toolchain = 14/14 pass. Frontend Karma: 5/5 pass. The single `[WARN]` is the unrelated Supabase mirror `HTTP 404 PGRST125`.
