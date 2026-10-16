# Design — feature_agent_usage_panel

Conventions are not re-derived here. Layers (`core/` owns HTTP, `dashboard/` renders), the
dependency allowlist, signals-only state and the "every HTTP error is visible inline" rule come from
`docs/architecture.md`; file naming, Tailwind/token rules, the mono/sans split, lucide `pick()` usage
and test layout come from `docs/conventions.md`. Selection, URL sync, cancellation and the card's
states come from `specs/feature_process_log_panel/design.md` and are extended, not changed. No new
dependency, no new layer, no new route, no new Tailwind token, no change to `authInterceptor`,
`AuthService` or `app-features-table`.

## Files to touch

| File | Change |
|---|---|
| `src/app/core/harness-api.service.ts` | New response types and `getFeatureAgentUsage` (R1, R2). |
| `src/app/core/harness-api.service.spec.ts` | Test for the new method. |
| `src/app/dashboard/usage-format.ts` | **New.** `formatTokens`, `formatExactTokens`, `formatDuration`, `formatExactSeconds` (R35–R39). Kept apart from `progress-format.ts` so feature 10 can import it without pulling chart colours. |
| `src/app/dashboard/usage-format.spec.ts` | **New.** Formatter tables. |
| `src/app/dashboard/agent-usage-section.component.ts` | **New.** Presentational section (R10–R44), rendered by the card. |
| `src/app/dashboard/agent-usage-section.component.spec.ts` | **New.** Section state, tree, timeline, totals tests. |
| `src/app/dashboard/process-log-card.component.ts` | New optional `usage` input; renders `<app-agent-usage-section>` between header and sessions when `state.kind === 'ok'` (R8, R9, R45). |
| `src/app/dashboard/process-log-card.component.spec.ts` | Placement test; existing tests unchanged. |
| `src/app/dashboard/dashboard-page.component.ts` | `agentUsage` signal, usage pipeline sharing the log target stream (R3–R7). |
| `src/app/dashboard/dashboard-page.component.spec.ts` | New integration tests; existing feature-selecting tests gain the usage request expectation (see "Test preservation"). |
| `docs/architecture.md` | Usage route in "Data Flow" and the section in the `dashboard/` layer line. |

## Contract types (`harness-api.service.ts`)

Derived from the backend structs `AgentUsageResponse`, `AgentRunNode`, `AgentRunTokens`,
`AgentUsageTotals` and `TokenTotals` in `../backend/src/harness/reader.rs`:

```ts
export interface AgentRunTokens {
  input: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  output: number | null;
  reasoning: number | null;
  total: number | null;
}

export interface AgentRunNode {
  externalId: string;
  parentExternalId: string | null;
  runtime: string;
  role: string | null;
  label: string | null;
  model: string | null;
  spawnDepth: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  tokens: AgentRunTokens;
  children: AgentRunNode[];
}

export interface TokenTotals {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  total: number;
}

export interface AgentUsageTotals {
  effortSeconds: number;
  unionSeconds: number;
  tokens: TokenTotals;
}

export interface AgentUsageResponse {
  runs: AgentRunNode[];
  totals: AgentUsageTotals;
}

getFeatureAgentUsage(slug: string, name: string): Observable<AgentUsageResponse> {
  return this.http.get<AgentUsageResponse>(
    `${environment.apiBaseUrl}/api/harness/projects/${encodeURIComponent(slug)}/features/${encodeURIComponent(name)}/agent-usage`,
  );
}
```

`TokenTotals` is exported under that name because feature 10's `agentUsage` dashboard block reuses
the same backend struct. `runtime` stays `string` (the mirror's `CHECK` allows `claude`/`codex`, but
the UI renders it verbatim, so a union type adds nothing). Token counts fit in a JS `number`
(`i64` values far below 2^53 in practice).

Contract facts the UI relies on (verified in the backend code, not only its spec):

- Tree, ordering, orphan placement and cycle breaking are done server-side (`build_run_tree`). The
  UI renders `children` as given and never re-sorts (R17).
- `spawnDepth` is copied from the row and is **not** the nesting level: an orphan placed at the top
  level keeps its real depth. Indentation therefore follows nesting (R16), and a top-level node with
  a `parentExternalId` is marked `detached` (R25). `spawnDepth` itself is typed but not rendered (see
  "Open decisions").
- `durationSeconds`, `effortSeconds`, `unionSeconds` are floats; `effortSeconds` and `unionSeconds`
  are never `null`, `0` when empty. `totals.tokens.*` are never `null`.
