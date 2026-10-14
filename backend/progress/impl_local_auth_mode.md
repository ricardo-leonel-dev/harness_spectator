# impl: local_auth_mode (feature 5, sdd=1)

## Outcome
`AUTH_MODE=supabase|local` (default `supabase`). Local mode: users come from `LOCAL_AUTH_USERS`
(`'<email>:<argon2id PHC>;...'`), `POST /api/auth/login` returns `{accessToken, expiresAt}` (HS256,
`LOCAL_AUTH_SECRET`, `iss=harness-spectator`, `aud=harness-spectator-local`, zero leeway), and
protected routes accept only tokens for the active mode. `GET /api/auth/mode` is public. CORS allows
GET+POST with `authorization`/`content-type`. The new `hash-password` binary prints hashes from stdin.
Supabase mode keeps its behaviour: `src/auth/jwt.rs` and `tests/harness.rs` are unchanged. The
contract matches `frontend/specs/local_auth_login` A1-A7 exactly (field names, unix-second
`expiresAt`, 401 on bad credentials, 404 for login in supabase mode, CORS POST + content-type, no
refresh/logout).

## Scope / files
- Docs (T1 first): `docs/architecture.md` (auth modes, the narrow local-mode exception, `src/auth/`
  contents, `src/bin/`, `argon2` added to the allowlist, 400 in the error list, data flow, what NOT to
  do, secrets list), `docs/verification.md`, `.env.example`.
- `Cargo.toml` / `Cargo.lock`: `argon2 = "0.6"` (resolved 0.6.0), `[[bin]] hash-password`,
  dev-profile `opt-level = 3` for `argon2` and `blake2`.
- New: `src/auth/password.rs`, `src/auth/local_token.rs`, `src/auth/router.rs`,
  `src/bin/hash_password.rs`, `tests/auth.rs`, `tests/binaries.rs`.
- Changed: `src/config.rs` (`from_lookup`, `AuthMode`, `AuthConfig`, `LocalAuthConfig`/`LocalUser`
  with redacting `Debug`, `normalize_email`), `src/main.rs`, `src/error.rs` (`BadRequest`),
  `src/auth/extractor.rs` (`SupabaseUser` -> `AuthUser`), `src/auth/mod.rs`, `src/harness/router.rs`,
  `src/app.rs`, `tests/common/mod.rs`, `tests/cors.rs`.
- `specs/local_auth_mode/tasks.md`: T1-T17 all checked off.

## Deviations / interpretation notes (all inside the spec)
- Entry numbering (R11/R12): entries are counted after skipping empty `;` segments, so
  `a;;b-bad` reports `entry 2`. The requirements define an entry as an `email:hash` item, and an
  empty segment is not one.
- `parse_argon2id_hash` also requires a salt and output, not just the `argon2id` id. A PHC string
  without them can never verify a password, so rejecting it at startup is stricter but consistent
  with R11.
- `verify_password` returns `false` for non-argon2id PHC strings as well.
- Extra tests beyond the plan: `local_auth_debug_redacts_secret_and_hashes` (the design's redacting
  `Debug`), `verify_local_jwt_accepts_issued_token`, 400 cases for an array body and `text/plain`, a
  CRLF case for `hash-password`, and a `\r\n`-only stdin case for R40.
- `R16` test: the server is given an unroutable `DATABASE_URL` and must exit in under 5 s (the pool's
  acquire timeout), which shows config fails before any connection attempt.

