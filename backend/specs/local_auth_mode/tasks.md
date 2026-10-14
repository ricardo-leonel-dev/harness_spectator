# Tasks — local_auth_mode

Ordered; check off `[x]` as completed. Signatures, formats, error texts and test names are in
`design.md`. T1 comes first because `docs/architecture.md` requires the layer and dependency
allowlist change to land before the code that relies on it.

- [x] T1 (R17, R18, R20, R26, R27) Update `docs/architecture.md` as listed in `design.md` § "Files to
      touch": two auth modes, the scoped exception to "no login routes", `src/auth/` layer contents
      and `src/bin/hash_password.rs`, `argon2` in the allowlist, data flow, secrets list.
- [x] T2 (R38) `Cargo.toml`: add `argon2 = "0.6"`, the `[[bin]] hash-password` target, and
      `[profile.dev.package.argon2]` / `[profile.dev.package.blake2]` with `opt-level = 3`. Run
      `cargo build` and confirm both binaries build.
- [x] T3 (R24, R38) Add `src/auth/password.rs` (`hash_password`, `verify_password`,
      `parse_argon2id_hash`, `dummy_hash_like`) with round-trip, wrong-password, non-argon2id and
      parameter-copy unit tests; declare it in `src/auth/mod.rs`.
- [x] T4 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R24) Refactor
      `src/config.rs`: `AuthMode`, `AuthConfig`, `LocalAuthConfig` (hand-written redacting `Debug`),
      `LocalUser`, constants, `normalize_email`, `Config::from_lookup` with `from_env` delegating to
      it; build the dummy hash from the first entry. Add the `src/config.rs` unit tests named in
      `design.md`'s test plan for R1–R15 and R24, all driven by a `HashMap` lookup.
- [x] T5 (R16) `src/main.rs`: on `Config::from_env` failure print `configuration error: <Display>` to
      stderr and exit `1` before creating the pool; after loading, log the mode (and local user
      count) at `info`.
- [x] T6 (R25) `src/error.rs`: add `ApiError::BadRequest` → `400 {"error":"bad request"}`.
- [x] T7 (R19, R20, R21, R30, R31, R32, R33) Add `src/auth/local_token.rs` (`LocalClaims`,
      `LOCAL_TOKEN_ISSUER`, `LOCAL_TOKEN_AUDIENCE`, `issue_local_token`, `verify_local_jwt` with
      required `exp`/`iss`/`aud`/`sub` and `leeway = 0`) plus `issue_local_token_sets_claims` and
      one `verify_local_jwt_*` unit test per rejection case.
- [x] T8 (R28, R29, R30, R31, R32, R33, R34, R35) Replace `SupabaseUser` with `AuthUser` in
      `src/auth/extractor.rs`, dispatching on `state.config.auth` (supabase → unchanged
      `verify_supabase_jwt`; local → `verify_local_jwt`); switch `src/harness/router.rs` to
      `AuthUser`. Leave `src/auth/jwt.rs` unchanged.
- [x] T9 (R17, R18, R19, R22, R23, R24, R25) Add `src/auth/router.rs`: `get_auth_mode` and
      `post_login` (`JsonRejection` → `BadRequest`, normalized lookup, exactly one argon2
      verification in `spawn_blocking` against the user's hash or the dummy hash, `Unauthorized` on
      any failure, `NotFound` if reached with a supabase config). Logging per `design.md`.
- [x] T10 (R17, R26, R27, R37) `src/app.rs`: register `/api/auth/mode` always and
      `/api/auth/login` only in local mode; never register refresh/logout; CORS
      `allow_methods([Method::GET, Method::POST])`, headers unchanged.
- [x] T11 (R38, R39, R40, R41) Add `src/bin/hash_password.rs` per `design.md` § "`hash-password`
      binary" (one stdin line, strip one `\n` then one `\r`, empty → stderr + exit `1`, no env
      reads, no `dotenvy`).
- [x] T12 (R35) Update `tests/common/mod.rs`: `#![allow(dead_code)]` with its reason, local-mode
      constants, `cheap_hash`, `build_test_config_local` via `Config::from_lookup`,
      `build_test_app_with`, `lazy_pool`, `make_local_token`; keep `build_test_config` /
      `build_test_app` / `valid_token` / `make_token` meaning the supabase fixture. Touch
      `tests/harness.rs` only if the `Config` shape forces it, without changing any assertion.
- [x] T13 (R17, R18, R19, R20, R21, R22, R23, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34)
      Add `tests/auth.rs` with the integration tests named in `design.md`'s test plan.
- [x] T14 (R36, R37) Update `tests/cors.rs`: comments now say `GET` and `POST`; exact-set
      assertions for methods {GET, POST} and headers {authorization, content-type}; add
      `login_preflight_allows_post_and_content_type` on a local-mode app. Expectations come from
      R36/R37, not from observed output.
- [x] T15 (R16, R38, R39, R40, R41) Add `tests/binaries.rs` running both executables through
      `env!("CARGO_BIN_EXE_…")` with `env_clear()` and `current_dir(std::env::temp_dir())`.
- [x] T16 (R5, R9, R14) Update `.env.example` (`AUTH_MODE=supabase` live; the commented local block
      from `design.md`, single quotes and the `hash-password` command included) and
      `docs/verification.md` (Level 2 lists `tests/auth.rs` and `tests/binaries.rs`; Level 3 gains a
      local-mode smoke run: `hash-password`, `AUTH_MODE=local`, `GET /api/auth/mode`,
      `POST /api/auth/login`, then `GET /api/harness/projects` with the returned token).
- [x] T17 (R35) Run `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo build &&
      cargo test`; confirm every pre-existing test in `tests/harness.rs`, `tests/cors.rs` (other than
      the deliberate T14 changes), `tests/toolchain.rs` and `src/auth/jwt.rs` passes with unchanged
      assertions; write the R→test traceability table in `progress/impl_local_auth_mode.md`.
