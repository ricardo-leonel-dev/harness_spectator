# Design — scaffold_frontend_stack

## Already completed (by this spec-authoring session, not the implementer)

`docs/architecture.md`, `docs/conventions.md`, and `docs/verification.md` have already been filled
in with the concrete stack decisions (Angular frontend, Rust+Axum backend, Supabase Auth,
Supabase-shaped Postgres schema), each discarded alternative's rationale, dependency allowlist, and
naming/testing conventions. Read `docs/architecture.md` in full before starting T1 below — this
file only explains choices made *within* those boundaries, it does not re-derive them.

## Frontend UI structure (reference: approved mockup — dark, dense developer-tool aesthetic, IBM
Plex Sans/Mono, status-badge colors per feature status)

**Login screen** (`LoginPageComponent`, route `/login`): a single centered card containing an
email field, a password field, a submit button, an inline error banner (shown only after a failed
`signInWithPassword` call, per R13), and a static footer note reading "Secured by Supabase Auth".

**Dashboard screen** (`DashboardPageComponent`, route `/`, gated by `authGuard`): a top bar
(brand mark, project name from `GET /api/harness/state`'s response, the logged-in user's avatar/
initial from the Supabase session, a logout button that calls `supabase.auth.signOut()`); below it,
a two-column layout —
- **Left column:** a dense `FeaturesTableComponent` with columns `#` (`feature_number`), `Name`,
  `Title`, `SDD` (a check glyph if `sdd`, an em-dash otherwise), `Status` — rendered by
  `StatusBadgeComponent` with color mapping `pending`=amber, `in_progress`=blue, `blocked`=red,
  `done`=green, `spec_ready`=purple (falls back to a neutral gray badge for any other status
  string, so an unrecognized value never crashes the row).
- **Right column:** two stacked cards — `OpenSessionCardComponent` (agent, feature name, started
  timestamp, next step — renders an empty-state message if `openSession` is `null`) and
  `BlockedFeaturesCardComponent` (one row per blocked feature: name + its block-reason text —
  renders an empty-state message if the list is empty).

This mirrors `scripts/harness.sh status`'s feature table plus `check-blockers`'s blocked-feature
detail, rendered as a UI instead of terminal text — the backend's `HarnessStateResponse` (below)
is shaped to feed exactly these components with no client-side reshaping beyond what
`FeaturesTableComponent`/`OpenSessionCardComponent`/`BlockedFeaturesCardComponent` do for display.

## Files to create

```
frontend/
  angular.json
  package.json                     # name, scripts: start/build/lint/format/test, deps per architecture.md allowlist
  tsconfig.json
  .eslintrc.json                   # typescript-eslint + angular-eslint recommended
  .prettierrc                      # printWidth 100, singleQuote true, semi true, trailingComma "all"
  .env.example                     # SUPABASE_URL=..., SUPABASE_ANON_KEY=..., API_BASE_URL=http://localhost:4000
  scripts/write-env.mjs            # reads frontend/.env, writes src/environments/environment.ts (gitignored)
                                    # from src/environments/environment.template.ts; run via npm's `prestart`/`prebuild`
  src/
    environments/
      environment.template.ts      # committed placeholder shape: { supabaseUrl, supabaseAnonKey, apiBaseUrl }
    main.ts                        # bootstrapApplication(AppComponent, appConfig)
    app/
      app.config.ts                # provideHttpClient(withInterceptors([authInterceptor])), provideRouter(routes)
      app.routes.ts                # '/login' -> LoginPageComponent, '' -> DashboardPageComponent (canActivate: [authGuard])
      app.component.ts             # <router-outlet/> only
      auth/
        supabase-client.ts         # createClient(environment.supabaseUrl, environment.supabaseAnonKey)
        auth.service.ts            # AuthService: session signal, login(), logout(), init() subscribing onAuthStateChange
        auth.guard.ts               # authGuard: CanActivateFn reading AuthService's session signal
        login-page.component.ts     # form -> AuthService.login(); shows inline error banner on failure
        login-page.component.spec.ts # R11, R12, R13
      core/
        harness-api.service.ts      # HarnessApiService.getState(): Observable<HarnessStateResponse>
        auth.interceptor.ts         # authInterceptor: HttpInterceptorFn adding Authorization: Bearer <token>
      dashboard/
        dashboard-page.component.ts     # calls HarnessApiService.getState() on init; renders top bar + two columns
        dashboard-page.component.spec.ts # R12, R14
        features-table.component.ts
        status-badge.component.ts
        open-session-card.component.ts
        blocked-features-card.component.ts

backend/
  Cargo.toml                       # deps per architecture.md allowlist
  .env.example                     # PORT=4000, DATABASE_URL=postgres://..., SUPABASE_JWT_SECRET=..., FRONTEND_ORIGIN=http://localhost:4200
  migrations/
    0001_harness_schema.sql        # projects, features, session_log tables — Supabase-portable (R6): no local-only extensions
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
    harness.rs                    # R5, R7, R8, R9, R10 — sqlx::test-backed axum integration tests
```

## Key signatures

