# Requirements — feature_agent_usage_panel

Context: feature 7 (`feature_process_log_panel`) renders the selected feature's process log in
`app-process-log-card` on `/projects/:slug?feature=<name>`. The backend feature
`feature_agent_usage_api` (spectator_backend, done) adds
`GET {apiBaseUrl}/api/harness/projects/{slug}/features/{name}/agent-usage`. This feature adds an
Agent usage section to that card: the feature's agent invocation tree, per-run figures, and totals.

Out of scope: dashboard agent usage cards (feature 10, `dashboard_agent_usage_cards`), any change to
the log request or to the features table, client-side tree reconstruction, and charts.

Backend contract consumed (authoritative source: the backend code in `src/harness/reader.rs`,
`AgentUsageResponse` and `read_feature_agent_usage`; it matches the backend's
`specs/feature_agent_usage_api/design.md` § "Response contract (200)" on the wire):

- `200` → `{ runs: AgentRunNode[], totals: AgentUsageTotals }`. Every key is always present; nullable
  values are an explicit `null`. The server has already built the tree (`children`), ordered every
  list by run start, placed runs whose parent is not a run of this feature at the top level, and
  broken parent cycles.
- `404 {"error":"not found"}` for an unknown project or feature; `401 {"error":"unauthorized"}`
  without a valid token; `500 {"error":"internal error"}` on a database error.

Terms used below:

- **selected feature** — as defined in `specs/feature_process_log_panel/requirements.md`.
- **card** — `app-process-log-card`.
- **log state** — the card's existing `state` input (`ProcessLogState`).
- **usage section** — the new `[data-usage]` element inside the card.
- **usage request** — one `getFeatureAgentUsage(slug, name)` call.
- **run node** — one element of `runs` or of any `children` array in the response.
- **run item** — the `[data-run]` element rendered for one run node.
- **nesting level** — 0 for a run node in the top-level `runs` array, otherwise the nesting level of
  its parent plus 1.
- **interval of a run node** — `startedAt` to `finishedAt`, defined only when both are non-null and
  `Date.parse(finishedAt) >= Date.parse(startedAt)`.
- **feature span** — from the earliest interval start to the latest interval end over every run node
  that has an interval, at any nesting level.
- **blank** — `null`, or a string that is empty after trimming.
- **compact token format** — the output of `formatTokens` (R36, R37).
- **exact token format** — the output of `formatExactTokens` (R38).
- **duration format** — the output of `formatDuration` (R39).

## API

## R1
The system SHALL expose `HarnessApiService.getFeatureAgentUsage(slug, name)`, returning
`Observable<AgentUsageResponse>`, that sends `GET
{apiBaseUrl}/api/harness/projects/{slug}/features/{name}/agent-usage`.

## R2
WHEN `getFeatureAgentUsage` builds the request URL, the system SHALL encode `slug` and `name` each
with `encodeURIComponent`.

## Request lifecycle

## R3
WHEN the dashboard's URL is `/projects/<slug>?feature=<name>`, including on initial load or reload,
the system SHALL send exactly one usage request for that slug/name pair.

## R4
WHILE there is no selected feature, the system SHALL NOT send a usage request.

## R5
WHEN the slug or the selected feature changes while a usage request is in flight, the system SHALL
cancel the in-flight usage request.

## R6
WHEN the dashboard's URL selects a feature, the system SHALL send exactly one feature-log request
for that slug/name pair, independently of the usage request's progress or outcome.

## R7
IF the usage request fails WHILE the log state is `ok` THEN the system SHALL still render every
session of the loaded process log.

## Section placement and states

## R8
WHILE the log state is `ok`, the system SHALL render the usage section after the card's feature
header (`[data-log-header]`) and before the sessions block.

## R9
WHILE the log state is not `ok`, the system SHALL NOT render the usage section.

## R10
The system SHALL title the usage section with an `<h3>` reading `Agent usage` that carries the
classes `font-mono`, `text-label` and `uppercase`.

## R11
WHILE a usage request is in flight and the log state is `ok`, the system SHALL render, inside the
usage section, an element with `role="status"` reading `Loading agent usage…`.

## R12
IF the usage request fails with any status, including 401 and 404, THEN the system SHALL render,
inside the usage section, an element with `role="alert"` containing `[ERR]` and the error's
`message`, or `Failed to load agent usage.` when the error has no message.

## R13
WHEN a usage response has an empty `runs` array, the system SHALL render, inside the usage section,
the text `No agent runs recorded for this feature.` and no `[data-usage-totals]` element.

## Tree

## R14
WHEN a usage response loads, the system SHALL render exactly one run item per run node, with
`data-run` set to its `externalId`.

## R15
The system SHALL render each run item of a run node in `children` inside the run item of the run
node whose `children` array contains it.

## R16
The system SHALL set `data-level` on every run item to its nesting level.

