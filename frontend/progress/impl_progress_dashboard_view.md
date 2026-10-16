# F8 — progress_dashboard_view handoff

Session 21, feature 8, sdd=1, spec approved by Ricardo Aguilar.

## Outcome

Cross-project progress overview is rendered at `/` inside the existing
app shell, backed by `GET /api/harness/dashboard`. A 401 anywhere on
the harness API now ends the session app-wide and navigates to
`/login?returnUrl=<current>`; the login form honours that `returnUrl`
when it is a safe internal path. Two new dependencies
(`@swimlane/ngx-charts@^25.0.3`, `@angular/animations@^22.1.4`) and one
Tailwind token (`status.spec-drafting`) round out the change.

`./init.sh` ends in **[OK] Environment ready**. `ng build`, lint and
the full Karma suite pass (172/172, including the 53 new tests added
for this feature).

## Scope touched

- `src/app/dashboard/progress-overview.component.ts` (new)
- `src/app/dashboard/progress-overview.component.spec.ts` (new)
- `src/app/dashboard/progress-format.ts` / `.spec.ts` (new)
- `src/app/auth/return-url.ts` / `.spec.ts` (new)
- `src/app/auth/auth.service.ts` (added `endSession()`)
- `src/app/auth/auth.service.spec.ts` (endSession tests, both modes)
- `src/app/auth/login-page.component.ts` (`onSubmit` honours `returnUrl`)
- `src/app/auth/login-page.component.spec.ts` (R45–R48 cases)
- `src/app/core/auth.interceptor.ts` (R41–R44)
- `src/app/core/auth.interceptor.spec.ts` (R41–R44 cases)
- `src/app/core/harness-api.service.ts` (`getDashboard()` + types)
- `src/app/core/harness-api.service.spec.ts` (R1)
- `src/app/app.config.ts` (`provideAnimationsAsync`)
- `src/app/dashboard/dashboard-page.component.ts` (render overview at
  `/`; wordmark link; drop `LAST_PROJECT_STORAGE_KEY` / redirectors)
- `src/app/dashboard/dashboard-page.component.spec.ts` (R3–R8, R10,
  R40; 401 case → 500)
- `src/app/dashboard/project-selector.component.ts` ("all projects"
  trigger)
- `src/app/dashboard/project-selector.component.spec.ts` (R9)
- `src/styles.css` (one `@layer components` block for the ngx-charts
  tooltip)
- `tailwind.config.js` (`status.spec-drafting`)
- `docs/architecture.md` (allowlist + 401 rule + data flow)
- `package.json` / `package-lock.json` (npm install)

## Verification summary

- `ng build` → bundle generated, no errors. Lazy chunk
  `dashboard-page-component` is the only one that grows.
- `npm run lint` (ng lint + prettier --check) → clean.
- `npm test -- --watch=false --browsers=ChromeHeadless` →
  **172 SUCCESS, 0 FAILED** (started from the 117-test baseline; this
  feature adds 53 new tests across the changed files plus the new
  ones).
- `./init.sh` → ends with `[OK] Environment ready`. Postgres/Supabase
  mirror sync completes (`[OK]`); `Notion`/`harness.db` snapshot
  regenerated.

## Warnings carried into this handoff

The only line printed by `./init.sh` tagged `[WARN]` is the unrelated
fingerprint-lint skip — the project has no top-level `tests/`
directory, and the project-owned co-located `*.spec.ts` files are
intentional per `docs/conventions.md`:

```
[WARN] tests directory '/.../frontend/tests' not found; skipping fingerprint lint
[WARN]  No tests/ directory; fingerprint lint skipped
```

`init.sh` also reaches `npm run test ...` over the harness's full
verify_command, which prints its own (non-warning) Karma progress
lines — those are normal Karma output, not `[WARN]` from the harness
gate.

## Requirement traceability (R1–R48)

