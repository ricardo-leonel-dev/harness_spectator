# Tasks — progress_dashboard_view

Ordered; check off `[x]` as completed. See `design.md` for signatures, class strings, copy and the
test each task refers to. Invoke the `frontend-design` skill before touching `src/app/dashboard/`
(`docs/architecture.md` Principle 5), follow `design.md` § "Visual direction", and record the
invocation and direction in `progress/impl_progress_dashboard_view.md`.

## Baseline

- [x] T1 Run the verify command (`docs/verification.md` Level 1) on the untouched tree and confirm
      exit 0, so later failures are attributable to this feature.

## Dependencies and tokens

- [x] T2 (R37) Update `docs/architecture.md`: allowlist `@swimlane/ngx-charts` and
      `@angular/animations`; add `GET /api/harness/dashboard` to "Data" and "Data Flow"; describe
      the `/` overview and the interceptor's 401 rule in Principle 1.
- [x] T3 (R37) `npm install @swimlane/ngx-charts@^25.0.3 @angular/animations@^22.1.4`; add
      `provideAnimationsAsync()` to `src/app/app.config.ts`; confirm `ng build` succeeds.
- [x] T4 (R38) Add `status['spec-drafting']: '#4fa3e0'` to `tailwind.config.js`.
- [x] T5 (R2, R24, R30, R38) Create `src/app/dashboard/progress-format.ts` (`formatPercent`,
      `CHART_COLORS`) and `progress-format.spec.ts` (two-decimal cases; colors pinned; spec-drafting
      token probe).

## API

- [x] T6 (R1) Add `StatusCounts`, `DashboardResponse` and `getDashboard()` to
      `harness-api.service.ts`, with its test in `harness-api.service.spec.ts`.

## App-wide 401

- [x] T7 (R41) Add `AuthService.endSession()` (supabase: `signOut({ scope: 'local' })`; local:
      clear stored session; never navigates) with tests for both modes.
- [x] T8 (R41, R42, R43, R44) Extend `authInterceptor` with the 401 `catchError` from design.md
      (local-login exemption, `returnUrl` captured before sign-out, `/login` guard, re-throw).
- [x] T9 (R41, R42, R43, R44) Add the interceptor tests: 401 on a harness URL ends the session and
      navigates to `/login?returnUrl=<url>`; no navigation when already on `/login`; local login 401
      passes through with the session intact; the caller receives the original
      `HttpErrorResponse`.

## Overview component

- [x] T10 (R11, R12, R13, R14, R15, R16) Create `progress-overview.component.ts` with the
      `OverviewState` signal, `load()`/`retry()`, and the loading, `[ERR]` + `Retry`,
      401-silent and empty states.
- [x] T11 (R17, R18, R19, R20, R21) Render the header, summary line and the instrument strip with
      the gauge (results, min/max, `valueFormatting`, units).
- [x] T12 (R22, R23, R24, R25, R26, R27) Render the status doughnut: six ordered slices, custom
      colors, tooltip template, legend enabled, no `(select)` navigation.
- [x] T13 (R28, R29, R30, R31, R32, R33, R36) Render the Top 10 panel: stacked groups in API order,
      Done/Remaining colors and key, tooltip template, `onTopSelect` navigation guard, pointer
      cursor, `No projects to rank yet.` fallback.
- [x] T14 (R34, R35) Render the readout list with rank, slug link, `done/total` and percentage.
- [x] T15 (R37, R39, R40) Apply `[animations]="false"` to all charts, the strip's `lg` two-column
      grid, chart wrapper heights, overflow rules and the library-override arbitrary variants; add
      the tooltip block to `src/styles.css`.
- [x] T16 (R11–R37, R39) Create `progress-overview.component.spec.ts` with the tests listed in
      design.md § "Requirement coverage" (`provideNoopAnimations()`, chart inputs asserted through
      `By.directive`).

## Shell wiring

- [x] T17 (R3, R4, R5, R6, R7, R8) In `dashboard-page.component.ts`: render
      `<app-progress-overview>` when `slug() === null`; delete `redirectToDefault`,
      `recallProject`, `rememberProject`, `LAST_PROJECT_STORAGE_KEY` and `noProjects`; make
      `loading` depend on `stateLoading()` only; stop setting `loadError` on project-list failure;
      switch the `main` grid columns on `showsProject()`.
- [x] T18 (R10) Turn the wordmark into a `routerLink="/"` with `aria-label="Overview"` and the focus
      ring from design.md.
- [x] T19 (R9) Show `all projects` in the selector trigger (text and `aria-label`) when `current` is
      null, with a test in `project-selector.component.spec.ts`.
- [x] T20 (R3, R4, R5, R6, R7, R8, R10, R40) Update `dashboard-page.component.spec.ts`: replace the
      redirect/`harness.lastProject` tests with the R3–R8 tests, add the wordmark and 360 px
      overview tests, and change the process-log card's 401 case to a 500 (design.md "Behaviour
      change to feature 7").

## Post-login returnUrl

- [x] T22 (R45, R46, R47, R48) Create `src/app/auth/return-url.ts` (`DEFAULT_RETURN_URL`,
      `safeReturnUrl`) and `return-url.spec.ts` with the accept/reject table from design.md
      § "Requirement coverage".
- [x] T23 (R45, R46, R47, R48) In `login-page.component.ts` `onSubmit`, replace
      `router.navigate(['/'])` with `router.navigateByUrl(safeReturnUrl(<returnUrl from
      router.url>))`; add `login-page.component.spec.ts` tests: valid `returnUrl=%2Fprojects%2Fdemo`
      followed, missing → `/`, `https://evil.example` → `/`, `//evil.example` → `/`, `/login` → `/`.

## Close-out

Run T21 last, after T22–T23.

- [x] T21 (R1–R48) Run the verify command and `npm run lint`; write
      `progress/impl_progress_dashboard_view.md` with the traceability table (every R id
      explicit), the frontend-design invocation and chosen direction, and a 360 px / 1280 px manual
      check against a fixture backend or mock.