## R17
The system SHALL render the run items of every list in the order the response lists them.

## R18
The system SHALL render, for each run item, its `role`, or the text `unknown` when `role` is blank.

## R19
The system SHALL render, for each run item, its `runtime`.

## R20
The system SHALL render, for each run item, its `label` when it is not blank, and omit the label
element otherwise.

## R21
The system SHALL render, for each run item, its `model` when it is not blank, and omit the model
element otherwise.

## R22
The system SHALL render, for each run item, its `durationSeconds` in the duration format, or `—`
when it is `null`.

## R23
The system SHALL render, for each run item, its `tokens.total` in the compact token format, or `—`
when it is `null`.

## R24
WHEN the system renders a non-null token count in the compact token format, the system SHALL wrap
it in a `<data>` element whose `value` attribute is the exact integer and whose `title` attribute is
the exact token format followed by ` tokens`.

## R25
IF a run node at nesting level 0 has a non-null `parentExternalId` THEN the system SHALL render a
`detached` tag in its run item whose `title` reads `Parent run <parentExternalId> is not part of
this feature's runs.`

## Timeline

## R26
WHERE a run node has an interval, the system SHALL render, in its run item, one `[data-run-span]`
segment whose inline `left` and `width` are the interval's start offset and length as percentages
of the feature span.

## R27
IF a run node has no interval THEN the system SHALL NOT render a `[data-run-span]` segment in its
run item.

## R28
IF the feature span has zero length THEN the system SHALL render every `[data-run-span]` segment
with `left: 0%` and `width: 100%`.

## R29
WHEN a usage response with at least one interval loads, the system SHALL render one
`[data-usage-strip]` element containing one segment per run node that has an interval, positioned
by the same rule as R26.

## Totals

## R30
WHEN a usage response with a non-empty `runs` array loads, the system SHALL render a
`[data-usage-totals]` block showing `totals.effortSeconds` in the duration format under the key
`agent effort`.

## R31
WHEN a usage response with a non-empty `runs` array loads, the system SHALL render in the totals
block `totals.unionSeconds` in the duration format under the key `wall time`.

## R32
WHEN a usage response with a non-empty `runs` array loads, the system SHALL render in the totals
block `totals.tokens.total` in the compact token format under the key `tokens`.

## R33
WHEN a usage response with a non-empty `runs` array loads, the system SHALL render in the totals
block each of `totals.tokens.input`, `cacheRead`, `cacheWrite`, `output` and `reasoning` in the
compact token format under the keys `input`, `cache read`, `cache write`, `output` and `reasoning`
respectively.

## R34
WHEN a usage response with a non-empty `runs` array loads, the system SHALL render in the totals
block the note `Agent effort adds up every run's duration. Wall time counts overlapping runs once.`

## R35
The system SHALL render the exact value of every duration shown in the duration format as the
element's `title` attribute, formed as the raw seconds value followed by ` s`.

## Formatting

## R36
The system SHALL make `formatTokens(n)` return `String(n)` for `n < 1000`, and otherwise `n` divided
by the largest unit of `k` (1 000), `M` (1 000 000) or `B` (1 000 000 000) not greater than `n`,
rounded half-up to one decimal, without a trailing `.0`, followed by the unit letter.

## R37
IF rounding in `formatTokens` yields `1000` of a unit below `B` THEN the system SHALL return the
value expressed in the next larger unit instead (for example `999950` → `1M`).

## R38
The system SHALL make `formatExactTokens(n)` return `n` with `en-US` thousands separators (for
example `1234567` → `1,234,567`).

## R39
The system SHALL make `formatDuration(s)` return, with `r` = `s` rounded to the nearest integer:
`<1s` when `s > 0` and `r === 0`; `<r>s` when `r < 60`; `<m>m <ss>s` with two-digit seconds when
`r < 3600`; and `<h>h <mm>m` with two-digit minutes otherwise.

## Visual and layout

## R40
The system SHALL render `role`, `runtime`, `model`, the `detached` tag, every duration and every
token count in `font-mono`, and every `label` and the R34 note in `font-sans`.

## R41
WHILE the viewport is 360 px wide, the system SHALL render the card, populated with a usage tree
nested four levels deep and unbroken values longer than the viewport, without making the document
horizontally scrollable.

## R42
The system SHALL render the top-level run list inside an element with `tabindex="0"` and
`aria-label="Agent runs of <name>"`, where `<name>` is the loaded feature's `name`.

## R43
The system SHALL give every animated element inside the usage section the class
`motion-reduce:animate-none`.

## R44
The system SHALL NOT render any `[data-beacon]` element inside the usage section.

## Preservation

## R45
WHILE the log state is `idle`, `loading`, `not-found` or `error`, the system SHALL render the card
with the same content that `feature_process_log_panel` R19–R22 specify.
