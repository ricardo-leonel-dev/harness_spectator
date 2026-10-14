# Design — local_auth_mode

Follows `docs/architecture.md` (layers, error envelope, read-only database, secrets out of git) and
`docs/conventions.md` (naming, tests, comments). This file records only the choices made inside those
boundaries, plus the two places where this feature changes `docs/architecture.md` itself (T1).

## Decisions already made by the human

- Explicit `AUTH_MODE=supabase|local`, default `supabase`.
- Local users live in `.env` as `LOCAL_AUTH_USERS` (email + argon2 hash). No database table: the
  backend stays read-only against the toolkit mirror.
- A `hash-password` binary prints hashes, so plaintext passwords never reach `.env`.
- HS256 tokens signed with `LOCAL_AUTH_SECRET`. No refresh endpoint. Stateless logout.

## Frontend contract (`frontend/specs/local_auth_login`, A1–A7)

| # | Frontend assumption | Satisfied by |
|---|---|---|
| A1 | `GET /api/auth/mode` is public, `200 {"mode":"supabase"\|"local"}` | R17 |
| A2 | `POST /api/auth/login` → `200 {"accessToken": string, "expiresAt": number}`, unix seconds | R18, R19 (names adopted verbatim; `expiresAt` = token `exp`, an integer) |
| A3 | Bad credentials → `401`, generic body | R22, R23 (identical `{"error":"unauthorized"}`), R24 (timing) |
| A4 | Supabase mode: `POST /api/auth/login` → `404` | R26 |
| A5 | CORS allows `POST` and `Content-Type` for the frontend origin | R36, R37 |
| A6 | No refresh endpoint | R27 |
| A7 | Stateless token, logout needs no backend call | R27 (no logout route); nothing is stored server-side |

Extra facts the frontend can rely on (none of them require a frontend change):

- A malformed login body gets `400 {"error":"bad request"}` (R25); the frontend already maps any
  non-401 failure to its generic banner (its R10).
- The backend lowercases and trims the email before matching and puts that normalized form in the
  token. The frontend stores the email as typed; nothing reads it back from the token.
- Local tokens are rejected the second their `exp` passes (zero leeway, R32), which matches the
  frontend's own `expiresAt * 1000 <= Date.now()` rule.

## Environment variables

| Variable | Mode | Default | Rule |
|---|---|---|---|
| `AUTH_MODE` | both | `supabase` | `supabase` or `local`, exact lowercase. Unset or empty means `supabase` (consistent with `require_env` treating empty as missing). Anything else fails (R3). |
| `SUPABASE_JWT_SECRET` | supabase | — | Required in supabase mode only (R4, R6). |
| `LOCAL_AUTH_SECRET` | local | — | Required, ≥ 32 bytes (R7, R8). 32 bytes = 256 bits, the minimum HMAC key size RFC 7518 §3.2 sets for HS256. Suggested: `openssl rand -base64 48`. |
| `LOCAL_AUTH_USERS` | local | — | Required, ≥ 1 entry, format below (R9–R12). |
| `LOCAL_AUTH_TOKEN_TTL_SECONDS` | local | `3600` | Integer in `60..=86400` (R14, R15). One hour matches Supabase's default access-token lifetime; one day caps the damage of a leaked token, since there is no revocation. |

In supabase mode the three `LOCAL_AUTH_*` variables are not read at all (R5), so adding this feature
cannot break an existing supabase `.env`. `PORT`, `DATABASE_URL` and `FRONTEND_ORIGIN` are unchanged
and required in both modes.

### `LOCAL_AUTH_USERS` encoding

An argon2id PHC string looks like
`$argon2id$v=19$m=19456,t=2,p=1$<salt b64>$<hash b64>`. Two facts drive the format:

1. **`,` is inside the PHC string** (`m=…,t=…,p=…`), so `,` cannot separate users. PHC strings use
   only `$`, `=`, `,`, ASCII letters, digits, `+` and `/` (B64 without padding); they never contain
   `:` or `;`.
