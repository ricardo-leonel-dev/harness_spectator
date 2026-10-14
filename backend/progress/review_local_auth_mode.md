# Review — feature 5 `local_auth_mode`

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, filled-in docs and `CHECKPOINTS.md` present. `./init.sh` exit 0, ends `[OK] Environment ready`. One `[WARN]`: `cannot reach http://localhost:3001 — skipping mirror sync` (Docker mirror down, environmental).
- C2: [x] — Only feature 5 is `in_progress`. Features 1-4 (`done`) pass under the full `cargo test` run below. Open session 12 is this feature's real, current work.
- C3: [x] — New code sits in the layers `docs/architecture.md` now documents (`src/auth/{password,local_token,router}.rs`, `src/bin/hash_password.rs`). T1 updated the doc. `argon2` was added to the allowlist in `docs/architecture.md` before it was added to `Cargo.toml` (`argon2 = "0.6"`, resolved 0.6.0). No new DML: local users come from config, not the database. No debug prints and no TODOs. The one new comment (`tests/common/mod.rs`, why `dead_code` is allowed) explains a why.
- C4: [x] — Every new or changed source file has a test that exercises it: `src/config.rs` (17 unit tests via `from_lookup`), `src/auth/password.rs` (5), `src/auth/local_token.rs` (6), `src/auth/router.rs` + `extractor.rs` + `app.rs` (`tests/auth.rs`, 14, real router through `oneshot`), CORS (`tests/cors.rs`, 4), `src/main.rs` + `src/bin/hash_password.rs` (`tests/binaries.rs`, 4, real executables with `env_clear`). No mocks of the code under test. I ran `verify_command` myself: `cargo fmt --check` clean, `cargo clippy --all-targets -- -D warnings` clean, `cargo build` ok, `cargo test` 64 passed / 0 failed (lib 32, auth 14, binaries 4, cors 4, harness 8, toolchain 2). `DATABASE_URL` was the default Homebrew `harness_test` DB.
- C5: [ ] — Pending by design: the session is open, and `log-out` comes after this approval. No stray files in `backend/`. `progress/impl_local_auth_mode.md` and this file are the intended handoff files. The `.DS_Store` at the repo root and the `frontend/` changes are outside this project.
- C6: [x] — `specs/local_auth_mode/{requirements,design,tasks}.md` exist. All 41 requirements use EARS with stable `R<n>` ids. T1-T17 are all `[x]`, and each task has a matching diff (checked one by one). I read every `R<n>` → test mapping (below) against the test bodies.

## Requirement traceability (verified by reading the tests)

- R1-R15, R24: `src/config.rs` tests drive `Config::from_lookup` with a `HashMap`. They cover:
  - R3: cases `Local` and `ldap`; the message names both accepted values and the rejected one.
  - R5: short secret, garbage users and TTL `0` are ignored in supabase mode.
  - R8: 31 bytes fails, 32 passes.
  - R9: CRLF/newline separators, `;;`, a trailing `;` and the `,` inside PHC strings.
  - R11: six malformed second entries, each asserting `entry 2`, including the dotenvy-mangled `v=19,t=2,p=1` and `$argon2i$`.
  - R12: `ALICE@Example.com` duplicate reported as `entry 2`.
  - R13: short secret, bad hashes and duplicates; the Display text never contains the secret or any hash.
  - R15: `59`, `86401`, `abc`, `-1` and `1.5` are rejected; `60` and `86400` are accepted.
  - R24: the first user has m/t/p 16/3/2 and the second 8/1/1; the dummy hash gets 16/3/2.
- R16: `server_exits_nonzero_naming_variable_on_bad_config` runs the real binary with an empty environment and an unroutable `DATABASE_URL`. It asserts a non-zero exit, `AUTH_MODE` in stderr, and an exit in under 5 s.
- R17-R34: `tests/auth.rs`:
  - R17: exact bodies in both modes, no `Authorization` header.
  - R18-R21: login sends the email as `" Alice@Example.com "`. The test checks the exact key set {accessToken, expiresAt}, HS256 verification with `TEST_LOCAL_SECRET`, the exact claim set, `exp - iat == ttl` and `expiresAt == exp`.
  - R22/R23: both bodies are byte-identical `{"error":"unauthorized"}`.
  - R25: invalid JSON, a missing field, a numeric email, an array body, no Content-Type and `text/plain` all return 400 `{"error":"bad request"}`.
  - R26/R27: 404s.
  - R28: `#[sqlx::test]` login, then the protected route → 200.
  - R29-R34: one rejection per layer. R32 uses `exp = now - 10`, which falls inside jsonwebtoken's default 60 s leeway, so it actually proves `leeway = 0`.
- R35: `git diff` on `src/auth/jwt.rs` and `tests/harness.rs` is empty, and both pass (4 + 8).
- R36/R37: `tests/cors.rs` asserts the exact sets {GET, POST} and {authorization, content-type}, plus the local-mode login preflight and the unchanged `Vary` test.
- R38-R41: `tests/binaries.rs` runs the real `hash-password` with an empty environment. It covers a password with trailing spaces, CRLF stripping, a fresh salt per run, and empty, `\n` and `\r\n` input (exit non-zero, nothing on stdout).

## Security review

