# Tasks — scaffold_frontend_stack (frontend half)

Ordered; check off `[x]` as completed. See `design.md` for the file layout/signatures each task
below refers to, and `docs/architecture.md`/`docs/conventions.md` for the stack/style decisions
already made.

> **Scope note.** Renumbered `T1`-`T8` from the original cross-stack task list (old `T8`-`T14` plus
> the closing `T15`). The backend's seven scaffolding tasks live in the backend project's own
> `specs/scaffold_frontend_stack/tasks.md`. Where an original task cited a backend requirement, the
> reference was dropped rather than remapped — the backend's endpoint contract is now that
> project's requirement, not this one's, even though `T4` and `T7` still exercise it over HTTP.

- [x] T1 (R1, R2) Scaffold the Angular workspace (`angular.json`, `package.json`, `tsconfig.json`,
      `.eslintrc.json`, `.prettierrc`, `.env.example`,
      `src/environments/environment.template.ts`, `scripts/write-env.mjs`) per the dependency
      allowlist in `docs/architecture.md`, with working `npm start` and `npm run build` scripts.
- [x] T2 (R3, R6) Add `src/app/auth/supabase-client.ts`, `auth.service.ts`
      (`AuthService`: session signal via `onAuthStateChange`, `login()`, `logout()`), and
      `src/app/core/auth.interceptor.ts` (`authInterceptor` attaching
      `Authorization: Bearer <token>` from the current session to outgoing requests).
- [x] T3 (R3, R4, R5) Add `src/app/auth/login-page.component.ts` (centered-card
      layout: email/password form calling `AuthService.login`, inline error banner on failure,
      "Secured by Supabase Auth" footer note) and `src/app/auth/auth.guard.ts`
      (`authGuard`: allows activation if a session is present, else redirects to `/login`).
- [x] T4 (R4, R6) Add `src/app/core/harness-api.service.ts`
      (`HarnessApiService.getState()`) and the dashboard components
      (`dashboard-page.component.ts` with the top bar + two-column layout,
      `features-table.component.ts`, `status-badge.component.ts` with the
      pending/in_progress/blocked/done/spec_ready color mapping, `open-session-card.component.ts`,
      `blocked-features-card.component.ts`); wire `src/app/app.routes.ts` to route
      `/login` -> `LoginPageComponent`, `''` -> `DashboardPageComponent` behind `authGuard`.
- [x] T5 (R3, R4) Add `src/app/auth/login-page.component.spec.ts`: no session ->
      login page renders, dashboard route is not reachable (guard redirects); simulated successful
      `login()` -> navigates to the dashboard route.
- [x] T6 (R4, R5) Extend `login-page.component.spec.ts` (or a sibling spec): failed `login()`
      (stubbed Supabase client rejecting `signInWithPassword`) displays the inline error banner and
      does not navigate to the dashboard.
- [x] T7 (R6) Add `src/app/dashboard/dashboard-page.component.spec.ts`
      (`HttpTestingController`): on init, asserts the outgoing request to
      `GET /api/harness/state` carries the `Authorization: Bearer <token>` header, and that the
      returned features/session/blocked data renders into the table and cards.
- [x] T8 (R7) Update `.harness.json`'s `verify_command` to the command documented in
      `docs/verification.md`'s "Level 1" section (lint + build + test for this project); run
      `./init.sh` and confirm it passes.