2. **`dotenvy` 0.15.7 expands `$NAME` and `${NAME}` in unquoted and double-quoted values**; only
   single-quoted values are literal (verified in `dotenvy-0.15.7/src/parse.rs`, `parse_value`:
   substitution is disabled only while `strong_quote` is set). An unquoted hash would silently turn
   into `v=19,t=2,p=1` fragments, because `$argon2id`, `$v` and so on expand to empty strings.

Format (R9):

```
LOCAL_AUTH_USERS='<email>:<phc>;<email>:<phc>'
```

- Entries are separated by `;`. Each entry splits at its **first** `:` into email and hash; both are
  trimmed. Whitespace around entries is ignored and empty entries are skipped, so a trailing `;` and
  one-user-per-line values work (`dotenvy` keeps newlines inside single quotes).
- **The whole value must be wrapped in single quotes in `.env`.** The R11 error message for a bad
  hash says so, because a missing quote is by far the most likely cause: the mangled value no
  longer parses as PHC.
- An email must be non-empty and contain `@`; it cannot contain `:` or `;`. Matching uses the
  normalized email (trim + ASCII lowercase), so duplicate detection (R12) is case-insensitive.
- The hash must parse as a PHC string with algorithm id `argon2id`. Its own `m`/`t`/`p` are used for
  verification, so users hashed with different costs can coexist.

Example for `.env.example` (comment block, not live values):

```
# AUTH_MODE=local
# LOCAL_AUTH_SECRET=replace-with-at-least-32-random-bytes-eg-openssl-rand-base64-48
# Generate each hash with: read -rs PW && printf '%s\n' "$PW" | cargo run --bin hash-password
# Keep the single quotes: without them dotenvy expands every `$` in the hash.
# LOCAL_AUTH_USERS='alice@example.com:$argon2id$v=19$m=19456,t=2,p=1$...;bob@example.com:$argon2id$...'
# LOCAL_AUTH_TOKEN_TTL_SECONDS=3600
```

## Startup validation errors

All go through the existing `ConfigError` (`Missing(&'static str)` / `Invalid(&'static str,
String)`). Messages never echo the secret or hash text (R13); they name the variable and, for users,
the 1-based entry position.

| Condition | Error |
|---|---|
| `AUTH_MODE` other value | `Invalid("AUTH_MODE", "expected `supabase` or `local`, got `<value>`")` |
| supabase, no `SUPABASE_JWT_SECRET` | `Missing("SUPABASE_JWT_SECRET")` (unchanged) |
| local, no `LOCAL_AUTH_SECRET` | `Missing("LOCAL_AUTH_SECRET")` |
| local, secret < 32 bytes | `Invalid("LOCAL_AUTH_SECRET", "must be at least 32 bytes, got <n>")` |
| local, no users / zero entries | `Missing("LOCAL_AUTH_USERS")` |
| entry without `:` | `Invalid("LOCAL_AUTH_USERS", "entry <n>: expected <email>:<argon2id hash>")` |
| bad email | `Invalid("LOCAL_AUTH_USERS", "entry <n>: email must be non-empty and contain @")` |
| bad hash | `Invalid("LOCAL_AUTH_USERS", "entry <n>: hash is not an argon2id PHC string; wrap the whole value in single quotes in .env so `$` is not expanded")` |
| duplicate email | `Invalid("LOCAL_AUTH_USERS", "entry <n>: duplicate email")` |
| bad TTL | `Invalid("LOCAL_AUTH_TOKEN_TTL_SECONDS", "must be an integer between 60 and 86400")` |

The email itself is not echoed either: it is not a secret, but leaving it out keeps the rule simple
("no value from `LOCAL_AUTH_USERS` in errors") and R13 testable without exceptions.

