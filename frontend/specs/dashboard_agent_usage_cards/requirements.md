# Requirements — dashboard_agent_usage_cards

Format: `docs/specs.md` (EARS, one `SHALL` clause per `R<n>`, every `R<n>` verifiable by a concrete
test).

Context: feature `progress_dashboard_view` renders the cross-project overview at `/` in
`app-progress-overview`, which sends one `GET {apiBaseUrl}/api/harness/dashboard` and renders
`overall` and `topProjects`. The backend feature `dashboard_agent_usage_stats` (spectator_backend,
done, commit `650421f`) adds a top-level `agentUsage` key to that same `200` body. This feature
renders it: a total tokens card, an agent effort card, a breakdown by runtime and by model, and a
top-10 project ranking by total tokens.

Out of scope: `agentUsage.byRole` (typed, not rendered; see `design.md` § "Open decisions"), any
second HTTP request, wall time across projects (the backend does not compute it), date/runtime
filters, and any change to the per-feature agent usage section (feature
`feature_agent_usage_panel`).

Backend contract consumed (authoritative source: `../backend/src/harness/reader.rs`,
`DashboardAgentUsage`, `UsageBucket`, `RuntimeBreakdown`, `ModelUsage`, `ProjectUsage`; matches
`../backend/specs/dashboard_agent_usage_stats/requirements.md` R3–R18):

- `agentUsage` = `{ runs, effortSeconds, tokens, byRuntime: { claude, codex }, byModel[], byRole[],
  topProjects[] }`. `runs` is an integer, `effortSeconds` a float, `tokens` a `TokenTotals` object
  whose six integer keys are never `null`.
- `byRuntime.claude` and `byRuntime.codex` are always present (zero bucket when empty).
- `byModel[]` elements are `{ model: string | null, runs, effortSeconds, tokens }`, ordered by
  `tokens.total` descending server-side. `topProjects[]` elements are `{ slug, runs, effortSeconds,
  tokens }`, at most 10, ordered by `tokens.total` descending server-side.
- With no counted run the backend returns `runs: 0`, zero totals and empty arrays.

Terms used below:

- **overview** — `app-progress-overview`.
- **usage block** — the new `[data-usage-overview]` element rendered by the overview.
- **usage data** — the `agentUsage` value of the dashboard response the overview loaded.
- **empty usage** — usage data that is absent (`undefined` or `null`), or whose `runs` is `0`.
- **compact format** — the output of `formatTokens` from `src/app/dashboard/usage-format.ts`
  (feature `feature_agent_usage_panel` R36, R37), applied to any integer count.
- **exact format** — the output of `formatExactTokens` from the same file.
- **duration format** — the output of `formatDuration` from the same file.
- **model label** — a `byModel` element's `model`, or `(no model)` when it is `null`.
- **runtime share** — a runtime's `tokens.total` divided by the sum of `byRuntime.claude.tokens.total`
  and `byRuntime.codex.tokens.total`, as a percentage.
- **model chart** — the `ngx-charts-bar-horizontal` inside `[data-usage-models]`.
- **ranking chart** — the `ngx-charts-bar-horizontal` inside `[data-usage-ranking]`.

## Contract and request

## R1
The system SHALL type the dashboard response as `DashboardResponse` with an optional
`agentUsage?: DashboardAgentUsage` property whose shape matches the backend contract above.

## R2
WHEN the overview loads, the system SHALL send exactly one `GET {apiBaseUrl}/api/harness/dashboard`
request, the same count as before this feature.

## Preservation

## R3
WHILE the overview state is `loading`, `error` or `unauthorized`, the system SHALL NOT render the
usage block.

## R4
WHILE the overview state is `ok`, the system SHALL render the existing overview content
(`progress_dashboard_view` R16–R39) with the same elements, attributes and text as before this
feature.

## R5
WHILE the overview state is `ok`, the system SHALL render the usage block after every existing
overview section, inside `[data-overview]`, including when `overall.total` is `0`.

## Block title and empty state

## R6
WHILE the overview state is `ok`, the system SHALL title the usage block with an `<h2>` reading
`Agent usage` that carries the classes `font-mono`, `text-label` and `uppercase`.

## R7
WHILE the usage data is empty usage, the system SHALL render inside the usage block a
`[data-usage-empty]` element reading `No agent runs recorded yet. Usage appears here once a harness
project syncs its agent runs to the mirror.`

## R8
WHILE the usage data is empty usage, the system SHALL NOT render `[data-usage-tokens]`,
`[data-usage-effort]`, `[data-usage-breakdown]` or `[data-usage-ranking]`.

