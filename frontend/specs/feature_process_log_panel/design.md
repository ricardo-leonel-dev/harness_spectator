# Design — feature_process_log_panel

Conventions are not re-derived here. Layers (`core/` owns HTTP, `dashboard/` renders), the
dependency allowlist, signals-only state and the "every HTTP error is visible inline" rule come from
`docs/architecture.md`; file naming, Tailwind/token rules, the mono/sans split, lucide `pick()` usage
and test layout come from `docs/conventions.md`. No new dependency, no new layer, no new route, no
change to `authInterceptor` or `AuthService`.

## Files to touch

| File | Change |
|---|---|
| `src/app/core/harness-api.service.ts` | New response types and `getFeatureLog` (R1, R2). |
| `src/app/core/harness-api.service.spec.ts` | Tests for the new method. |
| `src/app/dashboard/features-table.component.ts` | Rows become toggle buttons; `selected` input, `toggled` output (R3–R10). |
| `src/app/dashboard/features-table.component.spec.ts` | **New.** Row selection tests. |
| `src/app/dashboard/process-log-card.component.ts` | **New.** Presentational card (R18–R36). |
| `src/app/dashboard/process-log-card.component.spec.ts` | **New.** Card state and content tests. |
| `src/app/dashboard/dashboard-page.component.ts` | Selection pipeline, URL sync, scroll on narrow viewports, card in the aside (R4, R5, R8, R11–R17). |
| `src/app/dashboard/dashboard-page.component.spec.ts` | Integration tests for URL sync, cancellation, project switch, 404/401, placement, 360 px. |
| `docs/architecture.md` | Add the log route to "Data Flow" and the card to the `dashboard/` layer line. |

## Contract types (`harness-api.service.ts`)

Names mirror the backend structs so the two specs read the same:

```ts
export interface FeatureHeader {
  featureNumber: number;
  name: string;
  title: string;
  status: string;
  sdd: boolean;
  description: string | null;
  acceptance: string[];
}

export interface ProcessLogEntry {
  entry: string;
  createdAt: string;
}

export interface ProcessLogSession {
  localId: number;
  agent: string;
  startedAt: string;
  closedAt: string | null;
  pausedAt: string | null;
  plan: string[] | null;
  nextStep: string[] | null;
  changes: string[] | null;
  verification: string | null;
  closure: string | null;
  entries: ProcessLogEntry[];
}

export interface FeatureLogResponse {
  feature: FeatureHeader;
  sessions: ProcessLogSession[];
}

getFeatureLog(slug: string, name: string): Observable<FeatureLogResponse> {
  return this.http.get<FeatureLogResponse>(
    `${environment.apiBaseUrl}/api/harness/projects/${encodeURIComponent(slug)}/features/${encodeURIComponent(name)}/log`,
  );
}
```

`description` and `acceptance` are typed (they are in the contract) but not rendered: the feature's
acceptance lists the header as number, name, title and status only. See "Open decisions".

## Selection state lives in the URL

`DashboardPageComponent` already derives the slug from the router (`NavigationEnd` →
`route.snapshot.firstChild.paramMap.get('slug')` → `distinctUntilChanged` → `switchMap`). The
existing state pipeline keys on the slug alone, so a query-parameter-only navigation does not refetch
state (R14) — it must stay that way; do not widen its `distinctUntilChanged` key.

Add a second, independent pipeline in `ngOnInit`:

```ts
type LogTarget = { slug: string | null; feature: string | null };

this.router.events.pipe(
  filter((e) => e instanceof NavigationEnd),
  startWith(null),
  map((): LogTarget => ({
    slug: this.route.snapshot.firstChild?.paramMap.get('slug') ?? null,
    feature: this.route.snapshot.firstChild?.queryParamMap.get('feature') || null,
  })),
  distinctUntilChanged((a, b) => a.slug === b.slug && a.feature === b.feature),
  switchMap(({ slug, feature }) => {
    this.selectedFeature.set(slug ? feature : null);
    if (!slug || !feature) { this.processLog.set({ kind: 'idle' }); return EMPTY; }
    this.processLog.set({ kind: 'loading', name: feature });
    return this.api.getFeatureLog(slug, feature).pipe(
      map((log): ProcessLogState => ({ kind: 'ok', log })),
      catchError((error: HttpErrorResponse) => of(toLogError(error, slug, feature))),
    );
  }),
  takeUntilDestroyed(this.destroyRef),
).subscribe((s) => this.processLog.set(s));
```