`main.rs` today returns `Box<dyn Error>` from `main`, which prints the `Debug` form
(`Error: Invalid("AUTH_MODE", "…")`). It changes to print `configuration error: <Display>` to stderr
and `std::process::exit(1)` when `Config::from_env` fails (R16). Config loading already runs before
the pool is created, so no database connection is attempted. After a successful load, `main` logs
`auth mode: <mode>` at `info` (and, in local mode, the user count, never the emails or hashes).

## Token

HS256, signed with `LOCAL_AUTH_SECRET` (R20). Claims (R21):

| Claim | Value | Why |
|---|---|---|
| `sub` | normalized email | Users have no other id. |
| `email` | normalized email | Mirrors Supabase's claim name; handy for logs/debugging. |
| `iss` | `"harness-spectator"` | Supabase sets `iss` to `https://<ref>.supabase.co/auth/v1`; a fixed different issuer marks the token as ours. |
| `aud` | `"harness-spectator-local"` | Supabase uses `"authenticated"`. The Supabase verifier already requires that audience, so a local token is rejected in supabase mode even if both secrets were equal (R34). |
| `iat` | issue time, unix seconds | |
| `exp` | `iat + LOCAL_AUTH_TOKEN_TTL_SECONDS` | Returned verbatim as `expiresAt` (R19). |

Verification in local mode: `Validation::new(HS256)`, `set_audience(&["harness-spectator-local"])`,
`set_issuer(&["harness-spectator"])`, `set_required_spec_claims(&["exp", "iss", "aud", "sub"])`,
`leeway = 0`. Zero leeway makes the backend agree with the frontend's expiry rule; the Supabase
verifier keeps `jsonwebtoken`'s default leeway (unchanged behaviour, R35).

Mode separation is enforced twice: by secret and by `aud`/`iss`. R29–R34 test each layer on its
own (wrong secret, right secret + wrong `aud`, right secret + wrong `iss`).

No refresh endpoint and no logout endpoint (R27): tokens are not stored anywhere, so logout is the
client dropping the token, and an expired token means signing in again. Consequence, accepted by the
human: a leaked token is valid until `exp`; rotating `LOCAL_AUTH_SECRET` and restarting invalidates
every token at once.

## Login handler and timing

`POST /api/auth/login`, local mode only:

1. Body extraction as `Result<Json<LoginRequest>, JsonRejection>`; any rejection (bad JSON, missing
   field, wrong type, wrong/missing `Content-Type`) → `ApiError::BadRequest` → `400
   {"error":"bad request"}` (R25). Axum's default rejection would answer with a plain-text body,
   which violates the error-envelope principle.
2. Normalize the email and look it up.
3. Run exactly one argon2 verification inside `tokio::task::spawn_blocking` (argon2 is CPU-bound and
   must not stall the async workers): against the user's hash if found, otherwise against the
   **dummy hash** with the submitted password. A `JoinError` maps to `ApiError::Internal`.
4. Found and verified → issue the token, `200` (R18). Anything else → `ApiError::Unauthorized`, the
   same `401 {"error":"unauthorized"}` the protected routes already use (R22, R23).

The dummy hash is built once in config loading by hashing a fixed string with a random salt and the
`m`/`t`/`p` parameters of the first entry (R24). Unknown emails therefore cost one argon2 run with the
same work factor as a real user, instead of answering in microseconds. It is "constant-time-ish":
the lookup itself and per-user cost differences still leak a little, which is acceptable for a LAN
dashboard. R24 tests the parameter match; the reviewer confirms by reading the handler that the
unknown-email branch calls the verifier on the dummy hash.

Logging: a successful login logs `info` with the normalized email; a failed one logs `info` without
the submitted email or password. Tokens, hashes and the secret are never logged. `LocalAuthConfig`
gets a hand-written `Debug` that prints `<redacted>` for the secret and hashes (the derived `Debug` on
`Config` would otherwise print them).

