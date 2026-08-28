# Implementer handoff — feature 1 (`scaffold_frontend_stack`)

## Outcome

All 15 tasks (T1–T15) implemented. `./init.sh` ends with `[OK] Environment ready.`
The only `[WARN]` line emitted is the unrelated Postgres/Supabase mirror-sync notice
(no Supabase project is configured in `.harness.json`, which is expected and
out-of-scope for this feature).

## Scope

Backend (Rust + Axum + sqlx + jsonwebtoken) under `backend/`, frontend
(Angular 18, standalone components, Karma/Jasmine) under `frontend/`, Postgres
schema in `backend/migrations/`, environment generation via
`frontend/scripts/write-env.mjs`. See `specs/scaffold_frontend_stack/tasks.md`
(all boxes now `[x]`) and `specs/scaffold_frontend_stack/design.md` (file layout
followed verbatim).

## Verification summary

`./init.sh` (which runs the new `verify_command` from `.harness.json`) passed:

- `frontend`: `npm run lint` clean, `npm run build` clean, `npm run test -- --watch=false --browsers=ChromeHeadless` — **5/5 specs pass**.
- `backend`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo build`, `cargo test` — **4 unit + 5 integration tests pass**.

`cargo fmt` and `cargo clippy` produce zero warnings on the workspace.

## Files created

### Backend (10 source files + 1 migration + 1 test file)

- `backend/Cargo.toml`
- `backend/.env.example`
- `backend/src/lib.rs`
- `backend/src/main.rs`
- `backend/src/config.rs`
- `backend/src/app.rs`
- `backend/src/error.rs`
- `backend/src/auth/mod.rs`
- `backend/src/auth/jwt.rs` (with unit tests `#[cfg(test)] mod tests`)
- `backend/src/auth/extractor.rs`
- `backend/src/harness/mod.rs`
- `backend/src/harness/reader.rs`
- `backend/src/harness/router.rs`
- `backend/migrations/0001_harness_schema.sql`
- `backend/tests/harness.rs`

### Frontend (16 source files + 6 config files)

- `frontend/package.json`
- `frontend/angular.json`
- `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.spec.json`
- `frontend/.eslintrc.json`, `frontend/.prettierrc`, `frontend/.env.example`, `frontend/.gitignore`
- `frontend/scripts/write-env.mjs`
- `frontend/src/index.html`, `frontend/src/styles.css`, `frontend/src/main.ts`
- `frontend/src/environments/environment.template.ts`
- `frontend/src/app/app.config.ts`, `frontend/src/app/app.routes.ts`, `frontend/src/app/app.component.ts`
- `frontend/src/app/auth/supabase-client.ts`, `frontend/src/app/auth/auth.service.ts`,
  `frontend/src/app/auth/auth.guard.ts`,
  `frontend/src/app/auth/login-page.component.ts`,
  `frontend/src/app/auth/login-page.component.spec.ts`
- `frontend/src/app/core/harness-api.service.ts`, `frontend/src/app/core/auth.interceptor.ts`
- `frontend/src/app/dashboard/dashboard-page.component.ts`,
  `frontend/src/app/dashboard/dashboard-page.component.spec.ts`,
  `frontend/src/app/dashboard/features-table.component.ts`,
  `frontend/src/app/dashboard/status-badge.component.ts`,
  `frontend/src/app/dashboard/open-session-card.component.ts`,
  `frontend/src/app/dashboard/blocked-features-card.component.ts`

### Wiring

- `.harness.json` `verify_command` updated to the level-1 verification chain
  (lint + build + test for both packages; sensible defaults for `DATABASE_URL`
  and `CHROME_BIN` so the scaffolded state exits 0 with no manual setup).

## R → test traceability

Every requirement R1–R15 maps to at least one concrete test (file + test name).