## Traceability (R -> test)
| R | Test (file) |
|---|---|
| R1 | `auth_mode_defaults_to_supabase_when_unset_or_empty` (src/config.rs) |
| R2 | `auth_mode_accepts_supabase_and_local` (src/config.rs) |
| R3 | `auth_mode_rejects_unknown_value` (src/config.rs) |
| R4 | `supabase_mode_requires_supabase_jwt_secret` (src/config.rs) |
| R5 | `supabase_mode_ignores_invalid_local_vars` (src/config.rs) |
| R6 | `local_mode_does_not_require_supabase_jwt_secret` (src/config.rs) |
| R7 | `local_mode_requires_secret` (src/config.rs) |
| R8 | `local_mode_rejects_short_secret` (src/config.rs) |
| R9 | `local_users_parse_multiple_entries_with_whitespace_and_trailing_separator` (src/config.rs) |
| R10 | `local_mode_requires_at_least_one_user` (src/config.rs) |
| R11 | `local_users_reject_malformed_entry_naming_position` (src/config.rs) |
| R12 | `local_users_reject_duplicate_email_case_insensitively` (src/config.rs) |
| R13 | `config_errors_never_echo_secret_or_hash` (src/config.rs) |
| R14 | `local_token_ttl_defaults_to_3600` (src/config.rs) |
| R15 | `local_token_ttl_rejects_out_of_range_or_non_integer` (src/config.rs) |
| R16 | `server_exits_nonzero_naming_variable_on_bad_config` (tests/binaries.rs) |
| R17 | `mode_endpoint_reports_supabase`, `mode_endpoint_reports_local` (tests/auth.rs) |
| R18, R19, R20, R21 | `login_returns_token_with_expected_claims` (tests/auth.rs); R19-R21 also `issue_local_token_sets_claims` (src/auth/local_token.rs) |
| R22, R23 | `login_rejects_wrong_password_and_unknown_email_identically` (tests/auth.rs) |
| R24 | `dummy_hash_matches_first_user_params` (src/config.rs), `dummy_hash_like_copies_parameters_with_fresh_salt` (src/auth/password.rs); the unknown-email branch verifies against `local.dummy_hash` in `src/auth/router.rs::post_login` |
| R25 | `login_rejects_malformed_body_with_400` (tests/auth.rs) |
| R26 | `login_route_absent_in_supabase_mode` (tests/auth.rs) |
| R27 | `refresh_and_logout_routes_do_not_exist` (tests/auth.rs) |
| R28 | `local_token_from_login_reads_projects` (tests/auth.rs, `#[sqlx::test]`) |
| R29 | `local_mode_rejects_supabase_token` (tests/auth.rs) |
| R30 | `local_mode_rejects_local_secret_with_supabase_audience` (tests/auth.rs), `verify_local_jwt_rejects_supabase_audience` (src/auth/local_token.rs) |
| R31 | `local_mode_rejects_wrong_issuer` (tests/auth.rs), `verify_local_jwt_rejects_wrong_issuer` |
| R32 | `local_mode_rejects_expired_token` (exp = now-10, inside the default 60 s leeway) (tests/auth.rs), `verify_local_jwt_rejects_expired_token_without_leeway` |
| R33 | `local_mode_rejects_token_signed_with_other_secret` (tests/auth.rs), `verify_local_jwt_rejects_other_secret` |
| R34 | `supabase_mode_rejects_local_token_signed_with_supabase_secret` (tests/auth.rs) |
| R35 | Baseline: `tests/harness.rs` (8 tests) and `src/auth/jwt.rs` (4 tests) not modified (`git diff` empty for both) and green |
| R36 | `login_preflight_allows_post_and_content_type` (tests/cors.rs) |
| R37 | `preflight_options_returns_204_with_expected_cors_headers` (exact sets {GET,POST}, {authorization,content-type}), `preflight_does_not_emit_vary_for_constant_config` (tests/cors.rs) |
| R38, R41 | `hash_password_binary_prints_verifiable_argon2id_hash` (tests/binaries.rs, `env_clear`) |
| R39 | `hash_password_binary_uses_fresh_salt` (tests/binaries.rs) |
| R40 | `hash_password_binary_rejects_empty_input` (tests/binaries.rs) |

## Verification
- `./init.sh`: exit 0, `[OK] Environment ready`. One `[WARN]`:
  `[WARN]  cannot reach http://localhost:3001 — skipping mirror sync` (Docker mirror down, environmental).
- verify_command (fmt --check, clippy --all-targets -D warnings, build, test) green with the default
  `DATABASE_URL` (local Homebrew Postgres, role harness_test). 64 tests passed, 0 failed:
  lib 32, auth 14, binaries 4, cors 4, harness 8, toolchain 2.
- No PostgreSQL baseline or mock-data profile is configured (`harness/instructions/postgres.md` and
  `mock-data.md` absent; no `postgres_schemas`), so the ordinary green-tests policy applies.
- Manual smoke (release-less debug binary on port 4055, temp dir with a real `.env` and a
  single-quoted `LOCAL_AUTH_USERS` produced by `hash-password`): `/api/auth/mode` -> `{"mode":"local"}`;
  wrong password -> `401 {"error":"unauthorized"}`; correct password -> 200 with token and
  `expiresAt`; protected route with that token passed auth and reached the DB layer (500 only
  because the test DB has no mirror tables and the Docker mirror on 54329 is unreachable,
  `PoolTimedOut`); preflight -> `allow-methods: GET,POST`, `allow-headers: authorization,content-type`,
  `allow-origin: http://localhost:4200`. Log showed `auth mode: local users=1`. The smoke process was
  stopped; the dev server on :4000 was not touched. Temp `.env` deleted.
- Not done: `backend/.env` untouched (orchestrator-owned). The running dev server needs a restart to
  pick up the new code.