Non-goal: rate limiting. The argon2 cost already makes online guessing slow for a LAN tool; adding a
limiter is a separate feature if the dashboard is ever exposed beyond a LAN.

## Files to touch

| File | Change |
|---|---|
| `docs/architecture.md` | (T1, before any code) Auth section: two modes, the narrow revival of self-issued tokens and why it does not contradict the "Supabase Auth over custom JWT" rationale (local mode exists for LANs without a Supabase project; supabase mode is unchanged). Layers: `src/auth/` now also owns `password.rs`, `local_token.rs`, `router.rs` (`/api/auth/*`); new `src/bin/hash_password.rs`. Allowlist: add `argon2`. Data flow: `/api/auth/mode`, `/api/auth/login`, mode-dependent verifier. "What NOT to do": the login bullet becomes "no login/logout/refresh routes except `POST /api/auth/login` in local mode; no stored sessions". Secrets list gains `LOCAL_AUTH_SECRET` and `LOCAL_AUTH_USERS`. Principle 4: still no `INSERT`/`UPDATE`/`DELETE`, still no server-side session state. |
| `Cargo.toml` | `argon2 = "0.6"` (default features `alloc`, `getrandom`, `password-hash`; 0.6.0 is crates.io's `max_stable_version` at drafting time, MSRV 1.85 ≤ our 1.94). `[[bin]] name = "hash-password", path = "src/bin/hash_password.rs"`. `[profile.dev.package.argon2]` and `[profile.dev.package.blake2]` with `opt-level = 3`, so debug-build tests and `cargo run --bin hash-password` do not take seconds per hash. |
| `src/config.rs` | `Config::from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Config, ConfigError>`; `from_env` becomes `Self::from_lookup(\|k\| env::var(k).ok())`. New types below. `supabase_jwt_secret: String` moves into `AuthConfig::Supabase`. Unit tests use a `HashMap`, never the process environment (parallel tests would race on it). |
| `src/main.rs` | Display-form config error + `exit(1)`; log the mode (R16). |
| `src/error.rs` | `ApiError::BadRequest` → `400`, message `"bad request"`. |
| `src/auth/password.rs` (new) | `hash_password`, `verify_password`, `parse_argon2id_hash`, `dummy_hash_like`. |
| `src/auth/local_token.rs` (new) | `LocalClaims`, `LOCAL_TOKEN_ISSUER`, `LOCAL_TOKEN_AUDIENCE`, `issue_local_token`, `verify_local_jwt`. |
| `src/auth/router.rs` (new) | `get_auth_mode`, `post_login`, `LoginRequest`, `LoginResponse`, `AuthModeResponse`. |
| `src/auth/extractor.rs` | `SupabaseUser` → `AuthUser { pub sub: String }`, dispatching on `state.config.auth`. |
| `src/auth/mod.rs` | Declare the three new modules. |
| `src/harness/router.rs` | `_user: SupabaseUser` → `_user: AuthUser`. |
| `src/app.rs` | Routes and CORS (below). |
| `src/bin/hash_password.rs` (new) | The binary (below). |
| `tests/common/mod.rs` | Local-mode fixtures (below). |
| `tests/auth.rs` (new), `tests/binaries.rs` (new) | See "Test plan". |
| `tests/cors.rs` | See "CORS". |
| `tests/harness.rs` | Only if the `Config` shape change forces it; no assertion changes (R35). |
| `.env.example`, `docs/verification.md` | Both modes documented (T16). |

## New signatures

```rust
// src/config.rs
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthMode { Supabase, Local }
impl AuthMode { pub fn as_str(self) -> &'static str } // "supabase" | "local"

#[derive(Clone, Debug)]
pub enum AuthConfig {
    Supabase { jwt_secret: String },
    Local(LocalAuthConfig),
}
impl AuthConfig { pub fn mode(&self) -> AuthMode }

#[derive(Clone)] // Debug implemented by hand, redacting secret and hashes
pub struct LocalAuthConfig {
    pub secret: String,
    pub users: Vec<LocalUser>,
    pub token_ttl_secs: u64,
    pub dummy_hash: String,
}

#[derive(Clone)]
pub struct LocalUser { pub email: String, pub password_hash: String } // email normalized

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub frontend_origin: String,
    pub auth: AuthConfig,
}

pub const DEFAULT_LOCAL_TOKEN_TTL_SECS: u64 = 3600;
pub const MIN_LOCAL_TOKEN_TTL_SECS: u64 = 60;
pub const MAX_LOCAL_TOKEN_TTL_SECS: u64 = 86_400;
pub const MIN_LOCAL_AUTH_SECRET_BYTES: usize = 32;

impl Config {
    pub fn from_env() -> Result<Self, ConfigError>;
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError>;
}
pub fn normalize_email(raw: &str) -> String;

// src/auth/password.rs
#[derive(Debug, thiserror::Error)]
#[error("password hashing failed")]
pub struct PasswordError;
pub fn hash_password(password: &str) -> Result<String, PasswordError>;      // Argon2::default(), random salt
pub fn verify_password(password: &str, phc: &str) -> bool;                  // false on parse or mismatch
pub fn parse_argon2id_hash(phc: &str) -> Result<argon2::Params, PasswordError>; // PHC + alg == argon2id
pub fn dummy_hash_like(phc: &str) -> Result<String, PasswordError>;         // same m/t/p, random salt

// src/auth/local_token.rs
pub const LOCAL_TOKEN_ISSUER: &str = "harness-spectator";
pub const LOCAL_TOKEN_AUDIENCE: &str = "harness-spectator-local";
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalClaims { pub sub: String, pub email: String, pub iss: String, pub aud: String, pub iat: u64, pub exp: u64 }
pub fn issue_local_token(config: &LocalAuthConfig, email: &str, now: u64) -> Result<(String, u64), ApiError>; // (token, exp)
pub fn verify_local_jwt(secret: &str, token: &str) -> Result<LocalClaims, ApiError>;

// src/auth/router.rs
#[derive(Deserialize)] pub struct LoginRequest { pub email: String, pub password: String }
#[derive(Serialize)] pub struct LoginResponse {
    #[serde(rename = "accessToken")] pub access_token: String,
    #[serde(rename = "expiresAt")] pub expires_at: u64,
}
#[derive(Serialize)] pub struct AuthModeResponse { pub mode: &'static str }
pub async fn get_auth_mode(State(state): State<AppState>) -> Json<AuthModeResponse>;
pub async fn post_login(State(state): State<AppState>, payload: Result<Json<LoginRequest>, JsonRejection>)
    -> Result<Json<LoginResponse>, ApiError>;

// src/auth/extractor.rs
pub struct AuthUser { pub sub: String }
```

Explicit `#[serde(rename = "…")]` per field matches `src/harness/reader.rs`. `verify_password`
parses with `PasswordHash::new` and calls `Argon2::default().verify_password`, which uses the hash's
own parameters. `parse_argon2id_hash` uses `Params::try_from(&PasswordHash)` (available in 0.6.0)
after checking the algorithm id. `issue_local_token` takes `now` so unit tests are clock-free; the
handler passes `chrono::Utc::now().timestamp() as u64`.

`src/auth/jwt.rs` (`Claims`, `verify_supabase_jwt`) stays unchanged.

## Routes and CORS (`src/app.rs`)

```rust
let mut router = Router::new()
    .route("/api/auth/mode", get(get_auth_mode))
    .route("/api/harness/projects", get(get_projects))
    .route("/api/harness/projects/{slug}/state", get(get_project_state));
if config.auth.mode() == AuthMode::Local {
    router = router.route("/api/auth/login", post(post_login));
}
```

In supabase mode `/api/auth/login` is simply not registered, so it answers like any unknown path:
`404` (R26). `/api/auth/refresh` and `/api/auth/logout` are never registered (R27). `post_login`
still returns `ApiError::NotFound` if it is ever reached with a supabase config, so the handler never
assumes the router got it right.

CORS becomes `.allow_methods([Method::GET, Method::POST])` with the same origin and headers (R37).
The list is constant and mode-independent: `POST` is harmless in supabase mode (the route is 404),
and a constant config keeps `tower-http` 0.7 from emitting `Vary`, which
`tests/cors.rs::preflight_does_not_emit_vary_for_constant_config` pins.

### `tests/cors.rs` changes (deliberate, derived from configured intent)

- `preflight_options_returns_204_with_expected_cors_headers`: its doc comment and inline comments say
  "only configured method (`GET`)"; update them to "`GET` and `POST` (R37)". Strengthen the methods
  assertion from "contains GET" to "the comma-separated set equals {GET, POST}" and the headers
  assertion to "the set equals {authorization, content-type}". These sets come from the spec, not
  from observing the binary.
- New `login_preflight_allows_post_and_content_type` (R36): local-mode app, `OPTIONS /api/auth/login`
  with `Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: content-type`;
  asserts status `200` (the `tower-http` 0.7 preflight status already pinned in this file),
  `Allow-Origin == TEST_FRONTEND_ORIGIN`, methods contain `POST`, headers contain `content-type`.
- `non_preflight_get_carries_allow_origin` and the `Vary` test stay as they are.

## `hash-password` binary

`cargo run --bin hash-password`. Reads **one line** from stdin, strips one trailing `\n` and then one
`\r`, nothing else (leading/trailing spaces are part of the password). Empty → `password must not be
empty` on stderr, exit `1`, stdout untouched (R40). Otherwise prints `hash_password(..)` followed by
`\n` and exits `0` (R38). It reads no environment variables and does not call `dotenvy` (R41), so it
works on a machine with no `.env`.

Reading stdin instead of an argument keeps the password out of shell history and `ps`. Typing at a
terminal echoes; `.env.example` documents `read -rs PW && printf '%s\n' "$PW" | cargo run --bin
hash-password` for a no-echo flow.

## Test fixtures (`tests/common/mod.rs`)

- Add `#![allow(dead_code)]` at the top with a one-line comment: each integration test crate uses a
  different subset of these helpers, and `clippy --all-targets -D warnings` would otherwise fail.
- `TEST_LOCAL_SECRET` (a 40-byte literal), `TEST_LOCAL_EMAIL = "alice@example.com"`,
  `TEST_LOCAL_PASSWORD`.
- `cheap_hash(password) -> String`: argon2id with `Params::new(8, 1, 1, None)` (the minimum memory
  cost) so every login test runs in milliseconds; verification reads parameters from the hash, so
  the production code path is unchanged.
- `build_test_config_local()` builds the config **through `Config::from_lookup`** with a `HashMap`
  (`AUTH_MODE=local`, the secret, `LOCAL_AUTH_USERS` holding `TEST_LOCAL_EMAIL:cheap_hash(..)`), so
  integration tests exercise the real parser. `build_test_config()` keeps producing the supabase
  config (now `auth: AuthConfig::Supabase { jwt_secret: TEST_JWT_SECRET }`).
- `build_test_app_with(pool, config)`; `build_test_app(pool)` keeps its current meaning.
- `lazy_pool() -> PgPool`: `PgPoolOptions::new().connect_lazy("postgres://unused@localhost/unused")`
  for tests that never reach a query (mode endpoint, login, `401` rejections, preflight), so they do
  not need a running Postgres. Tests that need a real `200` from a protected route use
  `#[sqlx::test]`.
- `make_local_token(secret, exp_offset, aud, iss) -> String`.

## Test plan

Unit tests live next to the code (`#[cfg(test)] mod tests`); integration tests use
`tower::ServiceExt::oneshot` on `build_app`, per `docs/verification.md` Level 2. Binary tests run the
real executables through `env!("CARGO_BIN_EXE_<name>")` with `Command::env_clear()` and a
`current_dir` of `std::env::temp_dir()` (no `.env` there for `dotenvy` to find).

Grouping per `docs/specs.md` "Coverage granularity": where one test covers several requirements, all
ids are listed.

| Requirement(s) | Test | Where |
|---|---|---|
| R1 | `auth_mode_defaults_to_supabase_when_unset_or_empty` | `src/config.rs` |
| R2 | `auth_mode_accepts_supabase_and_local` | `src/config.rs` |
| R3 | `auth_mode_rejects_unknown_value` (cases `Local`, `ldap`) | `src/config.rs` |
| R4 | `supabase_mode_requires_supabase_jwt_secret` | `src/config.rs` |
| R5 | `supabase_mode_ignores_invalid_local_vars` (short secret, garbage users, TTL `0`) | `src/config.rs` |
| R6 | `local_mode_does_not_require_supabase_jwt_secret` | `src/config.rs` |
| R7 | `local_mode_requires_secret` | `src/config.rs` |
| R8 | `local_mode_rejects_short_secret` (31 bytes fails, 32 passes) | `src/config.rs` |
| R9 | `local_users_parse_multiple_entries_with_whitespace_and_trailing_separator` (includes a newline-separated value and a PHC string with its `,`) | `src/config.rs` |
| R10 | `local_mode_requires_at_least_one_user` (unset, empty, `" ; "`) | `src/config.rs` |
| R11 | `local_users_reject_malformed_entry_naming_position` (no `:`, empty email, no `@`, non-PHC hash, `$argon2i$` hash, and a dotenvy-mangled hash like `v=19,t=2,p=1` — each asserts `entry 2` in the message) | `src/config.rs` |
| R12 | `local_users_reject_duplicate_email_case_insensitively` | `src/config.rs` |
| R13 | `config_errors_never_echo_secret_or_hash` (runs the R8 and R11 failures, asserts the `Display` text contains neither) | `src/config.rs` |
| R14 | `local_token_ttl_defaults_to_3600` | `src/config.rs` |
| R15 | `local_token_ttl_rejects_out_of_range_or_non_integer` (`59`, `86401`, `abc`, `-1`; `60` and `86400` pass) | `src/config.rs` |
| R16 | `server_exits_nonzero_naming_variable_on_bad_config` (`AUTH_MODE=bogus`, unreachable `DATABASE_URL`; asserts non-zero exit, stderr contains `AUTH_MODE`) | `tests/binaries.rs` |
| R17 | `mode_endpoint_reports_supabase`, `mode_endpoint_reports_local` (no `Authorization`, exact body) | `tests/auth.rs` |
| R18, R19, R20, R21 | `login_returns_token_with_expected_claims` (exact key set; decodes with `TEST_LOCAL_SECRET` and HS256; checks the full claim set, `exp - iat == ttl`, `expiresAt == exp`; email sent as `" Alice@Example.com "` to prove normalization) | `tests/auth.rs` |
| R20, R21 | `issue_local_token_sets_claims` (fixed `now`) | `src/auth/local_token.rs` |
| R22, R23 | `login_rejects_wrong_password_and_unknown_email_identically` (both `401`, byte-identical bodies equal to `{"error":"unauthorized"}`) | `tests/auth.rs` |
| R24 | `dummy_hash_matches_first_user_params` | `src/config.rs` |
| R25 | `login_rejects_malformed_body_with_400` (invalid JSON, missing `password`, numeric `email`, no `Content-Type`) | `tests/auth.rs` |
| R26 | `login_route_absent_in_supabase_mode` | `tests/auth.rs` |
| R27 | `refresh_and_logout_routes_do_not_exist` (both modes) | `tests/auth.rs` |
| R28 | `local_token_from_login_reads_projects` (`#[sqlx::test]`: login, then `GET /api/harness/projects` with that token → `200`) | `tests/auth.rs` |
| R29 | `local_mode_rejects_supabase_token` | `tests/auth.rs` |
| R30 | `local_mode_rejects_local_secret_with_supabase_audience` | `tests/auth.rs` |
| R31 | `local_mode_rejects_wrong_issuer` | `tests/auth.rs` |
| R32 | `local_mode_rejects_expired_token` (`exp = now - 10`, inside the default 60 s leeway, so it proves `leeway = 0`) | `tests/auth.rs` |
| R33 | `local_mode_rejects_token_signed_with_other_secret` | `tests/auth.rs` |
| R30–R33 | `verify_local_jwt_*` unit tests, one per case | `src/auth/local_token.rs` |
| R34 | `supabase_mode_rejects_local_token_signed_with_supabase_secret` | `tests/auth.rs` |
| R35 | Pre-existing `tests/harness.rs` and `src/auth/jwt.rs` tests, assertions unchanged (baseline comparison) | existing |
| R36 | `login_preflight_allows_post_and_content_type` | `tests/cors.rs` |
| R37 | `preflight_options_returns_204_with_expected_cors_headers` (exact sets), `preflight_does_not_emit_vary_for_constant_config` (constant config) | `tests/cors.rs` |
| R38, R41 | `hash_password_binary_prints_verifiable_argon2id_hash` (empty env; `"pw with spaces \n"` in, asserts one stdout line that `verify_password` accepts for `"pw with spaces "`, exit `0`) | `tests/binaries.rs` |
| R39 | `hash_password_binary_uses_fresh_salt` | `tests/binaries.rs` |
| R40 | `hash_password_binary_rejects_empty_input` (empty stdin and `"\n"`) | `tests/binaries.rs` |

`hash_password`/`verify_password` also get round-trip and wrong-password unit tests in
`src/auth/password.rs`.

## Discarded alternatives

1. **A users table in the mirror database.** Rejected by the human and by the architecture: the
   backend never writes to the mirror and does not own its schema (`db/schema.postgres.sql` belongs to
   the toolkit).
2. **JSON for `LOCAL_AUTH_USERS`** (`[{"email":…,"hash":…}]`). Rejected: it still needs single quotes
   (the `$` problem does not go away), and hand-editing nested quotes in `.env` is more error-prone
   than `email:hash;…`.
3. **One variable per user** (`LOCAL_AUTH_USER_1=…`). Rejected: numbering gaps need rules, and
   discovering variables by prefix scan is more code for no gain at the expected one to three users.
4. **Base64-wrapping the PHC string** to dodge `$`. Rejected: it hides the algorithm and cost from
   the person reading `.env`, and single quotes already solve the problem.
5. **Reuse `SUPABASE_JWT_SECRET` for local tokens and separate them by `aud` only.** Rejected: local
   mode exists for machines without a Supabase project, so that secret may not exist; a separate
   secret also means a leak of one does not mint tokens for the other.
6. **Accept both token kinds in either mode.** Rejected by the acceptance criteria ("only tokens valid
   for the active mode") and it would widen the attack surface for no user benefit.
7. **Mode-dependent CORS methods** (`POST` only in local mode). Rejected: it adds a branch for no
   security gain (the route is 404 in supabase mode) and breaks the constant-config property the
   `Vary` regression test relies on.
8. **Registering `/api/auth/login` in supabase mode with a handler that returns `404`.** Rejected:
   the acceptance says the route "does not exist"; leaving it unregistered makes that literal and
   behaves exactly like every other unknown path.
9. **`rpassword` for a no-echo prompt in `hash-password`.** Rejected: a new dependency for a one-off
   developer tool; `read -rs` gives the same result and is documented.
10. **Return `401` for a malformed login body.** Rejected: it would hide client bugs behind the
    "wrong password" message; `400` is accurate and the frontend treats it as its generic failure.
