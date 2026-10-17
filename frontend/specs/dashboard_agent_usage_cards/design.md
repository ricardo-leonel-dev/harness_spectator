# Design — dashboard_agent_usage_cards

Conventions are not re-derived here. Layers (`core/` owns HTTP, `dashboard/` renders), the
dependency allowlist, signals-only state and the "every HTTP error is visible inline" rule come from
`docs/architecture.md`; file naming, Tailwind/token rules, the mono/sans split, uppercase
`text-label` instrument titles and test layout come from `docs/conventions.md`. The overview's
request, states, retry and existing charts come from `specs/progress_dashboard_view/design.md` and
are not changed. Formatters come from `specs/feature_agent_usage_panel/design.md` and are reused
as-is. No new dependency, no new route, no new HTTP call, no new Tailwind token.

## Files to touch

| File | Change |
|---|---|
| `src/app/core/harness-api.service.ts` | New types `UsageBucket`, `DashboardAgentUsage`; `agentUsage?: DashboardAgentUsage` on `DashboardResponse` (R1). No new method. |
| `src/app/core/harness-api.service.spec.ts` | Only if it pins the `DashboardResponse` shape; otherwise untouched (the type is covered by compilation of the new tests). |
| `src/app/dashboard/progress-format.ts` | New `USAGE_CHART_COLORS` constant (hex for ngx-charts schemes). `CHART_COLORS` unchanged. |
| `src/app/dashboard/progress-format.spec.ts` | One test pinning `USAGE_CHART_COLORS` to the `signal`/`dim` tokens. |
| `src/app/dashboard/dashboard-agent-usage.component.ts` | **New.** Presentational usage block (R5–R34). |
| `src/app/dashboard/dashboard-agent-usage.component.spec.ts` | **New.** Block tests. |
| `src/app/dashboard/progress-overview.component.ts` | Import the new component; render it once at the end of the `ok` case (R3, R5). Nothing else in the template or class changes. |
| `src/app/dashboard/progress-overview.component.spec.ts` | New placement/request tests; every existing test unchanged (R2–R5). |
| `src/app/dashboard/dashboard-page.component.spec.ts` | New 360 px test with populated usage (R33); existing tests unchanged. |
| `docs/architecture.md` | `@swimlane/ngx-charts` allowlist line: "imported only by the progress overview and its agent usage block"; mention the block in the `dashboard/` layer line. |

`usage-format.ts` is imported, not modified (`formatTokens`, `formatExactTokens`, `formatDuration`,
`formatExactSeconds` already satisfy R9–R12, R27, R28).

## Contract types (`harness-api.service.ts`)

Derived from `DashboardAgentUsage`, `UsageBucket`, `RuntimeBreakdown`, `ModelUsage`, `RoleUsage`
and `ProjectUsage` in `../backend/src/harness/reader.rs` (each `#[serde(flatten)]` bucket becomes
intersected keys):

```ts
export interface UsageBucket {
  runs: number;
  effortSeconds: number;
  tokens: TokenTotals; // existing type from feature 9, same backend struct
}

export interface DashboardAgentUsage extends UsageBucket {
  byRuntime: { claude: UsageBucket; codex: UsageBucket };
  byModel: Array<UsageBucket & { model: string | null }>;
  byRole: Array<UsageBucket & { role: string | null }>;
  topProjects: Array<UsageBucket & { slug: string }>;
}

export interface DashboardResponse {
  overall: { ... };          // unchanged
  topProjects: Array<...>;   // unchanged
  agentUsage?: DashboardAgentUsage;
}
```

**Why optional.** The backend always sends `agentUsage` (backend R1, R18). It is still typed optional
for two reasons: (1) every existing fixture in `progress-overview.component.spec.ts` and
`dashboard-page.component.spec.ts` is declared `satisfies DashboardResponse` / returns
`DashboardResponse` without the key; a required key would force edits to existing tests, which R4
forbids; (2) a frontend deployed against a backend that predates `650421f` renders the empty state
instead of throwing on `undefined.runs`. "Absent" is folded into **empty usage** (R7).

`byRole` is typed (so the type mirrors the wire) but not rendered.

## Placement (`progress-overview.component.ts`)

Inside `@case ('ok')` → `@if (current.kind === 'ok')`, after the existing
`@if (current.data.overall.total === 0) { … } @else { … }` block closes:

```html
<app-dashboard-agent-usage [usage]="current.data.agentUsage ?? null" />
```

This puts the block last inside `[data-overview]` in both sub-branches (R5), never in
`loading`/`error`/`unauthorized` (R3). The overview's request code is untouched, so R2 holds by
construction; one new overview test asserts it with a populated `agentUsage`.

## Component (`dashboard-agent-usage.component.ts`)

```ts
interface ChartPoint { name: string; value: number }
interface SplitSegment { runtime: 'claude' | 'codex'; share: number } // percent

export const MODEL_CHART_LIMIT = 8;
export const NO_MODEL_LABEL = '(no model)';

@Component({
  selector: 'app-dashboard-agent-usage',
  imports: [BarChartModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `...`,
})
export class DashboardAgentUsageComponent {
  private readonly router = inject(Router);
  private readonly usageSignal = signal<DashboardAgentUsage | null>(null);

  @Input({ required: true }) set usage(value: DashboardAgentUsage | null) { this.usageSignal.set(value); }

  readonly data = computed(() => { const u = this.usageSignal(); return u && u.runs > 0 ? u : null; }); // null = empty usage (R7, R8)
  readonly splitSegments = computed<SplitSegment[]>(...);   // R15, R16
  readonly modelPoints = computed<ChartPoint[]>(...);       // R17, R18
  readonly rankingPoints = computed<ChartPoint[]>(...);     // R22
  readonly modelChartHeight = computed<number>(...);        // max(rows * 30 + 40, 74)
  readonly rankingChartHeight = computed<number>(...);      // same formula

  readonly axisFormat = (v: number): string => formatTokens(v);           // R29
  tokensTitle(n: number): string;   // `${formatExactTokens(n)} tokens`   (R27, R30)
  runsTitle(n: number): string;     // `${formatExactTokens(n)} runs`     (R27)
  runsLabel(n: number): string;     // ' run' when n === 1, else ' runs'  (R12)
  // formatTokens / formatDuration / formatExactSeconds re-exposed for the template

  onRankingSelect(event: unknown): void; // R25, R26 — same guard shape as ProgressOverviewComponent.onTopSelect
}
```

- **Empty usage:** `usage === null` (the overview maps `undefined` to `null`) or `usage.runs === 0`.
  `runs` is the backend's own "any counted run" signal (backend R18), so a non-zero token total with
  `runs: 0` cannot occur, and `runs > 0` with every token/duration `null` still renders the cards
  with zeros (that is real data: runs happened, nothing was measured).
- **Split segments:** `sum = claude.tokens.total + codex.tokens.total`; `sum === 0` → `[]` (R16);
  else one entry per runtime with `tokens.total > 0`, `share = total / sum * 100` (R15). Bound with
  `[style.width.%]`; tests compare `element.style.width` numerically (tolerance 0.01).
- **Model points:** names via `model ?? NO_MODEL_LABEL`. `byModel.length <= 8` → all, in order
  (R17); else the first 7 plus `{ name: 'Other (' + (len - 7) + ' models)', value: sum(rest) }`
  (R18). The backend already orders by tokens, so no client sort. Eight rows keep the chart within
  ~280 px.
- **Ranking points:** `topProjects.map(p => ({ name: p.slug, value: p.tokens.total }))` (R22). The
  backend caps at 10; the component does not re-cap.
- **`onRankingSelect`:** accepts the ngx-charts `bar-horizontal` select payload (`{ name, value,
  label }`); navigates with `router.navigate(['/projects', name])` only when `name` is a string equal
  to a `topProjects[].slug` (R25, R26). The model chart has no `(select)` binding at all (R20).
- **Tooltips:** both charts get `<ng-template #tooltipTemplate let-model="model">` (the
  `@ContentChild('tooltipTemplate')` name ngx-charts reads) rendering `model.name` and
  `tokensTitle(model.value)` (R30).
- **Charts:** `ngx-charts-bar-horizontal` with `[animations]="false"` (R31), `[xAxis]="true"`,
  `[yAxis]="true"`, `[showGridLines]="true"`, `[trimYAxisTicks]="true"`,
  `[maxYAxisTickLength]="16"`, `[barPadding]="8"`, `[legend]="false"`,
  `[xAxisTickFormatting]="axisFormat"` (R29), scheme `{ name, selectable: false, group:
  ScaleType.Ordinal, domain: [USAGE_CHART_COLORS.<key>] }`.

