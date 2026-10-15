# Design — progress_dashboard_view

Conventions are not re-derived here. Layers (`core/` owns HTTP and the interceptor, `auth/` owns the
session, `dashboard/` renders), signals-only state and the "every HTTP error is visible" rule come
from `docs/architecture.md`; file naming, Tailwind/token rules, the mono/sans split, lucide `pick()`
usage and co-located Karma/Jasmine specs come from `docs/conventions.md`. This feature adds two
dependencies, so `docs/architecture.md`'s allowlist is updated **first** (T2), as that file
requires.

The backend endpoint is not merged yet. Everything here is tested against `HttpTestingController`
fixtures shaped like the contract in `requirements.md`; no test talks to a real backend.

## Files to touch

| File | Change |
|---|---|
| `package.json` / `package-lock.json` | Add `@swimlane/ngx-charts@^25.0.3` and `@angular/animations@^22.1.4` (same minor line as `@angular/core`). |
| `docs/architecture.md` | Allowlist both packages; add `GET /api/harness/dashboard` to "Data" and "Data Flow"; describe the `/` overview and the interceptor's 401 behaviour in Principle 1. |
| `tailwind.config.js` | `status['spec-drafting']: '#4fa3e0'` (R38). |
| `src/styles.css` | One `@layer components` block for the ngx-charts tooltip (see Visual direction). |
| `src/app/app.config.ts` | `provideAnimationsAsync()` (required by ngx-charts' tooltip/legend animation triggers). |
| `src/app/core/harness-api.service.ts` | `DashboardResponse` types and `getDashboard()` (R1). |
| `src/app/core/harness-api.service.spec.ts` | `getDashboard` test. |
| `src/app/core/auth.interceptor.ts` | 401 handling (R41–R44). |
| `src/app/core/auth.interceptor.spec.ts` | 401 tests. |
| `src/app/auth/auth.service.ts` | `endSession(): Promise<void>` (clears the session without navigating). |
| `src/app/auth/auth.service.spec.ts` | `endSession` tests for both modes. |
| `src/app/auth/return-url.ts` | **New.** `safeReturnUrl()` (R45–R48). |
| `src/app/auth/return-url.spec.ts` | **New.** Accept/reject table for `safeReturnUrl()`. |
| `src/app/auth/login-page.component.ts` | `onSubmit` navigates to the safe `returnUrl` or `/` (R45–R48). |
| `src/app/auth/login-page.component.spec.ts` | returnUrl followed / missing / external / `//` / `/login` tests. |
| `src/app/dashboard/progress-format.ts` | **New.** `formatPercent` (R2) and `CHART_COLORS`. |
| `src/app/dashboard/progress-format.spec.ts` | **New.** |
| `src/app/dashboard/progress-overview.component.ts` | **New.** Fetches the dashboard, owns loading/error/empty/ok state, renders the three panels (R11–R37, R39). |
| `src/app/dashboard/progress-overview.component.spec.ts` | **New.** |
| `src/app/dashboard/dashboard-page.component.ts` | Render the overview at `/`; drop the redirect; wordmark link (R3–R8, R10). |
| `src/app/dashboard/dashboard-page.component.spec.ts` | Replace the redirect tests; adjust the 401 card test; 360 px overview test. |
| `src/app/dashboard/project-selector.component.ts` | `all projects` when `current` is null (R9). |
| `src/app/dashboard/project-selector.component.spec.ts` | Trigger text test. |

No new top-level layer. The overview lives in `dashboard/` because it renders harness state; it
injects `HarnessApiService` itself (like the page does) because the page would otherwise have to
thread a third independent request pipeline through its already-large component.

## Contract types (`harness-api.service.ts`)

```ts
export interface StatusCounts {
  pending: number;
  specDrafting: number;
  specReady: number;
  inProgress: number;
  blocked: number;
  done: number;
}

export interface DashboardResponse {
  overall: { done: number; total: number; percentage: number; byStatus: StatusCounts };
  topProjects: Array<{ slug: string; done: number; total: number; percentage: number }>;
}

getDashboard(): Observable<DashboardResponse> {
  return this.http.get<DashboardResponse>(`${environment.apiBaseUrl}/api/harness/dashboard`);
}
```

## `progress-format.ts`

```ts
export function formatPercent(value: number): string {
  return value.toFixed(2);
}

export const CHART_COLORS = {
  pending: '#46505f',
  specDrafting: '#4fa3e0',
  specReady: '#8b7fe8',
  inProgress: '#e8a33d',
  blocked: '#e5484d',
  done: '#3ecf8e',
  remaining: '#3a4452',
} as const;
```

`CHART_COLORS` duplicates `tailwind.config.js` hex values on purpose: ngx-charts takes colors as
data (`customColors`), not classes, and importing the CommonJS Tailwind config into the Angular
bundle is not worth the build friction. `progress-format.spec.ts` pins each value so a token change
that forgets this file fails a test. `toFixed` is safe here because the backend already rounds to
two decimals; the function only restores dropped trailing zeros.

## 401 handling (`auth.interceptor.ts`, `auth.service.ts`)

`authGuard` only sees the local session before routing, so an expired/revoked token surfaces as a
401 on an API call. The interceptor owns this app-wide:

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // ...existing Bearer attach, producing `outgoing`...
  return next(outgoing).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && req.url !== LOCAL_LOGIN_URL) {
        const returnUrl = router.url;
        void auth.endSession().then(() => {
          if (!returnUrl.startsWith('/login')) {
            void router.navigate(['/login'], { queryParams: { returnUrl } });
          }
        });
      }
      return throwError(() => err);
    }),
  );
};
```

- `LOCAL_LOGIN_URL = \`${environment.apiBaseUrl}/api/auth/login\`` — the one 401 that means
  "invalid credentials", which `AuthService.loginLocal` already turns into a form error (R43).
  `/api/auth/mode` is public and never 401s, so it needs no exception.