- **argon2id verification.** `verify_password` parses the PHC string, refuses non-`argon2id` ids, and calls `Argon2::default().verify_password`, which takes m/t/p from the hash. The fact that cheap test hashes (m=8) verify through `Argon2::default()` proves it. It runs inside `spawn_blocking`, and a `JoinError` maps to 500.
- **Unknown-email path.** `post_login` (`src/auth/router.rs`) picks the user's hash, or `local.dummy_hash` when the email is unknown. It runs exactly one verification in both branches and returns 401 unless `known_user && verified`. That condition also stops someone who guesses the dummy password from getting in. The dummy hash is built once at startup with the first user's parameters and a random salt.
- **Tokens.** Issued tokens carry exactly `sub`, `email`, `iss`, `aud`, `iat` and `exp`. Verification uses `Validation::new(HS256)` (so `alg` is pinned), audience `harness-spectator-local`, issuer `harness-spectator`, required `exp`/`iss`/`aud`/`sub`, and `leeway = 0`. Mode separation holds in both directions:
  - Local mode rejects Supabase tokens (wrong secret), tokens signed with the local secret but carrying `aud=authenticated`, a wrong `iss`, and a wrong secret.
  - Supabase mode rejects local-claim tokens signed with the Supabase secret, because its verifier requires `aud = authenticated`.
  - I confirmed both directions live.
- **No secret leakage.** Startup errors name the variable and the entry position only (R13 test, plus live checks for a short secret and a mangled hash). `LocalAuthConfig` and `LocalUser` have hand-written `Debug` impls that print `<redacted>` (`local_auth_debug_redacts_secret_and_hashes`). A failed login logs `local login rejected` with no email or password. A successful login logs only the normalized email, which the design allows. A grep of the live server log found 0 occurrences of the secret, the test password, `$argon2id`, or the issued token.
- **Startup validation.** `main` prints `configuration error: <Display>` and exits 1 before creating the pool (live: exit 1 for a short secret and for a mangled hash).
- **Supabase mode unchanged.** `jwt.rs` and `tests/harness.rs` are untouched. The extractor's supabase branch calls the same `verify_supabase_jwt` with the same secret.

## Frontend contract (`frontend/specs/local_auth_login`, A1-A7)

The backend matches every assumption:

- A1: `GET /api/auth/mode` is public and returns `200 {"mode":...}`.
- A2: `accessToken` / `expiresAt`, unix seconds, integer, equal to `exp`.
- A3: 401 on bad credentials.
- A4: 404 for login in supabase mode.
- A5: CORS allows `GET,POST` and `authorization,content-type` for the frontend origin.
- A6/A7: no refresh or logout routes.

`frontend/src/app/core/harness-api.service.ts` uses the same paths and field names (`AuthModeResponse`, `LocalLoginResponse { accessToken, expiresAt }`).

## Live check (debug binary on :4056, inline env, secrets generated in the scratchpad and never printed; dev server on :4000 untouched)

- Local mode:
  - `/api/auth/mode` → `200 {"mode":"local"}`.
  - Wrong password → `401 {"error":"unauthorized"}`.
  - Unknown email → identical 401.
  - `text/plain` body → `400 {"error":"bad request"}`.
  - Login with ` REVIEWER@example.com ` → 200. Keys are {accessToken, expiresAt}, header `alg=HS256`. Claims are {aud, email, exp, iat, iss, sub} with `iss=harness-spectator`, `aud=harness-spectator-local`, `sub=reviewer@example.com`, `exp-iat=3600` and `expiresAt==exp`.
  - Protected route without a token → 401. With the token, the request passed auth and reached the DB: 500 `relation "projects" does not exist`, because `harness_test_base` has no mirror tables and the Docker mirror is down. The `200` data path is covered by the `#[sqlx::test]` R28 test.
  - Preflight `OPTIONS /api/auth/login` (POST, content-type) → 200, `allow-methods: GET,POST`, `allow-headers: authorization,content-type`, `allow-origin: http://localhost:4200`.
  - Log: `auth mode: local users=1`.
- Supabase mode:
  - `/api/auth/mode` → `{"mode":"supabase"}`.
  - `POST /api/auth/login` → 404.
  - The local token from above → 401, even with `SUPABASE_JWT_SECRET` set to the same value as the local secret.
- Both server processes were stopped and the scratch files deleted.

## Deviations judged

1. **Entry numbering counts after skipping empty `;` segments.** Accepted. requirements.md defines an entry as an `email:hash` item, and R9 says empty entries are skipped, so an empty segment is not an entry. Numbering only the real entries follows from those definitions.
2. **`parse_argon2id_hash` also requires a salt and an output.** Accepted. A PHC string without them cannot verify any password, so rejecting it at startup is a reasonable reading of R11: it is not a usable argon2id hash. The error message is the same R11 text. Minor: this extra branch has no direct unit test (non-blocking).
3. **`verify_password` returns `false` for non-argon2id PHC strings.** Accepted as defense in depth. Config loading already refuses such hashes, so the branch is unreachable from configured users and only narrows the verifier.

## Non-blocking notes

- `AuthConfig::Supabase { jwt_secret }` derives `Debug`, so `format!("{config:?}")` would still print the Supabase secret. This was already true before this feature (`Config` derived `Debug` over `supabase_jwt_secret`), and nothing formats `Config` with `Debug` outside tests. A hand-written redacting `Debug` would make the two modes consistent; that is a follow-up, not in this spec.
- Timing equalisation only matches the first user's cost parameters, and there is no rate limiting. Both are documented and accepted in `design.md`.

## Required Changes

None.