```ts
// progress-format.ts
export const USAGE_CHART_COLORS = {
  ranking: '#e8a33d', // = signal
  model: '#8b95a5',   // = dim
} as const;
```

## Visual direction

Produced with the `frontend-design:frontend-design` skill, loaded before this section was written.
The brief is pinned by the existing design system: tokens in `tailwind.config.js`, Plex Sans/Mono
split, uppercase mono `text-label` instrument titles (a project rule in `docs/conventions.md`, so the
skill's "avoid all-caps labels" default is overridden by the brief), and the overview's own panel
grammar — `rounded-md border border-line bg-panel` panels whose cells are divided by internal
`border-line` rules (the "instrument strip"), not a kit of floating cards. The skill's guidance
applied within that: one memorable element, everything else quiet; colour that encodes meaning
(amber = clickable ranking / Claude, grey = readout / Codex), no status colours reused for
non-status meaning; no middle-dot meta strings; no new motion; copy that says plainly what a number
means and what to do when it is empty.

**The one memorable element: the runtime split meter.** A 10 px bar at the top of the breakdown panel
divides the fleet's tokens between Claude (amber `signal`) and Codex (grey `dim`), with a 2 px
`ink` gap between the two segments and each share printed in mono at its end. It answers the first
question an operator has about a mixed fleet in one glance; everything else in the block is a
conventional readout.

### Palette (existing tokens only)

| Role | Classes / value |
|---|---|
| Block panels | `rounded-md border border-line bg-panel` (same as `[data-overview-strip]`) |
| Internal cell divider | `border-t border-line` on small, `sm:border-l sm:border-t-0` between the two KPI cells |
| Panel titles | `m-0 font-mono text-label font-semibold uppercase text-muted` |
| KPI value | `font-mono text-2xl leading-none font-semibold text-bright tabular-nums` (Tailwind's default `text-2xl`, so no arbitrary value and no new token) |
| KPI keys/breakdown keys | `font-mono text-micro text-faint` (lowercase, like the feature-9 totals keys) |
| Breakdown values | `font-mono text-2xs text-dim tabular-nums` |
| Note prose | `m-0 font-sans text-2xs text-muted` |
| Split track | `flex h-2.5 w-full gap-0.5 overflow-hidden rounded-sm bg-edge` |
| Split segment claude | `h-full bg-signal` |
| Split segment codex | `h-full bg-dim` |
| Runtime swatch | `inline-block h-2 w-2 rounded-sm` + `bg-signal` / `bg-dim` |
| Model chart bars | `USAGE_CHART_COLORS.model` (`#8b95a5`), `cursor-default` |
| Ranking chart bars | `USAGE_CHART_COLORS.ranking` (`#e8a33d`), `[&_.bar]:cursor-pointer [&_.bar:hover]:brightness-125` |
| Chart chrome | `[&_.tick_text]:!fill-muted [&_.gridline-path]:!stroke-edge` (same as existing) |
| Empty state | `m-0 rounded-md border border-line bg-panel px-3.5 py-6 text-center font-sans text-sm text-muted` (same as `[data-overview-empty]`) |

### Type

- Block title (R6): `<h2 id="usage-title">Agent usage</h2>` with the panel title classes, placed above
  the panels like the overview's `Overview` `<h1>` sits above its strip. Panel titles inside are
  `<h3>`: `Total tokens`, `Agent effort`, `By runtime`, `By model`, `Top 10 projects by tokens`.
- Mono (R32): KPI values, counts, durations, runtime names, model labels, slugs, ranks, keys. Sans:
  the effort note (R13) and the empty-state prose (R7).
- Sizes: KPI value `text-2xl`; runtime row `text-xs`; readout slug `text-xs`, figures `text-2xs`, rank
  `text-tag text-faint`; note `text-2xs`.

### Layout

```
OVERVIEW                                        (existing, unchanged)
[ overall progress | by status ]                (existing strip)
[ top 10 projects ]                             (existing)

AGENT USAGE                                                         h2
┌────────────────────────────────┬─────────────────────────────────┐
│ TOTAL TOKENS                   │ AGENT EFFORT                    │  [data-usage-strip]
│ 48.2M                          │ 312h 04m                        │
│ input 1.2M  cache read 44.1M   │ 1.8k runs                       │
│ cache write 2.1M  output 790k  │ Adds up every run's duration,…  │
│ reasoning 12k                  │                                 │
└────────────────────────────────┴─────────────────────────────────┘
┌──────────────────────────────┐ ┌─────────────────────────────────┐
│ BY RUNTIME                   │ │ TOP 10 PROJECTS BY TOKENS       │
│ 82%▕██████████████▏▕███▏18%  │ │ spectator_back ▇▇▇▇▇▇▇▇▇▇       │  ranking chart
│ ■ claude   39.5M   1.2k runs │ │ rushr-web      ▇▇▇▇▇            │  (amber, clickable)
│ ■ codex     8.7M     612 runs│ │ …                               │
│ BY MODEL                     │ │ ─────────────────────────────── │
│ claude-opus-5 ▆▆▆▆▆▆▆        │ │ 1 spectator_backend  21.4M  98h │  readout <ol>
│ gpt-5-codex   ▆▆             │ │ 2 rushr-web          12.0M  51h │
│ (no model)    ▆              │ │ …                               │
└──────────────────────────────┘ └─────────────────────────────────┘
```

- Wrapper: `<section class="flex min-w-0 flex-col gap-3" data-usage-overview
  aria-labelledby="usage-title">`.
- KPI strip: `<div class="grid grid-cols-1 rounded-md border border-line bg-panel sm:grid-cols-2"
  data-usage-strip>`; cells `min-w-0 p-3.5`, the second `border-t border-line sm:border-l
  sm:border-t-0`. Tokens cell `data-usage-tokens`: `<h3>`, KPI value (`<data>`), then a `<dl
  class="m-0 mt-2 flex flex-wrap gap-x-3 gap-y-0.5">` of five `<div class="flex gap-1.5"><dt>key</dt>
  <dd class="m-0"><data …></data></dd></div>` pairs. Effort cell `data-usage-effort`: `<h3>`, KPI
  value (duration, `title` exact seconds), runs line (`font-mono text-2xs text-dim`, `<data>` +
  ` runs`), note.
- Lower grid: `<div class="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.3fr]">`.
  - Breakdown panel `data-usage-breakdown` (`min-w-0 rounded-md border border-line bg-panel p-3.5`):
    `By runtime` `<h3>`; a row `flex items-center gap-2` with claude share (`font-mono text-2xs
    text-soft tabular-nums`, `82%` rounded to integer, hidden when `[]`), the split track
    `data-usage-split` (`aria-hidden="true"`, `flex-1`), codex share; then a `<ul class="m-0 mt-2
    flex list-none flex-col gap-1 p-0">` of two `data-usage-runtime` rows as `grid
    grid-cols-[auto_minmax(0,1fr)_auto_auto] items-baseline gap-x-3` (swatch, name, tokens, runs).
    Then `By model` `<h3 class="mt-4 …">` and `<div data-usage-models>` holding the chart wrapper
    (`w-full overflow-hidden [&_.bar]:cursor-default …`, `[style.height.px]="modelChartHeight()"`)
    or the R19 message (`m-0 py-2 text-center font-sans text-sm text-muted`).
  - Ranking panel `data-usage-ranking`: `<h3>`, chart wrapper
    (`[style.height.px]="rankingChartHeight()"`), then `<ol class="m-0 mt-3 list-none border-t
    border-edge p-0 pt-2">` with `<li data-usage-rank class="grid
    grid-cols-[2ch_minmax(0,1fr)_auto_auto] items-baseline gap-x-3 py-1">`: rank, slug link
    (`min-w-0 truncate font-mono text-xs text-text hover:text-signal hover:underline
    underline-offset-2 focus:outline-none focus-visible:rounded-sm focus-visible:ring-1
    focus-visible:ring-signal`, `[title]="slug"`, `data-usage-slug`), tokens (`<data>`, `text-soft`),
    effort (`text-dim`, `title` exact seconds). The readout repeats the existing top-10 readout's
    grammar on purpose: same grid, same link styling, so both rankings read as one system.
- Overflow (R33): every grid child `min-w-0`; slugs `truncate` with `title`; model/slug axis ticks
  trimmed by ngx-charts (`maxYAxisTickLength` 16); chart wrappers `overflow-hidden`.

Per breakpoint:

- **< sm (360 px):** one column throughout; KPI cells stack with a `border-t` divider; breakdown
  above ranking.
- **sm – < lg:** KPI cells side by side (`sm:grid-cols-2`); breakdown and ranking still stacked.
- **≥ lg:** KPI strip full width; breakdown (1fr) and ranking (1.3fr) side by side, top-aligned
  (`items-start`), matching the existing strip's `1fr_1.3fr` proportion.

### Interaction states

- Ranking: chart bars `cursor-pointer` and `brightness-125` on hover; readout links `hover:text-signal
  hover:underline`, `focus-visible:ring-1 ring-signal`. Clicking either navigates to
  `/projects/<slug>` (R24, R25).
- Model chart and runtime rows: readouts only, `cursor-default`, no hover, no selection.
- No selected or disabled states exist in this block.
- Exact values: native `title` on every compact count and duration (R27, R28); screen readers get the
  compact text, the exact integer sits in `<data value>`.

### Motion

None. Charts render with `animations: false` (R31); no spinner (the block only exists in the `ok`
state), no beacon, no entrance animation (R34).

### UI copy

| Where | Text |
|---|---|
| Block title | `Agent usage` |
| Panel titles | `Total tokens`, `Agent effort`, `By runtime`, `By model`, `Top 10 projects by tokens` |
| Token breakdown keys | `input`, `cache read`, `cache write`, `output`, `reasoning` |
| Runs line | `<n> runs` / `1 run` |
| Effort note | `Adds up every run's duration, so overlapping runs each count in full.` |
| Runtime names | `claude`, `codex` (the wire keys, verbatim) |
| Null model | `(no model)` |
| Model overflow bucket | `Other (<n> models)` |
| No models | `No model recorded for any run.` |
| Empty state | `No agent runs recorded yet. Usage appears here once a harness project syncs its agent runs to the mirror.` |
| Token tooltip / title | `<exact> tokens` (e.g. `48,213,904 tokens`) |
| Runs title | `<exact> runs` |
| Duration title | `<seconds> s` (e.g. `1123440.5 s`) |

## Error paths

| Condition | Rendering | Req |
|---|---|---|
| Dashboard loading / error / 401 | existing overview states; no usage block | R3 |
| `agentUsage` absent (old backend, existing fixtures) | empty state | R7, R8 |
| `runs: 0` (backend R18 zero value) | empty state | R7, R8 |
| Runs exist, every token null | cards show `0`; split track empty | R9, R16 |
| Only one runtime used | one split segment at 100 % | R15 |
| `byModel: []` with runs > 0 (cannot occur: NULL model is its own group) | `No model recorded for any run.` | R19 |
| More than 8 models | 7 + `Other (n models)` | R18 |
| Ranking select with unknown name | ignored | R26 |

There is no new HTTP call, so no new error path: a failed dashboard request keeps the existing
`[ERR]` + Retry banner.

## Test plan and requirement coverage

Grouping per `docs/specs.md` § "Coverage granularity". Fixture: one `usage(overrides)` builder in
the new spec file with two runtimes, three models (one `null`), three projects (one long slug), and
`runs: 1834`, `effortSeconds: 1123440.5`, `tokens.total: 48213904`. Component tests set the input
directly (`fixture.componentRef.setInput('usage', …)`) with `provideRouter` and a spy on
`Router.navigate`; no `HttpTestingController` is needed for the block itself.

| Test (file) | Covers |
|---|---|
| `progress-overview.component.spec.ts`: `sends one dashboard request and renders the usage block last inside the overview` (populated `agentUsage`; asserts `expectOne` and that `[data-usage-overview]` is the last element child of `[data-overview]`) | R1, R2, R5 |
| `progress-overview.component.spec.ts`: `renders the usage block when overall.total is 0` | R5 |
| `progress-overview.component.spec.ts`: `does not render the usage block while loading, on error or on 401` | R3 |
| `progress-overview.component.spec.ts`: every existing test, unchanged | R4 |
| `dashboard-agent-usage.component.spec.ts`: `titles the block Agent usage` | R6 |
| `…`: `renders the empty state for null usage and for runs: 0, and no cards` | R7, R8 |
| `…`: `renders total tokens with the category breakdown` | R9, R10 |
| `…`: `renders agent effort, the run count and the note` (incl. `runs: 1` → `1 run`) | R11, R12, R13 |
| `…`: `renders claude then codex runtime rows with tokens and runs` | R14 |
| `…`: `sizes split segments by token share and omits zero runtimes` | R15 |
| `…`: `renders an empty split track when both runtimes have zero tokens` | R16 |
| `…`: `passes one model point per model in order, labelling null as (no model)` | R17 |
| `…`: `folds models beyond seven into Other (n models) when there are more than eight` (9 and 8 models) | R18 |
| `…`: `renders the no-model message when byModel is empty` | R19 |
| `…`: `does not navigate from the model chart` (asserts no `select` output subscription / navigate spy not called after emitting) | R20 |
| `…`: `renders the ranking title, chart points and readout in response order` | R21, R22, R23 |
| `…`: `links each ranking slug to its project` | R24 |
| `…`: `navigates on a known ranking select and ignores unknown names` | R25, R26 |
| `…`: `exposes exact counts and durations in data/title attributes` | R27, R28 |
| `…`: `formats chart axes compactly and defines token tooltips` (`axisFormat(2500000)` → `2.5M`, `tokensTitle(1234567)` → `1,234,567 tokens`, both chart instances' `tooltipTemplate` non-null and `xAxisTickFormatting === axisFormat`) | R29, R30 |
| `…`: `disables chart animations` | R31 |
| `…`: `splits mono data values from sans prose` (classes and computed `font-family`) | R32 |
| `…`: `renders no beacon and no animated element` | R34 |
| `dashboard-page.component.spec.ts` (`phone width`): `renders a populated agent usage block at 360px with no horizontal scroll` (10 ranking entries, a 60-char slug and model) | R33 |
| `progress-format.spec.ts`: `pins USAGE_CHART_COLORS to the signal and dim tokens` | design constant, supports R14/R22 colour mapping |

### Test preservation

Existing fixtures in `progress-overview.component.spec.ts` and `dashboard-page.component.spec.ts`
omit `agentUsage`, so after this feature they render the usage empty state in addition to their
existing content. No existing test asserts the overview's last child or counts every chart via a
generic selector (`sets animations to false on every chart` queries `GaugeComponent`,
`PieChartComponent`, `BarHorizontalStackedComponent` by type; the new charts are
`BarHorizontalComponent`, and are absent in empty state anyway). New attributes use the
`data-usage-*` prefix, so `[data-overview-*]` queries are unaffected. Every existing test must pass
unedited; together they are the R4 baseline.

## Discarded alternatives

1. **A second endpoint call (or a separate dashboard request) from the new component.** Rejected:
   `agentUsage` is part of the dashboard response the overview already loads; a second request would
   double the backend aggregation and could show usage from a different snapshot than the
   progress charts (R2).
2. **Make `agentUsage` a required property.** Rejected: it forces edits to every existing
   `DashboardResponse` fixture (breaking R4's "unchanged tests" baseline) and crashes against an
   older backend; optional + "absent = empty" costs one `?? null`.
3. **Render the block inline in `ProgressOverviewComponent`'s template.** Rejected: that template is
   already ~250 lines with three charts; a child component keeps the new block testable with plain
   inputs and leaves the existing component's diff to one line. The cost is one documented widening
   of the ngx-charts allowlist sentence in `docs/architecture.md` to cover this child.
4. **ngx-charts for the runtime split (pie/doughnut or stacked bar).** Rejected: two values with
   fixed names; a hand-built flex bar is lighter, testable via inline widths, and is the block's
   single memorable element. ngx-charts is kept for the two variable-length bar lists.
5. **A Runtime | Model toggle sharing one chart.** Rejected: adds selection state and hides one
   breakdown behind a click; both fit stacked in one panel.
6. **Reuse status colours (e.g. `status-done` green) for bars.** Rejected: green/amber/red already
   mean feature status on this page; the block uses only `signal` (interactive / Claude) and `dim`
   (readout / Codex).

## Open decisions (for the human)

- `byRole` is typed but not rendered. A third "By role" list in the breakdown panel is a small
  follow-up if wanted.
- Empty state is "absent or `runs === 0`". Runs with all-null tokens render real zeros rather than
  the empty state.
- Model chart caps at 8 rows (7 + `Other`); the ranking shows whatever the backend sends (≤ 10).
- The block renders even when `overall.total === 0` (runs can exist without registered features,
  backend R7). Hide it in that case instead if preferred.
- Runtime colours: Claude = `signal` amber, Codex = `dim` grey.
