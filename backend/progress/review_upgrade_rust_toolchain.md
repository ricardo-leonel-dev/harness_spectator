# Review — feature 3 `upgrade_rust_toolchain`

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db` exist; `docs/{architecture,conventions,verification,specs}.md` and `CHECKPOINTS.md` are filled in; `./init.sh` exits 0 with `[OK] Environment ready`.
- C2: [x] — Only feature 3 is `in_progress` (feature 1, 2 are `done`); session 7 (leader→implementer) reflects real current work; verify is genuinely green (re-run below).
- C3: [x] — `backend/Cargo.toml:4` still declares `edition = "2021"` (design.md explicitly defers edition 2024); `git diff --stat -- frontend/` returns empty (frontend untouched, per scope); all bumps are within `docs/architecture.md`'s dependency allowlist (axum, sqlx, tower-http, jsonwebtoken, thiserror are all listed there); no stray `print`/TODOs in changed files. `jsonwebtoken` adds `rust_crypto` on top of its default `use_pem` (Cargo respects `default-features = false` only to *remove* defaults, not to override the explicit feature list) — explicitly justified in design.md as consistent with the "pure-Rust, no C-toolchain" preference and called out there as not a correctness issue.
- C4: [x] — Re-verified directly. `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings` clean, `cargo build` clean, `cargo test` → 4 unit tests (`auth::jwt::tests::*`) + 5 integration tests (`tests/harness.rs::*`) + 2 toolchain tests (`tests/toolchain.rs::*`), all pass. `./init.sh` end-to-end exits 0 (`[OK] Verification command passed`, `[OK] Environment ready`). Only stderr noise is the unrelated `bootstrap_project sync failed` `[WARN]` from the Postgres mirror step (pre-existing, not introduced by this feature).
- C5: [x] — Cleaned reviewer residue: deleted `backend/Cargo.lock.bak` (was a `.bak` left by the previous aborted-review attempt; `cmp`-clean with `backend/Cargo.lock`, so nothing to restore, just removed per `AGENTS.md` §5's no-temp-files rule). No other stray files. The implementer correctly did not run `scripts/harness.sh log-out` (per the leader's instruction and `AGENTS.md` §0); session remains open awaiting this approval.
- C6: [x] — `specs/upgrade_rust_toolchain/{requirements.md,design.md,tasks.md}` all exist; requirements are in strict EARS form with stable `R1`-`R10` ids; all 10 tasks in `tasks.md` are `[x]`; every `R<n>` maps to a concrete, currently-passing test verified directly (not from the implementer's claim — see R<n> trace below).

## R<n> trace (verified directly, not trusted)

| Req | Evidence |
|---|---|
| R1 | `backend/Cargo.toml:5` `rust-version = "1.94"`; `backend/tests/toolchain.rs::declares_minimum_supported_rust_version` passes (`env!("CARGO_PKG_RUST_VERSION") == "1.94"`). |
| R2 | `backend/Cargo.toml:8` `axum = "0.8"`; `Cargo.lock` resolves `axum 0.8.9` at line 51; `lockfile_majors_meet_upgraded_floor` axum-stanza passes. |
| R3 | `backend/Cargo.toml:14` `sqlx = { version = "0.9", features = ["postgres", "runtime-tokio", "tls-rustls", "macros", "uuid", "chrono"] }` in `[dependencies]`; `backend/Cargo.toml:23` the same in `[dev-dependencies]` plus `migrate`. `Cargo.lock` resolves `sqlx 0.9.0` at line 1735; all 5 `#[sqlx::test]` integration tests pass. |
| R4 | `backend/Cargo.toml:11` `tower-http = { version = "0.7", features = ["cors", "trace"] }`; `Cargo.lock` resolves `tower-http 0.7.0` at line 2115. |
| R5 | `backend/Cargo.toml:16` `jsonwebtoken = { version = "11", features = ["rust_crypto"] }`; `Cargo.lock` resolves `jsonwebtoken 11.0.0` at line 989; 4 `auth::jwt::tests` unit tests pass; 5 `tests/harness.rs` integration tests (4 of which drive JWT verification) pass. |
| R6 | `backend/Cargo.toml:18` `thiserror = "2"`; `Cargo.lock` resolves `thiserror 2.0.20` at line 1978 (sole `[[package]] name = "thiserror"` stanza in the lockfile — no transitive `1.x` to worry about, exactly as the implementer reported). |
| R7 | `backend/src/auth/extractor.rs:10` `impl FromRequestParts<AppState> for SupabaseUser` no longer carries `#[axum::async_trait]`; the `async fn from_request_parts(...)` body is unchanged; `cargo build` clean against `axum 0.8.9`. |
| R8 | `cargo test` confirms all 5 pre-existing `tests/harness.rs` integration tests pass with their existing assertions (status codes 200/401, JSON shapes, JWT outcomes, `pg_stat_user_tables` SELECT-only invariant) and all 4 pre-existing `auth::jwt::tests` unit tests pass — none of those tests' assertion lines were modified. |
| R9 | `backend/tests/toolchain.rs::lockfile_majors_meet_upgraded_floor`. **Verified it can actually fail:** I created 10 doctored copies of `Cargo.lock` under `/tmp/` (never inside the repo, per the leader's note) and ran a Python reimplementation of the exact Rust logic against them. 9 downgrade scenarios correctly produced the expected failure (axum→0.7.9, axum→0.5.2, sqlx→0.7.4, sqlx→0.8.0, tower-http→0.5.2, tower-http→0.6.1, jsonwebtoken→9.3.1, jsonwebtoken→10.0.0, thiserror→1.0.69); the 10th scenario (`thiserror 2.0.5`) correctly *passed*, since 2.0.5 is major 2 (same as the upgraded floor) and R9 specifies "older than the major". The guard is real, not a tautology. |
| R10 | `./init.sh` end-to-end exits 0; final lines `[OK] Verification command passed`, `[OK] Environment ready`. |

## CORS — explicit assessment for the leader

The leader's standing concern: `tower-http` crossed two majors (0.5→0.7) with zero CORS-specific test coverage in `backend/tests/`, and the implementer's report claims "No observable CORS behavior change". I read the source of both `tower-http-0.5.2/src/cors/mod.rs` and `tower-http-0.7.0/src/cors/mod.rs` (and the `allow_origin.rs`, `allow_methods.rs`, `allow_headers.rs`, `vary.rs` sub-modules) directly, and reached a more nuanced conclusion:

**One real observable change**, plus several areas where the behavior is genuinely identical:

1. **Vary header default behavior — DOES change, observably.** This is the one place the implementer's "no observable change" framing is too strong.
   - In 0.5.2, the default `Vary` field on `CorsLayer` was `Vary::list(preflight_request_headers())`, which is `[Origin, Access-Control-Request-Method, Access-Control-Request-Headers]`. Every CORS response (preflight and actual) therefore carried `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers`.
   - In 0.7.0, `CorsLayer::layer` now calls a new `update_vary_header()` that derives `Vary` from which configured values vary with the request: `allow_origin.varies_with_origin() || allow_methods.varies_with_request_method() || allow_headers.varies_with_request_headers()`. If none vary, `vary = Vary::list([])` — i.e. no `Vary` header is added at all.
   - For the exact configuration in `backend/src/app.rs` (`allow_origin(HeaderValue)` → `OriginInner::Const(v)`, `allow_methods([Method::GET])` → `AllowMethodsInner::Const`, `allow_headers([AUTHORIZATION, CONTENT_TYPE])` → `AllowHeadersInner::Const`), all three `varies_*()` predicates return `false`. So in 0.7.0 the response emits **no `Vary` header** for our preflight/actual CORS responses, where under 0.5.2 it would have emitted the three-name `Vary` value.
   - This is observable (any HTTP client or cache will see a different response), but it is a bug-fix-shaped improvement in 0.7.0 (the old default was overly conservative) rather than a regression — none of the existing tests failed, and the frontend (the only consumer) is unaffected in practice (browsers and intermediaries re-handle the CORS check either way). No existing assertion in `backend/tests/` covers `Vary`, so the change was silently invisible to the test suite.

2. **Identical observable behavior (the implementer's other claims are accurate):**
   - `Access-Control-Allow-Origin` — for our `Const` origin, the header is emitted with the configured `frontend_origin` value on every CORS response (preflight and actual), regardless of whether the request carried an `Origin` header. Same in both versions. (For `List`/`Predicate`/`AsyncPredicate` origins, behavior is identical too when the origin matches; the only path that changed is `AsyncPredicate`, which this codebase does not use.)
   - `Access-Control-Allow-Methods` — emitted as `GET` on preflight responses (constant value), identical.
   - `Access-Control-Allow-Headers` — emitted as `authorization, content-type` on preflight responses (constant value), identical.
   - Preflight `OPTIONS` handling — same: synthetic `204` response carrying the configured preflight headers.
   - Non-preflight `Access-Control-Expose-Headers`, `Access-Control-Allow-Credentials`, `Access-Control-Allow-Private-Network`, `Access-Control-Max-Age` — all default `false`/`unset` in both versions for our config; behavior identical.
   - All four builder calls (`CorsLayer::new`, `allow_origin`, `allow_methods`, `allow_headers`) compile unchanged — I re-confirmed `backend/src/app.rs` lines 25–31 are textually identical to the pre-upgrade form (no caller-side drift).

**Recommendation for the leader:** the Vary header change is benign (and is, if anything, a 0.7.0 improvement over the old always-emit-three-names default), but a dedicated CORS regression test feature is still warranted — not because this upgrade broke anything, but because no existing test currently pins any of the four `Access-Control-*` headers or the `Vary` header, so the next `tower-http` bump could silently regress any of them. The implementer's claim "the follow-up CORS regression test feature ... is not protecting against a behavior change introduced by this feature — it would be net-new coverage" is essentially correct (modulo the Vary header, which the implementer didn't call out — they should have).

## Scope discipline

- `backend/Cargo.toml:4` `edition = "2021"` — confirmed unchanged; design.md explicitly defers edition 2024 with reasons (RPIT lifetime-capture defaults, `unsafe` attribute syntax, etc.); no requirement in `R1`-`R10` asks for it.
- `frontend/` — `git status --short -- frontend/` returns empty; `git diff --stat -- frontend/` returns empty. No frontend files touched. Spec preamble of `requirements.md` is explicit: "Scope: `backend/` only. This feature does not **not** touch `frontend/`." (sic; preserved verbatim.)
- No `rust-toolchain.toml` — design.md explicitly rejects this because the project's `cargo`/`rustc` are Homebrew (no `rustup` proxy) and `rust-version` in `Cargo.toml` (R1) is the enforced floor any cargo honors. No R<n> required `rust-toolchain.toml`.

## Stragglers cleaned

- Deleted `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator/backend/Cargo.lock.bak` (cmp-clean with the real `Cargo.lock`, so nothing to restore; residue from the previous aborted review attempt). `git status` shows no other untracked/temp files in the repo.

## Required Changes

None. The implementer may run `scripts/harness.sh log-out` per `AGENTS.md` §5, with the standard `--changes` listing (`backend/Cargo.toml`, `backend/Cargo.lock`, `backend/src/auth/extractor.rs`, `backend/tests/toolchain.rs`, `specs/upgrade_rust_toolchain/tasks.md`).