## Total tokens card

## R9
WHILE the usage data is not empty usage, the system SHALL render a `[data-usage-tokens]` card showing
`tokens.total` in the compact format.

## R10
WHILE the usage data is not empty usage, the system SHALL render in the total tokens card each of
`tokens.input`, `cacheRead`, `cacheWrite`, `output` and `reasoning` in the compact format under the
keys `input`, `cache read`, `cache write`, `output` and `reasoning` respectively.

## Agent effort card

## R11
WHILE the usage data is not empty usage, the system SHALL render a `[data-usage-effort]` card showing
`effortSeconds` in the duration format.

## R12
WHILE the usage data is not empty usage, the system SHALL render in the agent effort card `runs` in
the compact format followed by ` runs` (or ` run` when `runs` is `1`).

## R13
WHILE the usage data is not empty usage, the system SHALL render in the agent effort card the note
`Adds up every run's duration, so overlapping runs each count in full.`

## Breakdown

## R14
WHILE the usage data is not empty usage, the system SHALL render inside `[data-usage-breakdown]`
exactly two `[data-usage-runtime]` rows, `claude` first and `codex` second, each showing the runtime
name, its `tokens.total` in the compact format and its `runs` in the compact format.

## R15
WHERE the sum of both runtimes' `tokens.total` is greater than `0`, the system SHALL render in
`[data-usage-split]` one `[data-usage-split-segment]` per runtime whose `tokens.total` is greater
than `0`, with an inline `width` equal to its runtime share.

## R16
IF the sum of both runtimes' `tokens.total` is `0` THEN the system SHALL render `[data-usage-split]`
with no `[data-usage-split-segment]`.

## R17
WHILE the usage data is not empty usage and `byModel` has at most 8 elements, the system SHALL pass
the model chart one data point per `byModel` element, in response order, named by its model label
with `value` equal to its `tokens.total`.

## R18
IF `byModel` has more than 8 elements THEN the system SHALL pass the model chart the first 7
elements as in R17 followed by one data point named `Other (<n> models)`, where `<n>` is the number
of remaining elements, with `value` equal to the sum of their `tokens.total`.

## R19
WHILE the usage data is not empty usage and `byModel` is empty, the system SHALL render inside
`[data-usage-models]` the text `No model recorded for any run.` and no model chart.

## R20
WHEN the model chart emits `select`, the system SHALL NOT navigate.

## Ranking

## R21
WHILE the usage data is not empty usage, the system SHALL title `[data-usage-ranking]` with an `<h3>`
reading `Top 10 projects by tokens`.

## R22
WHILE the usage data is not empty usage, the system SHALL pass the ranking chart one data point per
`topProjects` element, in response order, named by its `slug` with `value` equal to its
`tokens.total`.

## R23
WHILE the usage data is not empty usage, the system SHALL render one `[data-usage-rank]` list item
per `topProjects` element, in response order, showing its 1-based rank, its `slug`, its
`tokens.total` in the compact format and its `effortSeconds` in the duration format.

## R24
The system SHALL render each ranking item's `slug` as a link whose `href` is `/projects/<slug>`.

## R25
WHEN the ranking chart emits `select` for a data point whose name is a `topProjects` slug, the
system SHALL navigate to `/projects/<slug>`.

## R26
IF the ranking chart emits `select` for a name that is not a `topProjects` slug THEN the system
SHALL NOT navigate.

## Number formatting

## R27
The system SHALL wrap every token or run count it renders in the compact format inside the usage
block in a `<data>` element whose `value` attribute is the exact integer and whose `title` attribute
is the exact format followed by ` tokens` (token counts) or ` runs` (run counts).

## R28
The system SHALL render every duration it shows in the duration format inside the usage block with a
`title` attribute equal to `formatExactSeconds` of the raw seconds value.

## R29
The system SHALL format the value axis ticks of the model chart and the ranking chart with the
compact format.

## R30
The system SHALL render the tooltip of a model chart or ranking chart data point as its name and its
value in the exact format followed by ` tokens`.

## Visual and layout

## R31
The system SHALL set `animations` to `false` on the model chart and the ranking chart.

## R32
The system SHALL render every slug, model label, runtime name, count and duration in the usage block
in `font-mono`, and the R7 and R13 prose in `font-sans`.

## R33
WHILE the viewport is 360 px wide, the system SHALL render the dashboard at `/`, populated with usage
data holding 10 ranking entries and a model label and a slug each longer than the viewport, without
making the document horizontally scrollable.

## R34
The system SHALL NOT render any `[data-beacon]` element or any element with an `animate-*` class
inside the usage block.