- Per-run `tokens.*` may be `null` (Claude runs usually have `reasoning: null`).
- Timestamps are `to_rfc3339()` strings (`2026-01-01T00:00:10+00:00`), parseable by `Date.parse`.

## Request wiring (`dashboard-page.component.ts`)

The existing log pipeline is built from a `LogTarget` stream (`NavigationEnd` → `{ slug, feature }`
→ `distinctUntilChanged`). Extract that stream into a local `target$` in `ngOnInit`, multicast it with
`shareReplay({ bufferSize: 1, refCount: true })`, then subscribe twice: the unchanged log
`switchMap`, and a new usage `switchMap`:

```ts
readonly agentUsage = signal<AgentUsageState>({ kind: 'idle' });

// usage pipeline
target$.pipe(
  switchMap(({ slug, feature }) => {
    if (!slug || !feature) return of<AgentUsageState>({ kind: 'idle' });
    this.agentUsage.set({ kind: 'loading' });
    return this.api.getFeatureAgentUsage(slug, feature).pipe(
      map((usage): AgentUsageState => ({ kind: 'ok', usage })),
      catchError((error: HttpErrorResponse) =>
        of<AgentUsageState>({
          kind: 'error',
          message: error.message || 'Failed to load agent usage.',
        }),
      ),
    );
  }),
  takeUntilDestroyed(this.destroyRef),
).subscribe((state) => this.agentUsage.set(state));
```

`shareReplay` goes after `distinctUntilChanged`. Plain `share()` is not enough: `startWith(null)`
emits synchronously when the first pipeline subscribes, so the second subscriber would miss the
initial target and no usage request would be sent on a direct load of `?feature=`. Replaying the
last target keeps R3 and F7's R11 at exactly one request each.

Two independent `switchMap`s give R5 (each request is cancelled by its own pipeline) and R6/R7 (a
usage failure never touches `processLog`). The template binds
`<app-process-log-card [state]="processLog()" [usage]="agentUsage()" />`.

## Card integration (`process-log-card.component.ts`)

```ts
@Input() usage: AgentUsageState = { kind: 'idle' };
```

Optional with a default so every existing card test still compiles and renders unchanged (R45). In
the `ok` branch, between the `[data-log-header]` block and the sessions `border-t` wrapper:

```html
<app-agent-usage-section [state]="usage" [featureName]="feature.name" />
```

The section is only reachable from the `ok` branch (R8, R9). When `usage.kind === 'idle'` while the
log is `ok` (cannot happen through the dashboard, only in isolated card tests), the section renders
its title and nothing else.

## Section component (`agent-usage-section.component.ts`)

```ts
export type AgentUsageState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; usage: AgentUsageResponse }
  | { kind: 'error'; message: string };

interface SpanBox { left: number; width: number } // percentages

@Component({
  selector: 'app-agent-usage-section',
  imports: [LucideAngularModule, NgTemplateOutlet],
  providers: [LucideAngularModule.pick({ ListTree }).providers ?? []],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `...`,
})
export class AgentUsageSectionComponent {
  @Input({ required: true }) state: AgentUsageState = { kind: 'idle' };
  @Input({ required: true }) featureName = '';

  role(run: AgentRunNode): string;          // role or 'unknown' (R18)
  present(value: string | null): boolean;   // not blank (R20, R21)
  span(run: AgentRunNode): SpanBox | null;  // R26–R28
  strip(): Array<{ key: string; box: SpanBox }>; // R29
  // formatters re-exposed for the template: tokens, exactTokens, duration, exactSeconds
}
```

`AgentUsageState` lives here (the card imports it), mirroring how `ProcessLogState` lives in the
card file.