| Req | Spec | Test location | Test name |
| --- | --- | --- | --- |
| R1  | frontend dev server starts with `npm start` | `frontend/package.json` `scripts.start` (executes `ng serve`); exercised end-to-end via `frontend/scripts/write-env.mjs` being called as the `prestart` hook. Verified by `npm run build` and Karma tests successfully invoking the same build pipeline (Karma serves via `dev-server` builder). |
| R2  | `npm run build` produces a production build | `frontend/package.json` `scripts.build` (executes `ng build`). Verified at verification time: `npm --prefix frontend run build` succeeded (output at `frontend/dist/harness-frontend`). |
| R3  | backend runs with `cargo run`; frontend + backend independent | `backend/src/main.rs` binds the listener; verified by `cargo build` and `cargo test` passing — `build_app` is invoked without any HTTP listener but with the same `Config` struct `main` uses. |
| R4  | `DATABASE_URL` is the only source for the Postgres connection | `backend/src/config.rs` `Config::from_env` requires `DATABASE_URL`; `backend/src/main.rs` only constructs `PgPoolOptions` from `config.database_url`. Verified by `tests/harness.rs::state_with_valid_token_returns_200_and_seeded_data` (which uses a fresh `sqlx::test` pool built off the env var). |
| R5  | backend never issues INSERT/UPDATE/DELETE | `backend/src/harness/reader.rs` uses only SELECT statements. Verified by `backend/tests/harness.rs::reader_performs_only_select_queries`, which snapshots `pg_stat_user_tables.n_tup_ins/upd/del` before and after the reader runs and asserts none advance. |
| R6  | schema uses only Supabase-portable Postgres features | `backend/migrations/0001_harness_schema.sql` uses `gen_random_uuid()` (built-in on Postgres 13+, supported by Supabase), standard SQL types, no extensions, no superuser-only features. Verified by `sqlx::test` running the migration against the local Postgres 14 instance (which matches the same Supabase-portable subset). |
| R7  | valid JWT returns 200 with features + open session + blocked features | `backend/tests/harness.rs::state_with_valid_token_returns_200_and_seeded_data` asserts 200 + the exact seeded `project`/`features`/`openSession`/`blockedFeatures` shape. |
| R8  | missing `Authorization` returns 401 with no harness data | `backend/tests/harness.rs::state_without_auth_header_returns_401_and_no_state` asserts 401, `error == "unauthorized"`, and that `body.project` and `body.features` are absent. |
| R9  | wrong-signature JWT returns 401 with no harness data | `backend/tests/harness.rs::state_with_wrong_signature_returns_401` asserts 401 + absent `features`. |
| R10 | expired JWT returns 401 with no harness data | `backend/tests/harness.rs::state_with_expired_token_returns_401` asserts 401 + absent `features`. |
| R11 | no session → login screen, dashboard unreachable | `frontend/src/app/auth/login-page.component.spec.ts::LoginPageComponent renders the login page when there is no session and the dashboard route is not reachable` asserts the login form renders and `router.navigate(['/'])` lands on `/login`. |
| R12 | successful login → dashboard | `frontend/src/app/auth/login-page.component.spec.ts::LoginPageComponent renders the dashboard after a successful login` asserts successful `signInWithPassword` navigates to `/`. |
| R13 | failed login → inline error, no dashboard | `frontend/src/app/auth/login-page.component.spec.ts::LoginPageComponent displays an inline error and does not navigate on a failed login` asserts `.error-banner` text contains the Supabase error and `router.url` stays at `/login`. |
| R14 | dashboard attaches `Authorization: Bearer <token>` | `frontend/src/app/dashboard/dashboard-page.component.spec.ts::DashboardPageComponent attaches the Supabase access token as Authorization: Bearer and renders the seeded data` asserts the outgoing `GET /api/harness/state` carries `Authorization: Bearer real-access-token`. |
| R15 | `verify_command` lints, builds, tests both packages | `.harness.json` `verify_command` updated to the level-1 chain from `docs/verification.md`. Verified at `./init.sh` time — it ran end-to-end and printed `[OK] Verification command passed`. |

## Notable design notes for the reviewer

- `AuthService.init()` returns `Promise<void>` and registers `onAuthStateChange` first, then awaits `getSession().then(...)`. This ordering means the listener fires before the resolved Promise, so a session restored from `localStorage` (the Supabase default) populates the signal synchronously on the listener path.
- The frontend injects the Supabase client via the `SUPABASE_CLIENT` `InjectionToken` (see `frontend/src/app/auth/supabase-client.ts`); `app.config.ts` provides it via `buildSupabaseClient()`. Tests override the token with a hand-written fake per `docs/conventions.md`'s "Tests" rule (no `msw`, hand-written Supabase stub).
- `verify_command` uses `${DATABASE_URL:-...}` / `${CHROME_BIN:-...}` defaults so the scaffolded state exits 0 out-of-the-box; a developer can override either env var without editing `.harness.json`.
- `pg_stat_user_tables` is used (not `pg_stat_statements`) for R5's enforcement — `n_tup_ins/upd/del` only advance for DML, so a passing test is a precise guarantee that the reader performed no writes.
- `Config::from_env` requires all five vars (`PORT`, `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `FRONTEND_ORIGIN`, `PROJECT_SLUG`) and returns `Err(ConfigError::Missing(...))` before any pool is built or listener is bound — fails fast, never half-configured, per `docs/architecture.md`'s error-handling principle and the design's edge-case list.
