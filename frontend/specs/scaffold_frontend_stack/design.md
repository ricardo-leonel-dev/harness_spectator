# Design — scaffold_frontend_stack (frontend half)

> **Scope note.** The original design covered both stacks in one document. This is the frontend
> half; the backend's file tree, Rust signatures, JWT/extractor error paths and its own discarded
> alternatives (JWKS verification, `testcontainers`) live in the backend project's
> `specs/scaffold_frontend_stack/design.md`. The `HarnessStateResponse` shape is repeated here as
> the *consumed* contract — the backend owns its definition.

## Already completed (by the original spec-authoring session, not the implementer)

`docs/architecture.md`, `docs/conventions.md`, and `docs/verification.md` have been filled in with
the concrete stack decisions (Angular frontend, Supabase Auth), each discarded alternative's
rationale, dependency allowlist, and naming/testing conventions. Read `docs/architecture.md` in
full before starting T1 — this file only explains choices made *within* those boundaries, it does
not re-derive them.

## Frontend UI structure (reference: approved mockup — dark, dense developer-tool aesthetic, IBM
Plex Sans/Mono, status-badge colors per feature status)

**Login screen** (`LoginPageComponent`, route `/login`): a single centered card containing an
email field, a password field, a submit button, an inline error banner (shown only after a failed
`signInWithPassword` call, per R5), and a static footer note reading "Secured by Supabase Auth".

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
angular.json
package.json                     # name, scripts: start/build/lint/format/test, deps per architecture.md allowlist
tsconfig.json
.eslintrc.json                   # typescript-eslint + angular-eslint recommended
.prettierrc                      # printWidth 100, singleQuote true, semi true, trailingComma "all"
.env.example                     # SUPABASE_URL=..., SUPABASE_ANON_KEY=..., API_BASE_URL=http://localhost:4000
scripts/write-env.mjs            # reads .env, writes src/environments/environment.ts (gitignored)
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
      auth.guard.ts              # authGuard: CanActivateFn reading AuthService's session signal
      login-page.component.ts    # form -> AuthService.login(); shows inline error banner on failure
      login-page.component.spec.ts # R3, R4, R5
    core/
      harness-api.service.ts     # HarnessApiService.getState(): Observable<HarnessStateResponse>
      auth.interceptor.ts        # authInterceptor: HttpInterceptorFn adding Authorization: Bearer <token>
    dashboard/
      dashboard-page.component.ts      # calls HarnessApiService.getState() on init; renders top bar + two columns
      dashboard-page.component.spec.ts # R4, R6
      features-table.component.ts
      status-badge.component.ts
      open-session-card.component.ts
      blocked-features-card.component.ts
```

## Key signatures

```ts
// src/app/auth/auth.service.ts
export interface AuthState {
  session: Signal<Session | null>; // from @supabase/supabase-js
  login(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  logout(): Promise<void>;
}

// src/app/core/harness-api.service.ts
// Consumed contract — defined by the backend project, mirrored here for the client's typing.
export interface HarnessStateResponse {
  project: { slug: string };
  features: Array<{ featureNumber: number; name: string; title: string; status: string; sdd: boolean }>;
  openSession: { agent: string; feature: string; startedAt: string; nextStep: string | null } | null;
  blockedFeatures: Array<{ name: string; note: string }>;
}
```

## Error / edge-case paths

- `HarnessApiService`: a non-2xx response is surfaced through the component's error handling (an
  inline message on the dashboard), never an unhandled `Observable` error.
- `AuthService.login()`: any `signInWithPassword` error (bad credentials, network) is returned as
  `{ ok: false, error: <message> }`, never thrown past the caller, so `LoginPageComponent` can
  render it inline (R5) without a try/catch at the call site.

## Discarded alternatives

Top-level frontend/auth choices and their rejected alternatives (React/Vue, custom JWT/cookie auth)
are in `docs/architecture.md`. Additional lower-level ones specific to this design:

- **A committed, non-templated `src/environments/environment.ts` with real Supabase values** —
  rejected: even though the Supabase anon key is safe for client exposure (protected by Supabase's
  row-level security, not secrecy), the actual project URL/key are still environment-specific (dev
  vs. prod Supabase projects); a generated, gitignored `environment.ts` (via
  `scripts/write-env.mjs` reading `.env`) mirrors the `.env`/`.env.example` convention
  (`docs/conventions.md`) instead of introducing a second, Angular-specific config pattern.
- **`msw` for frontend network mocking in tests** — rejected in favor of Angular's
  `HttpTestingController` plus a hand-written Supabase client fake: both are already the
  first-party/no-extra-dependency way to isolate the network boundary in this stack (Angular's
  own testing module for `HttpClient`; a plain object literal for the small Supabase surface this
  app uses), keeping the dependency allowlist smaller (see `docs/conventions.md`'s "Tests"
  section).