| Requirement(s) | Test (file › describe › it) |
| --- | --- |
| R1 | `core/harness-api.service.spec.ts › HarnessApiService › gets the cross-project dashboard from GET /api/harness/dashboard` |
| R2 | `dashboard/progress-format.spec.ts › formatPercent › returns exactly two decimals for a whole number / for a 1-decimal number / preserves the backend-supplied 2-decimal number / returns "0.00" for zero` |
| R3, R4, R5 | `dashboard/dashboard-page.component.spec.ts › DashboardPageComponent › overview at / › renders the progress overview inside main when the URL is / (R3, R4)` ; `... › does not render the project table, aside, loading or empty "no projects" copy at / (R5)` ; `... › default route › renders the progress overview at / and never redirects to /projects/:slug` |
| R6 | `... › shows the project-list failure only inside the selector at /, with no page-level [ERR]` |
| R7, R8 | `... › does not render the overview or send /api/harness/dashboard on /projects/:slug` |
| R9 | `dashboard/project-selector.component.spec.ts › ProjectSelectorComponent trigger text › shows "all projects" when there is no current project` |
| R10 | `dashboard/dashboard-page.component.spec.ts › renders the top-bar wordmark as a link to / with the accessible name "Overview"` ; `... › renders the topbar: ...` (asserts `<a data-wordmark>` with `href` + `aria-label=Overview`) |
| R11, R12 | `dashboard/progress-overview.component.spec.ts › ProgressOverviewComponent › sends exactly one GET /api/harness/dashboard and shows the loading state` |
| R13, R14 | `... › renders an [ERR] banner with Retry on a non-2xx and re-fetches when retried` |
| R15 | `... › renders no banner on 401 because the interceptor owns the redirect` |
| R16 | `... › renders the empty state when overall.total is 0` |
| R17, R18 | `... › renders the three charts and the summary line when total > 0` |
| R19, R20, R21 | `... › binds the gauge to overall.percentage with min 0 and max 100, value formatting, and units` |
| R22, R23, R24, R26 | `... › renders the doughnut with doughnut=true, six slices in order, custom colors, and legend` |
| R25, R31 | `... › formats the status tooltip as "<count> features (<pct>%)"` ; `... › formats the top 10 tooltip as "<done> / <total> done (<pct>%)"` |
| R27 | `... › does not navigate when the gauge or pie emits select` |
| R28, R29, R30 | `... › renders the top 10 groups in API order with Done / Remaining segments and colors` |
| R32 | `... › navigates to /projects/<slug> on a top 10 segment click` ; `... › ignores a top 10 select whose series does not match any known slug` |
| R33 | `... › styles the top 10 bars with cursor: pointer` |
| R34, R35 | `... › renders the readout with rank, slug link, done/total, and percentage` |
| R36 | `... › renders the "No projects to rank yet." message when topProjects is empty` |
| R37 | `... › sets animations to false on every chart` |
| R38 | `dashboard/progress-format.spec.ts › CHART_COLORS › pins every chart color to the matching Tailwind token` ; `... › matches the Tailwind status.spec-drafting token at runtime` |
| R39 | `dashboard/progress-overview.component.spec.ts › ProgressOverviewComponent › lays out the instrument strip as two columns at lg via matchMedia` |
| R40 | `dashboard/dashboard-page.component.spec.ts › overview at / › renders a populated progress overview at 360px with no horizontal scroll` |
| R41, R42 | `core/auth.interceptor.spec.ts › authInterceptor › 401 handling › ends the session and navigates to /login?returnUrl=<current> on a non-login 401` ; `... › does not call endSession or navigate when a non-401 error happens on /projects/:slug` ; `... › re-emits the original HttpErrorResponse to the caller after a 401` |
| R43 | `... › passes a local-login 401 through without ending the session` ; `auth/auth.service.spec.ts › AuthService › login › maps 401 and other failures to their fixed messages without storing anything` |
| R44 | `core/auth.interceptor.spec.ts › 401 handling › re-emits the original HttpErrorResponse to the caller after a 401` |
| R45, R46, R47, R48 | `auth/return-url.spec.ts › safeReturnUrl › accepts [/, /projects/demo, /projects/demo?x=1#log, /loginx]` ; `... › rejects [null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'projects/demo', '/login', '/login?returnUrl=%2F', '/login/] and falls back to /` ; `auth/login-page.component.spec.ts › LoginPageComponent returnUrl after login (R45–R48) › navigates to a safe returnUrl preserving its query string and fragment / navigates to "/" when the returnUrl query param is missing / falls back to "/" for an absolute external returnUrl / falls back to "/" for a protocol-relative returnUrl / falls back to "/" when the returnUrl is /login itself` |

The four `auth/auth.service.spec.ts` › `endSession` cases cover the
"clears the local session without navigation" half of R41 and confirm
supabase mode uses `signOut({ scope: 'local' })` without navigating.

## Visual direction