`switchMap` unsubscribes the previous inner `HttpClient` observable, which aborts the XHR — that is
the cancellation of R13 (`HttpTestingController`'s `TestRequest.cancelled` becomes `true`). An empty
string `?feature=` is treated as no selection (`|| null`).

New signals on the page: `selectedFeature = signal<string | null>(null)` and
`processLog = signal<ProcessLogState>({ kind: 'idle' })`.

```ts
// process-log-card.component.ts (exported)
export type ProcessLogState =
  | { kind: 'idle' }
  | { kind: 'loading'; name: string }
  | { kind: 'ok'; log: FeatureLogResponse }
  | { kind: 'not-found'; name: string; slug: string }
  | { kind: 'error'; message: string };
```

`toLogError` (module-private function in `dashboard-page.component.ts`): status 404 →
`not-found`; anything else → `error` with `error.message || 'Failed to load the process log.'`
(R21, R22).

### Writing the selection

```ts
onFeatureToggled(name: string): void {
  const slug = this.slug();
  if (!slug) return;
  const next = this.selectedFeature() === name ? null : name;
  void this.router.navigate(['/projects', slug], {
    queryParams: next ? { feature: next } : {},
    replaceUrl: true,
  });
  if (!this.isWideViewport()) this.scrollCardIntoView();
}
```

- Absolute commands `['/projects', slug]` instead of `navigate([], { relativeTo })`: the page's
  injected `ActivatedRoute` is the parent `''` route, and an explicit path avoids depending on how
  empty commands resolve against a parent (R4, R5).
- `replaceUrl: true` (R8): selecting rows is browsing within one view, so Back leaves the dashboard
  instead of stepping through every row clicked. Reload and deep links still work because the URL
  always reflects the current selection.
- `openProject(slug)` already calls `router.navigate(['/projects', slug])` with no `queryParams`,
  which drops `feature` (R12). It must stay that way; add a test, not code.
- `isWideViewport()` = `this.document.defaultView?.matchMedia('(min-width: 1024px)').matches ??
  true`. `scrollCardIntoView()` reads `(prefers-reduced-motion: reduce)` the same way and calls
  `this.card.host.nativeElement.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block:
  'start' })` (R15, R16). The card is obtained with `@ViewChild(ProcessLogCardComponent, { read:
  ElementRef })`; it is only scrolled after a row activation, never on deep-link restore. Inject
  `DOCUMENT` rather than touching `window` directly so tests can stub `matchMedia`.

## Features table changes

```ts
@Input() selected: string | null = null;
@Output() readonly toggled = new EventEmitter<string>();
```

The table only reports which row was activated; the page decides select vs. deselect (single source
of truth: the URL).

Markup per row (the outer list keeps `role="list"`; each row gets a `role="listitem"` wrapper so the
list semantics survive while the row itself is the control):

```html
<div role="listitem">
  <div
    role="button"
    tabindex="0"
    [attr.aria-pressed]="f.name === selected"
    (click)="toggled.emit(f.name)"
    (keydown.enter)="toggled.emit(f.name)"
    (keydown.space)="onSpace($event, f.name)"
    class="..."  <!-- see Visual direction -->
    data-feature-row
  > ...existing id / name / title / app-lifecycle-track children unchanged... </div>
</div>
```

`onSpace` calls `event.preventDefault()` (stops page scroll, R7) then emits. `[data-feature-row]`
stays on the row element and `app-lifecycle-track` stays its last child, so the existing dashboard
tests that query rows, their classes and the track position keep passing.

## Process log card

`ProcessLogCardComponent` (`app-process-log-card`), `OnPush`, presentational:

```ts
@Input({ required: true }) state: ProcessLogState = { kind: 'idle' };
```

Template helpers (methods on the component, no pipes):

- `idLabel(n)` — `String(n).padStart(2, '0')` (same as the table).
- `present(value: string | string[] | null): boolean` — `false` for `null`, `[]`, or a string whose
  `trim()` is empty; drives every optional block (R31).
- `items(list: string[] | null): string[]` — the list with blank strings removed, so a list of only
  blanks counts as empty.
- `sessionState(s): 'closed' | 'paused' | 'open'` — R32's precedence.

No client-side sorting (R25, R30): the server orders sessions (`startedAt`, id tie-break) and
entries (`createdAt`, id tie-break); re-sorting by timestamp string would lose the id tie-break the
server applies.

Timestamps render as the raw strings the API returns, inside `<time [attr.datetime]="value">`,
matching how `app-open-session-card` renders `startedAt` today. See "Open decisions".

### Error and auth handling

A 401 on this endpoint is handled exactly like a 401 on `/state` today: `authInterceptor` only
attaches the token, there is no global 401 redirect, and the dashboard surfaces the failure inline.
So the card shows `[ERR]` with `HttpErrorResponse.message` (R22). An expired local session is still
handled by `AuthService`'s existing expiry timer; nothing here changes that.

## Visual direction

Produced with the `frontend-design` skill. The brief is pinned by the existing design system
(`tailwind.config.js` tokens, mono instrument labels, status colours), so this section spends no
freedom on new palette or type; it chooses one memorable element and keeps the rest quiet.

**The one memorable element: the session rail.** Sessions hang off a single vertical hairline, and
each session's node reuses the lifecycle track's vocabulary (filled vs. hollow 7 px dot), so the
card reads as the lifecycle track turned vertical and zoomed into one feature. Everything else is
plain typography on the panel.

### Palette (existing tokens only)

| Role | Classes |
|---|---|
| Card surface | `rounded-md border border-line bg-panel p-3.5` (identical to Blocked) |
| Rail | `border-l border-line` on the `<ol>` |
| Node, open session | `bg-signal` filled, `h-1.75 w-1.75 rounded-full` — no pulse, no `data-beacon` (R36) |
| Node, paused session | hollow: `border-1.5 border-status-blocked bg-panel` |
| Node, closed session | filled: `bg-line-strong` |
| State label | `open` → `text-signal`, `paused` → `text-status-blocked`, `closed` → `text-faint` |
| Keys / field labels | `text-faint` |
| Values | ids `text-faint`, agent and names `text-text`, timestamps `text-dim`, prose `text-soft` |
| Selected row | `border-signal bg-edge` |
| Error / 404 block | the dashboard's existing banner: `rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text`, tag `font-mono text-tag tracking-[0.08em] text-status-blocked` |

### Type

- Card title: `m-0 mb-2.5 flex items-center gap-1.5 font-mono text-label font-semibold uppercase
  text-muted`, icon `<lucide-icon name="scroll-text" class="block h-3 w-3" />` (`ScrollText`,
  available in the installed `lucide-angular` 1.0.0), picked via `LucideAngularModule.pick({
  ScrollText })`.
- Field labels inside a session (`plan`, `next`, `log`, `changes`, `verified`, `closure`): lowercase
  `font-mono text-micro text-faint` — lowercase keys like the Open session terminal (`agent`,
  `started`, `next`), not uppercase instrument labels; they are keys, not section titles.
- Mono/sans split per `docs/conventions.md` and R33: mono for `#localId`, agent, timestamps,
  `changes` paths, feature name/number; sans for title, plan/next items, entry text, verification,
  closure.

### Layout

```
┌ PROCESS LOG ─────────────────────────────┐
│ 07  feature_process_log_panel            │  header: id text-2xs faint, name text-xs text
│ Show a feature's process log under Bl…   │  title: sans text-xs text-dim, wraps (no truncate)
│                       ○─●  in progress   │  app-lifecycle-track, right-aligned
│ ─────────────────────────────────────────│  border-t border-edge, mt-3 pt-3
│ ● #17  leader -> spec_author (…)  open   │  rail node + session line
│ │   started 2026-10-14T06:30:00+00:00    │  <dl> grid-cols-[8ch_1fr]
│ │   plan    1. Read docs …               │  <ol> decimal, sans
│ │   log     06:31 Grounded in …          │  entries: time on its own line above text
│ ○ #12  leader -> implementer   paused    │
│ │   …                                    │
└──────────────────────────────────────────┘
```

- Header block: `flex flex-col gap-1`; first line `flex items-baseline gap-2.5` with id
  (`w-5 shrink-0 font-mono text-2xs text-faint`) and name (`min-w-0 break-all font-mono text-xs
  text-text`); title `font-sans text-xs text-dim break-words`; track line `flex justify-end`.
- Session list: `<ol class="m-0 mt-3 flex list-none flex-col gap-4 border-l border-line p-0 pl-3.5
  ml-[3px]">` inside a `border-t border-edge pt-3` wrapper. Each `<li class="relative min-w-0">`
  has its node absolutely positioned at `-left-[18px] top-[5px]` so it sits centred on the rail.
- Session line: `flex flex-wrap items-baseline gap-x-2 gap-y-0.5`: `#localId` (`font-mono
  text-micro text-faint`), agent (`min-w-0 flex-1 break-words font-mono text-2xs text-text`), state
  label (`ml-auto font-mono text-micro tracking-[0.03em]` + state colour).
- Fields: `<dl class="m-0 mt-1.5 grid grid-cols-[8ch_minmax(0,1fr)] gap-x-2 gap-y-1">`; `<dt>` is
  the lowercase key, `<dd class="m-0 min-w-0">` the value. Time rows (`started`, `paused`, `closed`)
  first, then `plan`, `next`, `log`, `changes`, `verified`, `closure`.
- Lists: plan/next `<ol class="m-0 list-decimal pl-4 font-sans text-xs text-soft">` (they are
  ordered steps); changes `<ul class="m-0 list-none p-0 font-mono text-2xs text-dim break-all">`.
- Entries: `<ol class="m-0 flex list-none flex-col gap-1.5 p-0">`, each `<li>` holds `<time
  class="block font-mono text-micro text-faint">` then `<p class="m-0 whitespace-pre-wrap
  break-words font-sans text-xs text-soft">`.
- Overflow (R34): every value container has `min-w-0`; mono ids/paths use `break-all`, prose
  `break-words`. No horizontal scroll at 360 px.
- Height: at `lg` the session list wrapper gets `lg:max-h-[60vh] lg:overflow-y-auto` plus
  `tabindex="0"` and `aria-label="Sessions of <name>"` so it is keyboard-scrollable; below `lg` the
  card grows with the page (the aside is stacked under the table, page scroll is natural there).

Per breakpoint:

- **< lg (phone/tablet):** grid is one column; the aside, and therefore the card, stacks below the
  features list, after Open session and Blocked. Row activation scrolls the card into view (R15).
  Rows keep their existing two-line wrap (`sm:flex-nowrap`).
- **≥ lg:** grid `1.7fr / 1fr`; card under Blocked in the right column, session list capped at
  `60vh` with its own scroll. No scroll-into-view (the card is already on screen).

### Interaction states (rows)

Row base classes (replacing the current class string; layout utilities unchanged):

```
flex cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-1 border-b border-l-2 border-b-edge
border-l-transparent py-2.75 pl-3 pr-3.5 transition-colors last:border-b-0 hover:bg-row-hover
focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1
focus-visible:outline-signal motion-reduce:transition-none sm:flex-nowrap
aria-pressed:border-l-signal aria-pressed:bg-edge
```

Implementers: the last-child bottom border lives on the `listitem` wrapper now, so move
`last:border-b-0` accordingly (`[&:last-child>div]:border-b-0` on the wrapper, or put `border-b`
on the wrapper). The 2 px transparent left border plus `pl-3` keeps the id column exactly where
`px-3.5` put it, so nothing shifts on select. R10's literal classes `border-signal` and `bg-edge`
must appear on the selected row's `class` list: apply them with `[class.border-signal]` /
`[class.bg-edge]` bindings (the `aria-pressed:` variants above are then optional duplicates; pick
one mechanism and test the bound classes).

- Hover: `bg-row-hover` (existing).
- Focus: 1 px inset `signal` outline, keyboard only (`focus-visible`).
- Selected: amber 2 px left bar + `bg-edge`; hover over a selected row keeps `bg-edge`.
- Disabled: none (rows are never disabled).

### Motion

The one allowed motion is user-triggered: the scroll of the card into view after a row activation
on narrow viewports, `smooth` unless reduced motion is preferred (R15, R16). The loading spinner
reuses the dashboard's existing `animate-spin-fast` with `motion-reduce:animate-none` (R35). No new
keyframes, no entrance animation, no pulse on the open-session node.

### UI copy

| Where | Text |
|---|---|
| Card title | `Process log` |
| No selection | `Select a feature to see its process log.` |
| Loading | `Loading <name>…` (`<name>` in `font-mono text-text`) |
| 404 | `[404]` + `No feature named <name> in <slug>.` |
| Other error | `[ERR]` + `<error message>` or `Failed to load the process log.` |
| No sessions | `No sessions recorded for this feature yet.` |
| State labels | `open`, `paused`, `closed` |
| Field keys | `started`, `paused`, `closed`, `plan`, `next`, `log`, `changes`, `verified`, `closure` |
| Session list aria-label | `Sessions of <name>` |

## Error paths

| Condition | Card state | Req |
|---|---|---|
| No `feature` param, or `?feature=` empty | `idle` hint | R19 |
| Request pending | `loading` | R20 |
| 404 (unknown project or feature) | `not-found` | R21 |
| 401, 500, network error (status 0) | `error` with message | R22 |
| Selection or project changes mid-request | previous request cancelled, new state replaces it | R13 |
| Project itself 404s on `/state` | aside not rendered (existing), so no card | existing behaviour |

## Test plan and requirement coverage

Grouping per `docs/specs.md` § "Coverage granularity": a row lists every requirement its test
asserts.

| Test (file) | Covers |
|---|---|
| `harness-api.service.spec.ts`: `gets one feature's process log, encoding slug and name` (`'team/odd slug'`, `'a b/c'`) and flushes a full typed `FeatureLogResponse` fixture, asserting the value received | R1, R2 |
| `features-table.component.spec.ts`: `renders every row as a focusable toggle button with aria-pressed reflecting the selected input` | R3, R9, R10 |
| `features-table.component.spec.ts`: `emits the row name on click, Enter and Space, preventing default on Space` | R6, R7 |
| `dashboard-page.component.spec.ts`: `selecting a row writes ?feature= with replaceUrl, and activating it again clears it` (spy on `router.navigate`, then assert `router.url`) | R4, R5, R8 |
| `dashboard-page.component.spec.ts`: `restores the selection from the URL on load and requests the log once` | R9, R11 |
| `dashboard-page.component.spec.ts`: `does not refetch state when only the feature changes, and cancels the previous log request` | R13, R14 |
| `dashboard-page.component.spec.ts`: `switching project drops the feature query param and cancels the pending log request` | R12, R13 |
| `dashboard-page.component.spec.ts`: `places the process log card after the blocked card in the aside` | R17, R18 |
| `dashboard-page.component.spec.ts`: `shows the not-found message for a 404 and [ERR] for a 401 inside the card` | R21, R22 |
| `dashboard-page.component.spec.ts`: `scrolls the card into view on narrow viewports, honouring reduced motion` (stub `matchMedia` on an injected `DOCUMENT` view or spy `window.matchMedia`; spy `scrollIntoView`) | R15, R16 |
| `dashboard-page.component.spec.ts` (`phone width`): extend the 360 px test with a selected feature whose log has unbroken agent/changes/entry tokens | R34 |
| `process-log-card.component.spec.ts`: `shows the hint when idle` | R19 |
| `process-log-card.component.spec.ts`: `shows a status loader with motion disabled under reduced motion` | R20, R35 |
| `process-log-card.component.spec.ts`: `renders the 404 and error variants, with the fallback message` | R21, R22 |
| `process-log-card.component.spec.ts`: `renders the header and the empty-sessions message` | R23, R24 |
| `process-log-card.component.spec.ts`: `renders every populated session field in response order` (fixture with sessions deliberately not in timestamp order, to prove no re-sort) | R25, R26, R27, R28, R29, R30 |
| `process-log-card.component.spec.ts`: `omits null, empty and blank fields with their labels` | R31 |
| `process-log-card.component.spec.ts`: `labels sessions closed, paused or open` (includes a session with both `closedAt` and `pausedAt`) | R32 |
| `process-log-card.component.spec.ts`: `splits mono data values from sans prose` (class and computed `font-family`) | R33 |
| `process-log-card.component.spec.ts`: `never renders a beacon` | R36 |

Existing dashboard tests (row layout, four beacon kinds, titles, 360 px, selector) must keep passing
unchanged; they are the preservation baseline for the table restyle.

## Discarded alternatives

1. **Keep the selection in a component signal (or `localStorage`) instead of the URL.** Simpler
   wiring, but reload and deep links would lose it, which the acceptance explicitly requires.
   Rejected.
2. **A route segment (`/projects/:slug/features/:name`) instead of a query parameter.** Cleaner URL,
   but every existing slug pipeline reads `firstChild.paramMap`, the route table would need a nested
   child, and switching projects would have to strip a segment instead of simply not passing a
   query parameter. Rejected for touching routing for a view-level selection.
3. **A WAI-ARIA `listbox` with roving tabindex and arrow keys for the rows.** Semantically tidy, but
   the acceptance asks for Enter/Space on a focused row, and a listbox implies selection-follows-
   focus behaviour that would fire a request per arrow press. Rejected in favour of independent
   toggle buttons (`role="button"` + `aria-pressed`).
4. **Native `<button>` rows.** Free Enter/Space handling, but synthetic `KeyboardEvent`s in Karma do
   not trigger a button's default click, so keyboard selection could not be unit-tested without
   duplicating handlers that would then fire twice for real key presses. Rejected; the
   `project-selector`'s explicit `(keydown.enter)`/`(keydown.space)` pattern is followed instead.
5. **Fetch inside the card component.** Rejected: every API call today is made by the page and
   passed down to presentational cards; the card stays presentational so it is testable without
   `HttpTestingController`.

## Open decisions (for the human)

- Clicking the selected row deselects it (toggle). Alternative: no-op, plus a clear button in the
  card.
- `replaceUrl: true`: Back does not step through previous selections.
- Timestamps shown as raw ISO strings, consistent with the Open session card. Formatting them
  (relative or local time) would be a new convention for both cards.
- `description` and `acceptance` are typed but not shown in the card.
