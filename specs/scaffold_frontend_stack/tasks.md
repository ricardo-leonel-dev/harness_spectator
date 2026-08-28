# Tasks — scaffold_frontend_stack

Ordered; check off `[x]` as completed. See `design.md` for the file layout/signatures each task
below refers to, and `docs/architecture.md`/`docs/conventions.md` for the stack/style decisions
already made.

## Backend

- [x] T1 (R3, R4) Scaffold `backend/` (`Cargo.toml` per the dependency allowlist in
      `docs/architecture.md`, `.env.example`); add `backend/src/config.rs` (`Config::from_env`,
      reading `PORT`, `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `FRONTEND_ORIGIN`) and
      `backend/src/main.rs` that builds a `sqlx::PgPool` from `DATABASE_URL`, calls `build_app`,
      and starts the HTTP server on `config.port`.
- [x] T2 (R6) Add `backend/migrations/0001_harness_schema.sql` (`projects`, `features`,
      `session_log` tables) using only Supabase-portable Postgres features — no local-only
      extensions.
- [x] T3 (R3, R5) Add `backend/src/error.rs` (`ApiError` + `IntoResponse` impl, JSON
      `{ "error": ... }` envelope) and `backend/src/app.rs`'s `build_app(pool, config)` wiring the
      `tower-http` CORS layer (origin = `config.frontend_origin`) and a `tracing` layer.
- [x] T4 (R9, R10) Add `backend/src/auth/jwt.rs`'s `verify_supabase_jwt` (HS256 verification
      against `SUPABASE_JWT_SECRET`, checking `exp` and `aud == "authenticated"`) and
      `backend/src/auth/extractor.rs`'s `SupabaseUser` (`FromRequestParts` extracting the
      `Authorization: Bearer` header and calling `verify_supabase_jwt`).
- [x] T5 (R8) Ensure `SupabaseUser`'s extraction failure path (missing `Authorization` header)
      returns `ApiError::Unauthorized` (401 JSON `{ "error": "unauthorized" }`) before any route
      handler runs.
- [x] T6 (R4, R5, R7) Add `backend/src/harness/reader.rs`'s `read_harness_state` (SELECT-only
      `sqlx` queries against `projects`/`features`/`session_log` per the schema in T2) and
      `backend/src/harness/router.rs`'s `GET /api/harness/state` handler, requiring the
      `SupabaseUser` extractor.
- [x] T7 (R5, R7, R8, R9, R10) Add `backend/tests/harness.rs` (`sqlx::test`-backed, driving
      `build_app` via `tower::ServiceExt::oneshot`, no mocking of the router itself): a request
      with a validly-signed test JWT returns 200 with the seeded features/session/blocked data; a
      request with no `Authorization` header returns 401 with no harness data in the body; a
      request with a JWT signed with the wrong secret returns 401; a request with an expired JWT
      returns 401; assert the test only ever issues `SELECT` statements against the seeded schema
      (no route under test performs a write).

## Frontend

- [x] T8 (R1, R2) Scaffold `frontend/` (`angular.json`, `package.json`, `tsconfig.json`,
      `.eslintrc.json`, `.prettierrc`, `.env.example`,
      `src/environments/environment.template.ts`, `scripts/write-env.mjs`) per the dependency
      allowlist in `docs/architecture.md`, with working `npm start` and `npm run build` scripts.
- [x] T9 (R11, R14) Add `frontend/src/app/auth/supabase-client.ts`, `auth.service.ts`
      (`AuthService`: session signal via `onAuthStateChange`, `login()`, `logout()`), and
      `frontend/src/app/core/auth.interceptor.ts` (`authInterceptor` attaching
      `Authorization: Bearer <token>` from the current session to outgoing requests).
- [x] T10 (R11, R12, R13) Add `frontend/src/app/auth/login-page.component.ts` (centered-card
      layout: email/password form calling `AuthService.login`, inline error banner on failure,
      "Secured by Supabase Auth" footer note) and `frontend/src/app/auth/auth.guard.ts`
      (`authGuard`: allows activation if a session is present, else redirects to `/login`).
- [x] T11 (R7, R12, R14) Add `frontend/src/app/core/harness-api.service.ts`
      (`HarnessApiService.getState()`) and the dashboard components
      (`dashboard-page.component.ts` with the top bar + two-column layout,
      `features-table.component.ts`, `status-badge.component.ts` with the
      pending/in_progress/blocked/done/spec_ready color mapping, `open-session-card.component.ts`,
      `blocked-features-card.component.ts`); wire `frontend/src/app/app.routes.ts` to route
      `/login` -> `LoginPageComponent`, `''` -> `DashboardPageComponent` behind `authGuard`.
- [x] T12 (R11, R12) Add `frontend/src/app/auth/login-page.component.spec.ts`: no session ->
      login page renders, dashboard route is not reachable (guard redirects); simulated successful
      `login()` -> navigates to the dashboard route.
- [x] T13 (R12, R13) Extend `login-page.component.spec.ts` (or a sibling spec): failed `login()`
      (stubbed Supabase client rejecting `signInWithPassword`) displays the inline error banner and
      does not navigate to the dashboard.
- [x] T14 (R7, R14) Add `frontend/src/app/dashboard/dashboard-page.component.spec.ts`
      (`HttpTestingController`): on init, asserts the outgoing request to
      `GET /api/harness/state` carries the `Authorization: Bearer <token>` header, and that the
      returned features/session/blocked data renders into the table and cards.

## Wiring / closing

- [x] T15 (R15) Update `.harness.json`'s `verify_command` to the command documented in
      `docs/verification.md`'s "Level 1" section (lint + build + test for both `frontend/` and
      `backend/`); run `./init.sh` and confirm it passes.