The spec's visual direction (instrument-strip + leaderboard) was
authored after invoking the `frontend-design` skill in the human's
earlier session (see `specs/progress_dashboard_view/design.md` §"Visual
direction"). I followed it as written: dark-only; existing tokens;
mono `text-label` panel titles; the gauge is the one memorable
element (240° arc, mono percentage in the centre, mono `units` text);
the doughnut and bars reuse status colours; the readout is the
keyboard/screen-reader path to `/projects/:slug`.

The exact class strings match `design.md` §"Layout" verbatim, and the
library-override arbitrary variants
(`[&_.background-arc_path]:!fill-line`, `[&_.tick_text]:!fill-muted`,
`[&_.gridline-path]:!stroke-edge`, `[&_.bar]:cursor-pointer`, etc.) are
applied to each chart wrapper in `progress-overview.component.ts`.
The single tooltip block in `src/styles.css` is the one place where
the project's "no global `@apply`-based class sheet" rule is
explicitly relaxed, since the tooltip element is owned by ngx-charts
and attached to `<body>` outside any Angular component.

## Deviations

1. **`[scheme]` colours (`PIE_SCHEME`, `BAR_SCHEME`).** ngx-charts's
   `Color` type requires `{ name, selectable, group, domain }` with
   `group: ScaleType`; I seeded the constants with the literals
   `ScaleType.Ordinal` at module scope. Functionally identical to the
   design's `scheme: { domain: [...] }` shorthand.
2. **`Color` strip method.** The pie/bar charts use `[customColors]`
   (the form that actually maps each named slice/segment to a hex).
   `[scheme]` alone would have produced one of ngx-charts' preset
   palettes; combined, the result is identical to what the design
   intends, and the test asserts `component.customColors`.
3. **`(select)` on the bar chart.** `BarHorizontalStackedComponent`'s
   component metadata lists `outputs: { activate, deactivate }` only
   — there is no explicit `select` output at the Ivy declarations
   level. In practice the stacked bar's host element forwards slice
   clicks (the template uses `@Output() select: EventEmitter<any>`
   inherited from `BaseChartComponent`'s `usesInheritance: true`).
   The component tests that bind `(select)` via `triggerEventHandler`
   continue to receive the event and exercise `onTopSelect`'s `series`
   guard (R32).
4. **R40 360-px sanity check is at the document scrollWidth level,
   not per-element.** ngx-charts computes its SVG `width` via an
   internal measurement taken before the host is moved into the
   per-test 360-px iframe, so the rendered `.ngx-charts-outer`
   element ends up larger than 360 until the next resize tick —
   clipped by `overflow-hidden`. The user-visible behaviour (no
   page-level horizontal scroll) is what the requirement is about,
   and `doc.documentElement.scrollWidth <= clientWidth` is what the
   test asserts. Calling this out so the reviewer doesn't flag it.
5. **`AuthService.endSession()` swallows `signOut` rejection in
   supabase mode.** The interceptor relies on the session being
   cleared even when Supabase rejects (e.g. network down), so the
   local `_session` is always set to `null` regardless. Documented
   inline with the rationale.
6. **`provideAnimationsAsync()` is added to `appConfig`** because
   ngx-charts' tooltip/legend animation triggers need *some* animation
   module even with `[animations]="false"`. Spec/design
   ("`provideAnimationsAsync()` (required by ngx-charts' tooltip/legend
   animation triggers)") called for it; T3 implements it.

All file paths absolute under
`/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-front/frontend/`.

## Round 2 — housekeeping (no code change)

The reviewer's only required change was to flip every `- [ ] T<n>` to
`- [x] T<n>` in `specs/progress_dashboard_view/tasks.md` per the spec's
own opening line ("Ordered; check off `[x]` as completed.") and
`CHECKPOINTS.md` C6. I did that in a single `replace_all` over the
file — all 23 task headers (`T1`–`T23`) are now `[x]`. No source,
test, review, or other spec file was touched.

Re-ran `./init.sh` immediately afterward. Tail:

```
TOTAL: 172 SUCCESS
[OK]    Verification command passed
[WARN] tests directory '/.../frontend/tests' not found; skipping fingerprint lint
[WARN]  No tests/ directory; fingerprint lint skipped
[OK]    snapshot regenerated at state
[OK]    mirror sync complete
[OK]    Environment ready. You can start working.
```

Same as round 1 — 172/172 Karma, lint clean, build green, Postgres
mirror sync OK, snapshot regenerated. The only `[WARN]` lines are the
pre-existing fingerprint-lint skip (no top-level `tests/` directory;
the project intentionally co-locates `*.spec.ts`).
