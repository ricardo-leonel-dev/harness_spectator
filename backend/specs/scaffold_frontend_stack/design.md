# Design — scaffold_frontend_stack (backend half)

> **Scope note.** The original design covered both stacks in one document. This is the backend
> half; the frontend's UI structure, file tree, TypeScript signatures and its own discarded
> alternatives (templated `environment.ts`, `msw`) live in the frontend project's
> `specs/scaffold_frontend_stack/design.md`.

## Already completed (by the original spec-authoring session, not the implementer)

`docs/architecture.md`, `docs/conventions.md`, and `docs/verification.md` have been filled in with
the concrete stack decisions (Rust + Axum backend, Supabase Auth, Supabase-shaped Postgres schema),
each discarded alternative's rationale, dependency allowlist, and naming/testing conventions. Read
`docs/architecture.md` in full before starting T1 — this file only explains choices made *within*
those boundaries, it does not re-derive them.

## Files to create

```
Cargo.toml                       # deps per architecture.md allowlist
.env.example                     # PORT=4000, DATABASE_URL=postgres://..., SUPABASE_JWT_SECRET=..., FRONTEND_ORIGIN=http://localhost:4200
migrations/
  0001_harness_schema.sql        # projects, features, session_log tables — Supabase-portable (R4): no local-only extensions
src/
  main.rs                        # loads Config, builds PgPool, calls build_app, axum::serve
  config.rs                      # Config::from_env(): port, database_url, supabase_jwt_secret, frontend_origin
  app.rs                         # build_app(pool: PgPool, config: Config) -> Router — CORS + trace layers + routes
  error.rs                       # ApiError enum + IntoResponse impl -> JSON { "error": ... } envelope
  auth/
    mod.rs
    jwt.rs                       # verify_supabase_jwt(secret, token) -> Result<Claims, ApiError>
    extractor.rs                 # SupabaseUser: FromRequestParts extracting + verifying the Bearer token
  harness/
    mod.rs
    reader.rs                    # read_harness_state(pool, project_slug) -> Result<HarnessStateResponse, ApiError>
    router.rs                    # GET /api/harness/state handler, requires SupabaseUser extractor
tests/
  harness.rs                     # R3, R5, R6, R7, R8 — sqlx::test-backed axum integration tests
```

## Key signatures

```rust
// src/config.rs
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub supabase_jwt_secret: String,
    pub frontend_origin: String,
}
impl Config {
    pub fn from_env() -> Result<Self, ConfigError>; // fails fast if a required var is missing
}

// src/app.rs
pub fn build_app(pool: PgPool, config: Config) -> Router;
// tests call build_app(test_pool, test_config) and drive it with tower::ServiceExt::oneshot —
// never start a real network listener

// src/auth/jwt.rs
pub struct Claims { pub sub: String, pub exp: usize, pub aud: String }
pub fn verify_supabase_jwt(secret: &str, token: &str) -> Result<Claims, ApiError>;
// HS256 verification against SUPABASE_JWT_SECRET; validates exp and aud == "authenticated"
// (Supabase's default audience claim for signed-in users)

// src/auth/extractor.rs
pub struct SupabaseUser(pub Claims);
impl<S> FromRequestParts<S> for SupabaseUser { /* reads Authorization header, calls verify_supabase_jwt,
    missing/malformed header or verification failure -> ApiError::Unauthorized */ }

// src/harness/reader.rs
pub struct HarnessStateResponse {
    pub project: ProjectInfo,
    pub features: Vec<FeatureRow>,
    pub open_session: Option<OpenSessionInfo>,
    pub blocked_features: Vec<BlockedFeatureInfo>,
}
pub async fn read_harness_state(pool: &PgPool, project_slug: &str) -> Result<HarnessStateResponse, ApiError>;
// SELECT-only queries against projects/features/session_log — never INSERT/UPDATE/DELETE, enforcing
// R3 alongside R2's DATABASE_URL-only connection convention
```

The JSON shape this serializes to is the contract the frontend project consumes; its client-side
mirror lives in that project's `harness-api.service.ts`. This project owns the definition.

## Error / edge-case paths

- Missing/invalid env var at startup (`Config::from_env`): return `Err` before `main` builds the
  pool or binds the listener — the process must fail fast rather than start half-configured.
- Malformed, unsigned, or wrong-signature JWT on a protected route: `verify_supabase_jwt` returns
  `Err(ApiError::Unauthorized)`; the `SupabaseUser` extractor short-circuits with 401 before the
  handler runs (R7).
- Expired JWT (valid signature, `exp` in the past): `verify_supabase_jwt` returns
  `Err(ApiError::Unauthorized)` via the JWT library's own expiration check — same 401 response as
  any other verification failure, per R8.
- `GET /api/harness/state` when `project_slug` matches zero rows: respond 200 with empty arrays,
  not an error — an empty harness is a valid state, not a failure.

## Discarded alternatives

Top-level backend/auth/data choices and their rejected alternatives (Actix-web/Rocket, custom
JWT/cookie auth, continuing with SQLite) are in `docs/architecture.md`. Additional lower-level ones
specific to this design:

- **Verifying the Supabase JWT against Supabase's hosted JWKS endpoint (asymmetric signing keys)
  instead of the shared `SUPABASE_JWT_SECRET`** — rejected for this feature: Supabase's default
  project configuration issues HS256-signed tokens verifiable with the project's own JWT secret, a
  synchronous, network-free check on every request. JWKS-based verification only becomes necessary
  if the Supabase project is migrated to asymmetric signing keys, at which point
  `verify_supabase_jwt` would need to fetch and cache the JWKS — a real change, not a
  configuration flag, so it's deferred rather than built speculatively now.
- **`testcontainers` (Dockerized ephemeral Postgres) for integration tests instead of `sqlx::test`
  against a locally running Postgres** — rejected: `testcontainers` adds a Docker runtime
  dependency to `cargo test`, which this project's `init.sh`/CI environment does not otherwise
  require; `sqlx::test` achieves the same per-test isolation (a fresh migrated schema per test)
  against a Postgres instance the developer/CI already has running for `DATABASE_URL`, with
  materially less setup.