```rust
// backend/src/config.rs
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub supabase_jwt_secret: String,
    pub frontend_origin: String,
}
impl Config {
    pub fn from_env() -> Result<Self, ConfigError>; // fails fast if a required var is missing
}

// backend/src/app.rs
pub fn build_app(pool: PgPool, config: Config) -> Router;
// tests call build_app(test_pool, test_config) and drive it with tower::ServiceExt::oneshot —
// never start a real network listener

// backend/src/auth/jwt.rs
pub struct Claims { pub sub: String, pub exp: usize, pub aud: String }
pub fn verify_supabase_jwt(secret: &str, token: &str) -> Result<Claims, ApiError>;
// HS256 verification against SUPABASE_JWT_SECRET; validates exp and aud == "authenticated"
// (Supabase's default audience claim for signed-in users)

// backend/src/auth/extractor.rs
pub struct SupabaseUser(pub Claims);
impl<S> FromRequestParts<S> for SupabaseUser { /* reads Authorization header, calls verify_supabase_jwt,
    missing/malformed header or verification failure -> ApiError::Unauthorized */ }

// backend/src/harness/reader.rs
pub struct HarnessStateResponse {
    pub project: ProjectInfo,
    pub features: Vec<FeatureRow>,
    pub open_session: Option<OpenSessionInfo>,
    pub blocked_features: Vec<BlockedFeatureInfo>,
}
pub async fn read_harness_state(pool: &PgPool, project_slug: &str) -> Result<HarnessStateResponse, ApiError>;
// SELECT-only queries against projects/features/session_log — never INSERT/UPDATE/DELETE, enforcing
// R5 alongside R4's DATABASE_URL-only connection convention
```

```ts
// frontend/src/app/auth/auth.service.ts
export interface AuthState {
  session: Signal<Session | null>; // from @supabase/supabase-js
  login(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  logout(): Promise<void>;
}

// frontend/src/app/core/harness-api.service.ts
export interface HarnessStateResponse {
  project: { slug: string };
  features: Array<{ featureNumber: number; name: string; title: string; status: string; sdd: boolean }>;
  openSession: { agent: string; feature: string; startedAt: string; nextStep: string | null } | null;
  blockedFeatures: Array<{ name: string; note: string }>;
}
```

## Error / edge-case paths

- Missing/invalid env var at backend startup (`Config::from_env`): return `Err` before `main`
  builds the pool or binds the listener — the process must fail fast rather than start
  half-configured.
- Malformed, unsigned, or wrong-signature JWT on a protected route: `verify_supabase_jwt` returns
  `Err(ApiError::Unauthorized)`; the `SupabaseUser` extractor short-circuits with 401 before the
  handler runs (R9).
- Expired JWT (valid signature, `exp` in the past): `verify_supabase_jwt` returns
  `Err(ApiError::Unauthorized)` via the JWT library's own expiration check — same 401 response as
  any other verification failure, per R10.
- `GET /api/harness/state` when `project_slug` matches zero rows: respond 200 with empty arrays,
  not an error — an empty harness is a valid state, not a failure.
- Frontend `HarnessApiService`: a non-2xx response is surfaced through the component's error
  handling (an inline message on the dashboard), never an unhandled `Observable` error.
- Frontend `AuthService.login()`: any `signInWithPassword` error (bad credentials, network) is
  returned as `{ ok: false, error: <message> }`, never thrown past the caller, so
  `LoginPageComponent` can render it inline (R13) without a try/catch at the call site.

## Discarded alternatives

Frontend/backend/auth/data top-level choices and their rejected alternatives (React/Vue,
Actix-web/Rocket, custom JWT/cookie auth, continuing with SQLite) are in `docs/architecture.md`.
Additional lower-level ones specific to this design:

- **Verifying the Supabase JWT against Supabase's hosted JWKS endpoint (asymmetric signing keys)
  instead of the shared `SUPABASE_JWT_SECRET`** — rejected for this feature: Supabase's default
  project configuration issues HS256-signed tokens verifiable with the project's own JWT secret, a
  synchronous, network-free check on every request. JWKS-based verification only becomes necessary
  if the Supabase project is migrated to asymmetric signing keys, at which point
  `verify_supabase_jwt` would need to fetch and cache the JWKS — a real change, not a
  configuration flag, so it's deferred rather than built speculatively now.
- **`testcontainers` (Dockerized ephemeral Postgres) for backend integration tests instead of
  `sqlx::test` against a locally running Postgres** — rejected: `testcontainers` adds a Docker
  runtime dependency to `cargo test`, which this project's `init.sh`/CI environment does not
  otherwise require; `sqlx::test` achieves the same per-test isolation (a fresh migrated schema
  per test) against a Postgres instance the developer/CI already has running for `DATABASE_URL`,
  with materially less setup.
- **A committed, non-templated `frontend/src/environments/environment.ts` with real Supabase
  values** — rejected: even though the Supabase anon key is safe for client exposure (protected by
  Supabase's row-level security, not secrecy), the actual project URL/key are still
  environment-specific (dev vs. prod Supabase projects); a generated, gitignored
  `environment.ts` (via `scripts/write-env.mjs` reading `frontend/.env`) mirrors the backend's
  existing `.env`/`.env.example` convention (`docs/conventions.md`) instead of introducing a
  second, Angular-specific config pattern.
- **`msw` for frontend network mocking in tests** — rejected in favor of Angular's
  `HttpTestingController` plus a hand-written Supabase client fake: both are already the
  first-party/no-extra-dependency way to isolate the network boundary in this stack (Angular's
  own testing module for `HttpClient`; a plain object literal for the small Supabase surface this
  app uses), keeping the dependency allowlist smaller (see `docs/conventions.md`'s "Tests"
  section).