- **Tree rendering:** a recursive `<ng-template #runList let-runs let-level="level">` rendered with
  `NgTemplateOutlet`; each `<li data-run [attr.data-level]="level">` renders its row, then, when
  `run.children.length > 0`, the same template with `level + 1` inside a nested `<ul>`. Track by
  `run.runtime + ':' + run.externalId` (unique per the mirror's index). No flattening, so R15 is
  plain DOM containment.
- **Feature span:** computed once per `ok` state (a `computed` over a signal set from the input, or
  a private cache keyed on the `usage` object) by walking every node depth-first: collect
  `[Date.parse(startedAt), Date.parse(finishedAt)]` where both are non-null and end ≥ start.
  `spanStart = min(starts)`, `spanEnd = max(ends)`.
- **`span(run)`:** `null` without an interval (R27); `{ left: 0, width: 100 }` when
  `spanEnd === spanStart` (R28); else `left = (start - spanStart) / (spanEnd - spanStart) * 100`,
  `width = (end - start) / (spanEnd - spanStart) * 100`. Bound with `[style.left.%]` and
  `[style.width.%]`; tests read `element.style.left` / `width` and compare numerically.
- **`strip()`:** one entry per node with an interval, in depth-first order, same boxes. Not rendered
  when the list is empty.
- **Detached:** `level === 0 && run.parentExternalId !== null` (R25).

## Formatters (`usage-format.ts`)

```ts
export function formatTokens(n: number): string;
export function formatExactTokens(n: number): string;
export function formatDuration(seconds: number): string;
export function formatExactSeconds(seconds: number): string; // `${seconds} s`
```

`formatTokens` (R36, R37), integer arithmetic to avoid binary-fraction rounding errors:

```ts
const UNITS = [
  { size: 1_000_000_000, suffix: 'B' },
  { size: 1_000_000, suffix: 'M' },
  { size: 1_000, suffix: 'k' },
] as const;

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  let i = UNITS.findIndex((u) => n >= u.size);
  let tenths = Math.round((n * 10) / UNITS[i].size);
  if (tenths >= 10_000 && i > 0) {
    i -= 1;
    tenths = Math.round((n * 10) / UNITS[i].size);
  }
  const whole = tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
  return whole + UNITS[i].suffix;
}
```

| `n` | `formatTokens` | `formatExactTokens` |
|---|---|---|
| `0` | `0` | `0` |
| `999` | `999` | `999` |
| `1000` | `1k` | `1,000` |
| `1150` | `1.2k` | `1,150` |
| `1234` | `1.2k` | `1,234` |
| `999949` | `999.9k` | `999,949` |
| `999950` | `1M` | `999,950` |
| `1234567` | `1.2M` | `1,234,567` |
| `2500000000` | `2.5B` | `2,500,000,000` |
| `1500000000000` | `1500B` | `1,500,000,000,000` |

`formatExactTokens` is `new Intl.NumberFormat('en-US').format(n)` (R38). The locale is fixed, not
the browser's, so tests are deterministic.

`formatDuration` (R39):

| `seconds` | Result |
|---|---|
| `0` | `0s` |
| `0.4` | `<1s` |
| `0.5` | `1s` |
| `42.4` | `42s` |
| `59.5` | `1m 00s` |
| `245.3` | `4m 05s` |
| `3599.4` | `59m 59s` |
| `3725` | `1h 02m` |
| `90061` | `25h 01m` |

`formatExactSeconds(245.317)` → `245.317 s`; `formatExactSeconds(100)` → `100 s` (R35).

## Visual direction

Produced with the `frontend-design:frontend-design` skill, loaded before this section was written.
The brief is pinned by the existing design system (tokens in `tailwind.config.js`, Plex Sans/Mono
split, uppercase `text-label` instrument titles per `docs/conventions.md`, the process log card's
rail and lowercase field keys), so no freedom is spent on palette or type. The skill's guidance
applied here: one memorable element, everything else quiet; structure that encodes information
(indent rails mean "spawned by", nothing decorative); no middle-dot meta strings (separate spans
with gaps); no new motion; copy that says plainly what a number means.

**The one memorable element: the overlap strip.** The feature's two headline numbers, agent effort
and wall time, differ only because runs overlap. A 6 px strip above the totals draws every run's
interval as a translucent amber segment on one shared time axis; overlapping runs stack and read
darker, so the gap between the two numbers is visible at a glance. Each run row repeats its own
segment on a 2 px hairline track, aligned to the same axis, so the tree doubles as a tiny Gantt.

### Palette (existing tokens only)

| Role | Classes |
|---|---|
| Section separator | wrapper `mt-3 border-t border-edge pt-3` (same as the sessions block) |
| Overlap strip track | `relative h-1.5 overflow-hidden rounded-sm bg-edge` |
| Overlap strip segment | `absolute inset-y-0 bg-signal/35` |
| Run track | `relative mt-1 h-0.5 bg-edge` |
| Run segment | `absolute inset-y-0 min-w-[2px] bg-dim` |
| Nesting rail | nested `<ul>` with `border-l border-line` |
| Runtime tag | `rounded-sm border border-line px-1 font-mono text-tag text-muted` |
| Detached tag | `rounded-sm border border-dashed border-line-strong px-1 font-mono text-tag text-faint` |
| Keys | `font-mono text-micro text-faint` (lowercase, like the session field keys) |
| Values | role and totals `text-text`, durations `text-dim`, run tokens `text-soft`, model `text-faint`, label `text-dim` |
| Error block | the dashboard banner: `flex items-start gap-2 rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs text-err-text`, tag `shrink-0 font-mono text-tag tracking-[0.08em] text-status-blocked` |

### Type

- Section title (R10): `<h3 class="m-0 mb-2 flex items-center gap-1.5 font-mono text-label
  font-semibold uppercase text-muted">` with `<lucide-icon name="list-tree" class="block h-3 w-3" />`
  (`ListTree`, present in the installed `lucide-angular` 1.0.0). Uppercase is the project's pinned
  instrument-label rule for section titles; it is used for this one title only.
- Mono (R40): role, runtime tag, detached tag, model, durations, token counts, totals keys and
  values. Sans: `label`, the totals note, the empty-state and loading prose.
- Sizes: role `text-2xs`, label `text-xs`, model `text-micro`, durations/tokens `text-2xs`, totals
  values `text-xs`, note `text-2xs`.

### Layout

```
│ 09  feature_agent_usage_panel                  │  existing header
│ ───────────────────────────────────────────────│
│ ⌸ AGENT USAGE                                  │  h3
│ ▕▒▒▒▓▓▓▒▒▒▒▒▒▒░░░░░░░▒▒▒▒░░░░░░░░░░░░▒▒▏       │  overlap strip
│ agent effort  2m 50s     wall time  1m 50s     │  totals <dl>
│ tokens        2.5k                             │
│               input 22  cache read 2k  cache…  │  breakdown, wraps
│ Agent effort adds up every run's duration.…   │  note
│                                                │
│ leader  claude                  1m 40s   1.3k │  run row (level 0)
│ claude-opus-5-5                                │  model / label line
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔                    │  run track
│ │ implementer  claude           30s     625    │  level 1, inside rail
│ │ implement feature  claude-opus-5-5           │
│ │   ▔▔▔▔▔▔▔▔                                   │
│ │ │ explore  claude  …                         │  level 2
│ reviewer …                                     │
│ thread-x  codex  detached        10s    1.1k   │  orphan at level 0
│ ───────────────────────────────────────────────│
│ ● #17  leader -> implementer   open            │  existing sessions
```

- Section wrapper: `<section class="mt-3 min-w-0 border-t border-edge pt-3" data-usage
  aria-labelledby="usage-title">`.
- Totals: `<div data-usage-totals class="mb-3 flex min-w-0 flex-col gap-2">` holding the strip
  (`aria-hidden="true"`), then `<dl class="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3
  gap-y-1">`. Rows: `agent effort`, `wall time`, `tokens`. The `tokens` `<dd>` holds the total
  (`font-mono text-xs text-text`) and below it a `flex flex-wrap gap-x-2.5 gap-y-0.5` line of five
  pairs (`<span class="text-faint">input</span> <data class="text-dim">22</data>`, …). Note:
  `<p class="m-0 font-sans text-2xs text-muted">`.
- Run list wrapper (R42): `<div class="min-w-0 focus:outline-none focus-visible:outline
  focus-visible:outline-1 focus-visible:outline-signal lg:max-h-[40vh] lg:overflow-y-auto"
  tabindex="0" [attr.aria-label]="'Agent runs of ' + featureName" data-usage-scroll>`.
- Top-level list: `<ul class="m-0 flex list-none flex-col gap-2.5 p-0">`. Nested list:
  `<ul class="m-0 ml-1 mt-2 flex list-none flex-col gap-2.5 border-l border-line p-0 pl-2.5">`.
  Each level adds ~15 px; four levels cost ~60 px at 360 px, within budget (R41).
- Run row: `<div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">` with role
  (`min-w-0 break-all font-mono text-2xs text-text`; `unknown` in `text-faint`), runtime tag,
  optional detached tag, then `ml-auto` duration (`font-mono text-2xs text-dim`, `title` = exact
  seconds) and tokens (`<data>` `font-mono text-2xs text-soft`, `title` = `<exact> tokens`). Second
  line only when label or model is present: `flex min-w-0 flex-wrap items-baseline gap-x-2` with
  label (`min-w-0 break-words font-sans text-xs text-dim [overflow-wrap:anywhere]`) and model
  (`min-w-0 break-all font-mono text-micro text-faint`). Then the run track when R26 applies.
- Overflow (R41): every container `min-w-0`; mono identifiers `break-all`; prose `break-words`.

Per breakpoint:

- **< lg:** the card is stacked below the features list (F7 behaviour); the run list grows with the
  page, no inner scroll.
- **≥ lg:** the card sits in the right column; the run list is capped at `40vh` with its own
  keyboard-focusable scroll, so a long tree never pushes the sessions out of reach. The sessions
  block keeps its own `60vh` cap from F7.

### Interaction states

- Run rows are not interactive (no hover, no selection, no disabled state): they are a readout.
- Focus: only the run-list scroll region (R42) is focusable, with the same 1 px `signal`
  `focus-visible` outline as the sessions scroll region.
- Exact values: native `title` tooltips on every compact token count and duration (R24, R35).
  Screen readers get the compact text; the exact integer is in `<data value>`.

### Motion

None added. The loading spinner reuses `animate-spin-fast` with `motion-reduce:animate-none`
(R43). No beacons (R44), no entrance animation, no animated strip.

### UI copy

| Where | Text |
|---|---|
| Section title | `Agent usage` |
| Loading | `Loading agent usage…` |
| Error | `[ERR]` + `<error message>` or `Failed to load agent usage.` |
| Empty | `No agent runs recorded for this feature.` |
| Totals keys | `agent effort`, `wall time`, `tokens` |
| Token breakdown keys | `input`, `cache read`, `cache write`, `output`, `reasoning` |
| Totals note | `Agent effort adds up every run's duration. Wall time counts overlapping runs once.` |
| Null role | `unknown` |
| Null duration / token total | `—` |
| Orphan tag | `detached`, title `Parent run <parentExternalId> is not part of this feature's runs.` |
| Token tooltip | `<exact> tokens` (e.g. `1,234,567 tokens`) |
| Duration tooltip | `<seconds> s` (e.g. `245.317 s`) |
| Run list aria-label | `Agent runs of <name>` |

## Error paths

| Condition | Section state | Req |
|---|---|---|
| No selected feature | no request; card idle (section not rendered) | R4, R45 |
| Log loading / 404 / error | section not rendered; usage request still runs | R9, R45 |
| Usage request pending | `Loading agent usage…` | R11 |
| Usage 401 / 404 / 500 / network | `[ERR]` + message; sessions still rendered | R7, R12 |
| Selection or project changes mid-request | in-flight usage request cancelled | R5 |
| `runs: []` | empty message, no totals | R13 |
| Mirror without `agent_runs` table | backend 500 → `[ERR]` | R12 |
| Mirror without the RPC (table empty) | `runs: []` → empty message (indistinguishable server-side) | R13 |

401 still also triggers the interceptor's redirect (existing behaviour); the section renders
`[ERR]` like the log card does (F7 R22).

## Test plan and requirement coverage

Grouping per `docs/specs.md` § "Coverage granularity": a row lists every requirement its test
asserts. Fixture: one shared `usageResponse()` builder in each spec file with the backend example
tree (`lead` → `impl` → `explore`, `lead` → `rev`, orphan codex `thread-x` with parent
`outside-thread`), base time `2026-01-01T00:00:00+00:00`, plus a deep variant for R41.

| Test (file) | Covers |
|---|---|
| `harness-api.service.spec.ts`: `gets one feature's agent usage, encoding slug and name` (`'team/odd slug'`, `'a b/c'`), flushes a typed fixture and asserts the received value | R1, R2 |
| `usage-format.spec.ts`: `formats token counts compactly` (the `formatTokens` table) | R36, R37 |
| `usage-format.spec.ts`: `formats exact token counts with en-US separators` | R38 |
| `usage-format.spec.ts`: `formats durations` (the `formatDuration` table) and `formats exact seconds` | R35, R39 |
| `agent-usage-section.component.spec.ts`: `shows a status loader with motion disabled under reduced motion` | R10, R11, R43 |
| `agent-usage-section.component.spec.ts`: `renders [ERR] with the message, or the fallback` | R12 |
| `agent-usage-section.component.spec.ts`: `renders the empty message and no totals for runs: []` | R13 |
| `agent-usage-section.component.spec.ts`: `renders one run item per node, nested under its parent, with data-level, in response order` (fixture children deliberately not in time order to prove no re-sort) | R14, R15, R16, R17 |
| `agent-usage-section.component.spec.ts`: `renders role, runtime, label, model, duration and tokens, with fallbacks for nulls and blanks` | R18, R19, R20, R21, R22, R23 |
| `agent-usage-section.component.spec.ts`: `exposes exact token and duration values` (`<data value>`, `title` attributes) | R24, R35 |
| `agent-usage-section.component.spec.ts`: `marks top-level runs with a missing parent as detached` (and not a root with `parentExternalId: null`, nor a nested run) | R25 |
| `agent-usage-section.component.spec.ts`: `positions run segments on the feature span, omitting runs without an interval` (includes an inverted interval and a null `finishedAt`) | R26, R27 |
| `agent-usage-section.component.spec.ts`: `fills the track when the feature span has zero length` | R28 |
| `agent-usage-section.component.spec.ts`: `draws one strip segment per run with an interval` | R29 |
| `agent-usage-section.component.spec.ts`: `renders effort, wall time, token total, breakdown and note in the totals block` | R30, R31, R32, R33, R34 |
| `agent-usage-section.component.spec.ts`: `splits mono data values from sans prose` (classes and computed `font-family`) | R40 |
| `agent-usage-section.component.spec.ts`: `labels the focusable run list with the feature name` | R42 |
| `agent-usage-section.component.spec.ts`: `never renders a beacon` (in loading and ok states) | R44 |
| `process-log-card.component.spec.ts`: `renders the usage section between the header and the sessions only when the log is ok` (iterates idle/loading/not-found/error, asserting no `[data-usage]`, and the existing state content still present) | R8, R9, R45 |
| `dashboard-page.component.spec.ts`: `requests the agent usage once for the selected feature and none without a selection` | R3, R4, R6 |
| `dashboard-page.component.spec.ts`: `cancels the in-flight usage request when the feature or project changes` | R5 |
| `dashboard-page.component.spec.ts`: `keeps rendering the sessions when the usage request fails` (usage 500, log 200) | R7, R12 |
| `dashboard-page.component.spec.ts` (`phone width`): extend the 360 px test with a selected feature and a four-level usage tree with unbroken role/model/label/externalId tokens | R41 |

### Test preservation

`dashboard-page.component.spec.ts` ends every test with `httpTesting.verify()`. Every existing test
that selects a feature will now leave one unmatched usage request, so each of those tests gains an
`expectOne(usageUrl(slug, name))` (flushed or left to be cancelled where the test asserts
cancellation) and nothing else; no existing assertion is edited or removed. Add a `usageUrl` helper
next to `logUrl`. Every other existing test (card states, table, overview, 360 px) must pass
unchanged; together they are the preservation baseline for R45.

## Discarded alternatives

1. **Rebuild the tree client-side from a flat list using `parentExternalId`/`spawnDepth`.**
   Rejected: the backend already returns a nested tree with orphan and cycle rules pinned by its
   tests; re-deriving it here would create a second, untested implementation that could disagree.
2. **Indent by `spawnDepth` instead of nesting.** Rejected: `spawnDepth` is nullable and is the raw
   recorded depth, so an orphan at the top level could be indented under nothing, and a null depth
   has no position. Nesting is always defined; the `detached` tag explains the orphan case.
3. **One `forkJoin` of log and usage in the existing `switchMap`.** Rejected: the card would wait
   for the slower request, and a usage failure would fail the log too, contradicting R6/R7.
4. **Fetch inside the section component.** Rejected for the same reason F7 rejected it for the
   card: every API call is made by the page; presentational components stay testable without
   `HttpTestingController`.
5. **A separate Agent usage card in the aside.** Rejected: the feature description asks for a
   section of the process log panel, and a second card would duplicate the feature header and the
   idle/404 states.
6. **A charting library (ngx-charts) for the timeline.** Rejected: `@swimlane/ngx-charts` is
   allowlisted only for the progress overview (`docs/architecture.md`), and absolutely positioned
   divs are enough for interval bars.

## Open decisions (for the human)

- `spawnDepth` is typed but not rendered; indentation follows nesting, orphans get `detached`.
  Alternative: show `depth <n>` per row.
- Only `tokens.total` is shown per run; the category breakdown is shown for totals only. The exact
  per-run categories could go into the `title` tooltip if wanted.
- Durations are rounded (`4m 05s`); hours drop seconds.
- `lg:max-h-[40vh]` for the run list next to the sessions' `60vh`; both scroll independently.