- `returnUrl` is captured **before** the async sign-out so it reflects the page that failed (R42).
- The `/login` check prevents a redirect loop and makes several concurrent 401s (overview + project
  list) collapse into one navigation in practice: the second one sees `/login` once the first
  navigation has completed; if both race before that, both navigate to the same URL, which the
  router treats as a no-op.
- The error is always re-thrown (R44) so callers' existing error paths still run; components decide
  whether to render it (the overview suppresses 401 — R15).
- `AuthService.endSession()`: supabase mode → `await this.supabase().auth.signOut({ scope: 'local'
  })` (local scope: no network call that could itself 401) then `_session.set(null)`; local mode →
  `clearLocalSession()`; `unavailable`/`null` → `_session.set(null)`. It never navigates; `logout()`
  is unchanged.
- No circular DI: the interceptor already injects `AuthService`; `Router` is root-provided.

**Behaviour change to feature 7.** `dashboard-page.component.spec.ts` › "shows the not-found message
for a 404 and [ERR] for a 401 inside the card" asserts the card shows `[ERR] 401 Unauthorized` and
the URL stays put. With R41/R42 a 401 now redirects to `/login`. Change that test's second half to a
`500 Internal Server Error` (the card's `[ERR]` path is unchanged) and cover the 401 redirect in the
interceptor spec instead. `process-log-card.component.ts` itself needs no change.

## Post-login `returnUrl` (`return-url.ts`, `login-page.component.ts`)

Previously out of scope; brought in by the human during spec review. Today
`LoginPageComponent.onSubmit` always runs `router.navigate(['/'])`, so the `returnUrl` set by
`authGuard` and by R42 is dropped. New pure helper, co-located in `auth/` (it is session-flow logic,
not HTTP):

```ts
// src/app/auth/return-url.ts
export const DEFAULT_RETURN_URL = '/';

/** Returns `raw` when it is a safe internal app path, else `/` (R45–R48). Never throws. */
export function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_RETURN_URL;                       // R46
  if (!raw.startsWith('/')) return DEFAULT_RETURN_URL;       // R47: absolute, scheme, relative
  if (raw[1] === '/' || raw[1] === '\\') return DEFAULT_RETURN_URL; // R47: //host, /\host
  if (/^\/login(?:[/?#]|$)/.test(raw)) return DEFAULT_RETURN_URL;   // R48
  return raw;                                                 // R45
}
```

`onSubmit` change (only the success branch's last line):

```ts
const raw = this.router.parseUrl(this.router.url).queryParamMap.get('returnUrl');
await this.router.navigateByUrl(safeReturnUrl(raw));
```

- The value is read from `router.url` at submit time rather than from an injected `ActivatedRoute`:
  the existing login spec creates the component with `TestBed.createComponent` (not through a
  router outlet), where an injected `ActivatedRoute` would be the root route with no query params.
  `router.url` is correct both in the app and in that harness.
- `navigateByUrl` (not `navigate([...])`) so a returnUrl such as `/projects/demo?x=1#log` keeps its
  query string and fragment (R45); `navigate(['/projects/demo?x=1'])` would encode `?` into the path.
- The `\` check covers browsers that normalise `/\host` to `//host`. Scheme URLs (`https:`,
  `javascript:`, `data:`) never start with `/`, so the first check rejects them.
- `/login` is rejected so a stale `returnUrl=/login?...` cannot bounce the user back to the form
  (R48); `/loginx` is a different path and is allowed (it falls through to the router's wildcard).
- No change to `authGuard` or the interceptor: they keep producing `returnUrl` as today.
- Failed logins are unchanged: they never navigate.

## Routing and the dashboard page

The route table does not change: `''` (child, `pathMatch: 'full'`) already exists under the guarded
`DashboardPageComponent`. What changes is what the page does when `slug() === null`:

- Delete `redirectToDefault`, `recallProject`, `rememberProject` and `LAST_PROJECT_STORAGE_KEY`.
  With `/` being the overview, a remembered project would only ever be read to skip the overview
  (R4); keeping the write without the read leaves dead state. The selector and the 404 path no
  longer touch `localStorage`; drop the assertions that check `harness.lastProject` (spec lines
  ~709, ~776, ~875) and the four "redirects /…" / "falls back…" tests (~765–818), replacing them
  with R4 tests.
- `loading` becomes `stateLoading()` only (R5); `noProjects` is deleted (R5) — the overview's own
  empty state replaces it at `/`.
- The project-list `error` callback only sets `projectsError` (R6). It no longer sets `loadError`.
- Template: inside `<main>`, `@if (showsProject()) { ...existing section + aside... } @else if
  (slug() === null) { <app-progress-overview class="min-w-0 lg:col-span-2" /> }`. The overview is
  only instantiated at `/`, so it never requests the dashboard on `/projects/:slug` (R7, R8), and
  navigating back to `/` creates a fresh instance (one request per visit — R11). The 404 banner keeps
  its current placement.
- `main`'s grid class switches on `showsProject()`: `lg:grid-cols-[1.7fr_1fr]` only when a project
  is shown; the overview gets the full width.
- Wordmark (R10): wrap the existing `[data-wordmark]` content in
  `<a routerLink="/" aria-label="Overview" class="flex shrink-0 items-center gap-2.25 rounded
  focus:outline-none focus-visible:ring-1 focus-visible:ring-signal" data-wordmark>`; import
  `RouterLink`.
- Selector (R9): `{{ current ?? 'all projects' }}` and `aria-label` `'Switch project, current: ' +
  (current ?? 'all projects')`. The listbox keeps no selected option at `/`.

## `progress-overview.component.ts`

```ts
type OverviewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'unauthorized' }
  | { kind: 'ok'; data: DashboardResponse };

@Component({
  selector: 'app-progress-overview',
  imports: [GaugeModule, PieChartModule, BarChartModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // template per "Visual direction"
})
export class ProgressOverviewComponent implements OnInit {
  readonly state = signal<OverviewState>({ kind: 'loading' });
  readonly gaugeResults = computed(...);   // [{ name: 'Done', value: overall.percentage }]
  readonly statusSlices = computed(...);   // R23 order
  readonly topGroups = computed(...);      // R28/R29
  readonly statusColors = STATUS_CUSTOM_COLORS;   // [{ name: 'Pending', value: CHART_COLORS.pending }, ...]
  readonly topColors = TOP_CUSTOM_COLORS;         // Done / Remaining
  readonly gaugeValueFormatting = (v: number) => `${formatPercent(v)}%`;
  ngOnInit(): void { this.load(); }
  retry(): void { this.load(); }
  onTopSelect(event: unknown): void;       // R32
  statusTooltip(count: number): string;    // R25
}
```

- `load()`: sets `loading`, subscribes `api.getDashboard()` with `takeUntilDestroyed`; `next` →
  `ok`; `error` → `unauthorized` when `status === 401` (renders nothing; the interceptor is already
  redirecting — R15), else `error` with `err.message || 'Failed to load the overview.'` (R13).
- Import only the specific ngx-charts modules (`GaugeModule`, `PieChartModule`, `BarChartModule`),
  never `NgxChartsModule` — same rule `docs/conventions.md` applies to CDK. If the installed version
  exposes standalone components instead, import those; the constraint is "only what is used".
- `onTopSelect(event)`: ngx-charts' stacked bar emits `{ name, value, series }` where `series` is
  the group name (the slug). Navigate with `router.navigate(['/projects', series])` only when
  `series` is a string that equals one of the current `topProjects` slugs; anything else (e.g. a
  legend label) is ignored. The Top 10 chart has `[legend]="false"`, so that guard is defensive.
- The gauge and status chart bind no `(select)` handler (R27). Their legend/slice clicks only toggle
  ngx-charts' own highlight.
- Tooltips use ngx-charts `tooltipTemplate` (`<ng-template #statusTip let-model="model">`) so the
  copy is ours (R25, R31); `[tooltipDisabled]="false"`.
- All charts: `[animations]="false"` (R37).
- Chart sizing: ngx-charts fills its parent when `[view]` is unset, so each chart's wrapper has an
  explicit height (below). They resize on window resize by themselves.
- Readout (R34, R35) is the keyboard and screen-reader path to the same destinations, because SVG
  bars are not focusable. It is deliberately the only focusable element per project.

### Testing approach

SVG text from ngx-charts depends on layout timing, so tests assert the **inputs bound to the chart
components** (via `fixture.debugElement.query(By.directive(GaugeComponent)).componentInstance`) plus
HTML that the overview renders itself. Concretely: R19–R21 → gauge `results`, `min`, `max`,
`valueFormatting(59.62)`, `units`; R22–R24 → pie `doughnut`, `results`, `customColors`; R25/R31 →
the tooltip helper output and the rendered `ng-template` content; R26 → pie `legend === true`; R27 →
emit `select` on the pie and gauge debug elements, assert `router.navigate` not called; R28–R30 →
bar `results`/`customColors`; R32 → `triggerEventHandler('select', { name: 'Done', value: 7, series:
'spectator_backend' })`, assert navigation to `/projects/spectator_backend`; R33 →
`getComputedStyle(barPath).cursor === 'pointer'` after `fixture.whenStable()`; R37 → `animations ===
false` on all three. Tests use `provideNoopAnimations()`.

Grouping (per `docs/specs.md` "Coverage granularity"): one test may cover R19–R21, one R22–R24 +
R26, one R28–R30, one R34 + R35; the implementer lists every id explicitly in the traceability
table.

## Visual direction

**Skill:** produced after invoking the `frontend-design:frontend-design` skill (Claude Code skill
tool, this session). The brief pins most axes: dark-only, the existing `tailwind.config.js` tokens,
IBM Plex Sans/Mono, mono uppercase `text-label` instrument labels for panel titles (a project
convention that overrides the skill's general "avoid all-caps labels" advice). So no freedom is spent
on palette or type; the skill was used to choose the composition and the single memorable element,
and to reject the generic default (three identical rounded chart cards in a row).

**Chosen direction — "instrument strip + leaderboard".** The overview reads like the control-room
face of the console: one wide instrument strip carrying two readings (the overall dial and the
status ring) separated by a hairline, as one physical panel, and below it a leaderboard of projects.
The **one memorable element is the overall dial**: a 240° gauge whose filled arc is `status.done`
green on a `line` track, with the percentage in large mono figures at its center. Everything else is
quiet: the doughnut and the bars use the existing status colors and no decoration.

Rejected during the design pass: three equal cards side by side (the SaaS card kit; also squeezes the
Top 10 bars); a big-number KPI row above the charts (repeats what the gauge says).

### Palette (existing tokens + one new)

| Role | Value |
|---|---|
| Page | `bg-ink` (inherited from the shell) |
| Panels | `rounded-md border border-line bg-panel` (same surface as Blocked/Open session) |
| Strip divider | `border-t border-line` below `lg`, `lg:border-l lg:border-t-0` at `lg` |
| Gauge arc | `#3ecf8e` (`status.done`); track `fill-line` (`#212a35`) |
| Status slices | R24 hexes; doughnut inner gap shows `bg-panel` |
| Top 10 segments | `Done` `#3ecf8e`, `Remaining` `#3a4452` (`line-strong`) |
| Axis/tick text | `fill-muted` (`#7c8797`), gridlines `stroke-edge` |
| Legend text | `text-dim`; hovered entry `text-text` (ngx-charts' own active class) |
| Tooltip | `bg-panel-raised border border-line-strong text-text`, caret `border-t-panel-raised` |
| Error banner | the page's existing `[ERR]` banner classes, verbatim |
| New token | `status.spec-drafting` `#4fa3e0` — sky blue, distinct from `spec-ready` violet and `in-progress` amber, ≥ 4.5:1 on `panel` for text use |

### Type

- Page heading: `<h1 class="m-0 font-mono text-label font-semibold uppercase text-muted">Overview</h1>`
  (same as the "Features" heading).
- Summary line (R18): `font-sans text-sm text-soft`; the two numbers wrapped in
  `<span class="font-mono text-text">` (they are API values).
- Panel titles: `m-0 mb-2.5 font-mono text-label font-semibold uppercase text-muted`.
- Gauge center value: ngx-charts scales it to the dial; force the face with
  `[&_.gauge_text]:font-mono [&_.gauge_text]:!fill-bright`; units text `[&_.gauge_.units]:!fill-muted`.
- Readout: slug `font-mono text-xs text-text`, counts `font-mono text-2xs text-dim tabular-nums`,
  percentage `font-mono text-2xs text-soft tabular-nums`, rank `font-mono text-tag text-faint`
  (the list is a ranking, so the rank number encodes real order).

### Layout

```
lg (≥1024px)                                           < lg
┌ OVERVIEW ─────────────────────────────────────┐      OVERVIEW
│ 31 of 52 features done across all projects.   │      31 of 52 features done…
├───────────────────────┬───────────────────────┤      ┌ OVERALL PROGRESS ───┐
│ OVERALL PROGRESS      │ BY STATUS             │      │      (dial)         │
│      ╭───────╮        │    ◯ ring   ■ Pending │      ├ BY STATUS ──────────┤
│     ╱ 59.62% ╲        │             ■ Spec dr…│      │      (ring)         │
│       31 / 52 done    │             ■ …       │      │  legend below       │
├───────────────────────┴───────────────────────┤      └─────────────────────┘
│ TOP 10 PROJECTS                ■ Done ■ Remaining│    ┌ TOP 10 PROJECTS ────┐
│ spectator_backend ████████████████████░░        │    │ bars (slug ticks)   │
│ …                                              │    │ readout list        │
│  1  spectator_backend        7/8      87.50%   │    └─────────────────────┘
└───────────────────────────────────────────────┘
```

- Overview root: `flex min-w-0 flex-col gap-4`.
- Header: `flex flex-col gap-1`.
- Strip (R39): `<section class="grid grid-cols-1 rounded-md border border-line bg-panel
  lg:grid-cols-[1fr_1.3fr]" data-overview-strip>`; each half `min-w-0 p-3.5`; second half
  `border-t border-line lg:border-l lg:border-t-0`.
- Gauge wrapper: `h-[220px] sm:h-[240px]`; `[showAxis]="false"`, `[bigSegments]="10"`,
  `[smallSegments]="0"`, `[angleSpan]="240"`, `[startAngle]="-120"`.
- Status wrapper: `h-[260px]`; `[legendPosition]="'below'"` below `lg` and `'right'` at `lg`
  (read once from `matchMedia('(min-width: 1024px)')` on init via `DOCUMENT.defaultView`,
  fallback `'below'`); `[legendTitle]="''"`; `[arcWidth]="0.28"`.
- Top 10 panel: `rounded-md border border-line bg-panel p-3.5`; title row `flex items-baseline
  justify-between gap-3` with the key (`flex gap-3 font-mono text-micro text-dim`, each swatch
  `inline-block h-2 w-2 rounded-sm` in `bg-status-done` / `bg-line-strong`).
- Top 10 chart wrapper: height `topProjects.length * 34 + 40` px via `[style.height.px]`;
  `[xAxis]="true"`, `[yAxis]="true"`, `[showGridLines]="true"`, `[trimYAxisTicks]="true"`,
  `[maxYAxisTickLength]="16"`, `[barPadding]="10"`, `[legend]="false"`.
- Readout: `<ol class="m-0 mt-3 list-none border-t border-edge p-0 pt-2">`; each `<li
  class="grid grid-cols-[2ch_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 py-1">`; slug link
  `min-w-0 truncate` with `title` = full slug.
- Overflow (R40): every grid child `min-w-0`; slugs truncate in the readout and are trimmed in the
  axis; the full slug is in the tooltip and the link `title`.

Per breakpoint: **< sm (360 px)** single column, gauge 220 px, legend below the ring, readout
columns stay on one line (slug truncates); **sm–lg** same stack, gauge 240 px; **≥ lg** strip
splits 1fr / 1.3fr, legend to the right of the ring, Top 10 full width.

### Interaction states

| Element | Rest | Hover | Focus | Other |
|---|---|---|---|---|
| Top 10 bar (`[&_.bar]`) | segment color | `[&_.bar:hover]:brightness-125`, `cursor-pointer` (R33) | n/a (SVG) — readout is the keyboard path | tooltip on hover |
| Readout slug link | `text-text` | `hover:text-signal hover:underline underline-offset-2` | `focus:outline-none focus-visible:ring-1 focus-visible:ring-signal rounded-sm` | — |
| Status slice / legend entry | slice color | ngx-charts' own active highlight; `cursor-default` (`[&_path]:cursor-default`, `[&_.legend-label]:cursor-default`) | — | tooltip on hover; never navigates |
| Gauge | — | `cursor-default` | — | informative only |
| Retry button | `rounded border border-line bg-panel px-2.5 py-1 text-2xs text-soft` | `hover:bg-edge` | `focus:outline-none focus-visible:border-signal` | disabled while loading (state leaves `error`, so the button unmounts) |
| Wordmark link | unchanged look | `hover:text-bright` on the label | `focus-visible:ring-1 focus-visible:ring-signal` | — |

Library overrides use Tailwind arbitrary variants on the chart wrappers (e.g.
`[&_.tick_text]:!fill-muted [&_.gridline-path]:!stroke-edge [&_.background-arc_path]:!fill-line`);
`!` is needed because ngx-charts ships unencapsulated styles with higher specificity. The tooltip is
attached to `<body>`, outside any wrapper, so it is the one global rule, in `src/styles.css`:

```css
@layer components {
  body .ngx-charts-tooltip.type-tooltip {
    @apply rounded border border-line-strong bg-panel-raised px-2.5 py-1.5 font-mono text-2xs text-text shadow-card;
  }
  body .ngx-charts-tooltip.type-tooltip .tooltip-caret.position-top {
    @apply border-t-panel-raised;
  }
}
```

(Repeat the caret line for `position-right/left/bottom` with the matching border side.) This is
third-party chrome with no element we own to put classes on, which is the case
`docs/conventions.md`'s "no global `@apply` sheet" rule does not cover; keep it to this block.

### Motion

The single allowed motion is the existing loading spinner (`animate-spin-fast`,
`motion-reduce:animate-none`). Chart entrance animations are off (R37) — they would replay on every
visit to `/` and add nothing to a status reading.

### UI copy

| Where | Text |
|---|---|
| Page heading | `Overview` |
| Summary (R18) | `{done} of {total} features done across all projects.` |
| Panel titles | `Overall progress`, `By status`, `Top 10 projects` |
| Gauge value / units | `{fmt(percentage)}%` / `{done} / {total} done` |
| Status legend names | `Pending`, `Spec drafting`, `Spec ready`, `In progress`, `Blocked`, `Done` |
| Status tooltip | first line slice name; second line `{count} features ({fmt}%)` |
| Top 10 key | `Done`, `Remaining` |
| Top 10 tooltip | first line `{slug}`; second line `{done} / {total} done ({fmt(percentage)}%)` |
| Readout row | `{rank}` · `{slug}` · `{done}/{total}` · `{fmt(percentage)}%` (separate cells, no dots) |
| Loading (R12) | `Loading overview…` |
| Error (R13) | tag `[ERR]`, text `Could not load the overview: {message}`, button `Retry` |
| Empty (R16) | `No features registered yet. Run ./init.sh in a harness project to sync it to the mirror.` (`./init.sh` in `font-mono text-text`) |
| No ranking (R36) | `No projects to rank yet.` |
| Wordmark link | accessible name `Overview` |
| Selector at `/` (R9) | `all projects` |

## Error paths

| Case | Behaviour |
|---|---|
| Dashboard 401 | Interceptor ends the session and redirects to `/login?returnUrl=%2F`; overview renders nothing (R15, R41, R42). |
| Dashboard other non-2xx / network | `[ERR]` banner + `Retry` (R13, R14). |
| `overall.total === 0` | Empty state, no charts (R16). |
| `total > 0`, `topProjects` empty | Gauge + ring render; Top 10 panel shows `No projects to rank yet.` (R36). |
| Project list fails at `/` | Error shown in the selector only; overview unaffected (R6). |
| Local login 401 | Untouched by the interceptor; login form shows `Invalid login credentials` as today (R43). |
| Login succeeds with an unsafe / missing / `/login` returnUrl | Navigates to `/`; no error shown (R46–R48). |

## Discarded alternatives

1. **Keep the `/` → last project redirect and mount the overview at a new `/overview` route.**
   Rejected: the agreed requirements state `/` is the dashboard itself, and a redirect from `/`
   would make the overview unreachable from the natural entry point (login lands on `/`).
2. **Hand-built SVG/CSS charts (no chart library).** Rejected: the user chose
   `@swimlane/ngx-charts` explicitly (gauge, doughnut and stacked bars with tooltips/legend would be
   a sizeable bespoke component set); the dashboard route is lazy-loaded, so the bundle cost stays
   off startup.
3. **Handle 401 inside the overview (or in `authGuard`).** Rejected: the guard never sees HTTP
   responses, and per-component handling would leave the project list, state and log requests
   inconsistent. One interceptor rule covers every API call.
4. **Make all three charts navigable.** Rejected: there is no global per-status listing to land on,
   and `/` is the overview itself; only Top 10 entries map to an existing route.
5. **Chart-only Top 10 (no readout).** Rejected: SVG bars are mouse-only in ngx-charts; without the
   readout, keyboard and screen-reader users could not reach `/projects/:slug` from the overview.
6. **Validate `returnUrl` with `new URL(raw, location.origin)` and compare origins.** Rejected: it
   ties the check to `window.location` (awkward under Karma and SSR-unsafe), and URL parsing
   quirks (backslashes, tabs/newlines stripped by the parser) make "same origin" a weaker rule than
   the explicit single-leading-slash check the human asked for. The string check is pure and
   exhaustively testable.
7. **Validate `returnUrl` in `authGuard`/the interceptor when it is set.** Rejected: the query
   parameter is user-controllable (anyone can craft `/login?returnUrl=...`), so the only place the
   check protects anything is where it is consumed — the login page.

## Requirement coverage

| Requirement(s) | Test (file › name, to be created) |
|---|---|
| R1 | `harness-api.service.spec.ts` › getDashboard sends GET /api/harness/dashboard |
| R2 | `progress-format.spec.ts` › formats with two decimals (100, 87.5, 59.62, 0) |
| R3, R4, R5 | `dashboard-page.component.spec.ts` › renders the overview at / and stays there |
| R6 | `dashboard-page.component.spec.ts` › project list failure at / only shows in the selector |
| R7, R8 | `dashboard-page.component.spec.ts` › no overview and no dashboard request on /projects/:slug |
| R9 | `project-selector.component.spec.ts` › shows "all projects" without a current project |
| R10 | `dashboard-page.component.spec.ts` › wordmark links to / with name Overview |
| R11, R12 | `progress-overview.component.spec.ts` › requests once and shows loading |
| R13, R14 | `progress-overview.component.spec.ts` › shows [ERR] and retries |
| R15 | `progress-overview.component.spec.ts` › renders no banner on 401 |
| R16 | `progress-overview.component.spec.ts` › empty state when total is 0 |
| R17, R18 | `progress-overview.component.spec.ts` › renders three charts and the summary |
| R19, R20, R21 | `progress-overview.component.spec.ts` › gauge inputs |
| R22, R23, R24, R26 | `progress-overview.component.spec.ts` › status doughnut inputs |
| R25, R31 | `progress-overview.component.spec.ts` › tooltip copy |
| R27 | `progress-overview.component.spec.ts` › gauge and status selections do not navigate |
| R28, R29, R30 | `progress-overview.component.spec.ts` › top 10 groups in API order |
| R32 | `progress-overview.component.spec.ts` › clicking a top 10 bar navigates |
| R33 | `progress-overview.component.spec.ts` › top 10 bars use a pointer cursor |
| R34, R35 | `progress-overview.component.spec.ts` › readout rows and links |
| R36 | `progress-overview.component.spec.ts` › no ranking message |
| R37 | `progress-overview.component.spec.ts` › chart animations are off |
| R38 | `progress-format.spec.ts` › chart colors match the Tailwind tokens (reads the `bg-status-spec-drafting` computed color from a probe element) |
| R39 | `progress-overview.component.spec.ts` › strip is two columns at lg |
| R40 | `dashboard-page.component.spec.ts` › renders the overview at 360px with no horizontal scroll |
| R41, R42 | `auth.interceptor.spec.ts` › 401 ends the session and redirects with returnUrl |
| R43 | `auth.interceptor.spec.ts` › local login 401 passes through |
| R44 | `auth.interceptor.spec.ts` › 401 is re-emitted to the caller |
| R45, R46, R47, R48 | `return-url.spec.ts` › accepts `/`, `/projects/demo`, `/projects/demo?x=1#log`, `/loginx`; returns `/` for `null`, `''`, `https://evil.example`, `//evil.example`, `/\evil.example`, `javascript:alert(1)`, `projects/demo`, `/login`, `/login?returnUrl=%2F`, `/login/x` |
| R45 | `login-page.component.spec.ts` › follows a valid returnUrl after login (at `/login?returnUrl=%2Fprojects%2Fdemo`, router URL becomes `/projects/demo`) |
| R46 | `login-page.component.spec.ts` › navigates to / when returnUrl is missing (existing R5–R8 / R3 tests keep asserting `/`) |
| R47 | `login-page.component.spec.ts` › ignores an external returnUrl (`https://evil.example` → `/`) and a protocol-relative one (`//evil.example` → `/`) |
| R48 | `login-page.component.spec.ts` › ignores a /login returnUrl (`/login` → `/`) |

## Open decisions (for the human)

1. `/` no longer redirects to the last project, and `harness.lastProject` is removed entirely.
2. A 401 anywhere now redirects to `/login` (changes feature 7's card-level `[ERR]` for 401).
3. Login now honours `returnUrl` when it is a safe internal path (R45–R48); anything else lands on `/`.
4. Top 10 has an HTML readout under the chart for keyboard/screen-reader access.
