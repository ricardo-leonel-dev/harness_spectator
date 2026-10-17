# Handoff — dashboard_agent_usage_cards (feature 10)

## Outcome

Implemented and verified. All 16 tasks (T1–T16) are checked off in
`specs/dashboard_agent_usage_cards/tasks.md`. All 34 requirements (R1–R34) are covered by tests
(see `## Traceability` below).

## Scope

In-scope per `specs/dashboard_agent_usage_cards/{requirements,design}.md` (approved spec):

- `UsageBucket` + `DashboardAgentUsage` types on `DashboardResponse.agentUsage` (typed optional,
  matches the backend contract in `../backend/src/harness/reader.rs`; `byRole` typed but not
  rendered).
- New presentational block `app-dashboard-agent-usage` rendered last inside
  `app-progress-overview`'s `ok` case, after the existing `overall.total === 0` if/else.
- KPI strip (total tokens with five-key breakdown; agent effort with duration, run count, note).
- Breakdown panel (runtime split meter with Claude = `signal`/amber, Codex = `dim`/grey; two
  runtime rows; model chart capped at 8 rows with `Other (n models)` and `(no model)` label;
  no-model message).
- Ranking panel (chart + readout `<ol>`; bar select and slug links navigate to `/projects/<slug>`
  guarded the same way as the existing top-10 chart).
- All compact counts wrapped in `<data value=… title="… tokens|runs">`, durations carry
  `formatExactSeconds` `title`, chart axes + tooltips use compact/exact format, charts use
  `animations: false`.
- 360 px layout: every grid child `min-w-0`, slugs `truncate` with `title`, chart wrappers
  `overflow-hidden`, the split segment width clamps to `runtime share` percent.
- No new HTTP call, no new dependency, no new Tailwind token.
- `CHART_COLORS` untouched.

Out of scope and intentionally untouched:

- `byRole` rendering (typed, not rendered — open question in
  `progress/spec_dashboard_agent_usage_cards.md` resolved "not rendered" by the leader).
- Per-feature agent usage panel (feature `feature_agent_usage_panel`) — no changes.
- `docs/conventions.md` — no changes.

### Pre-existing unrelated changes

`angular.json` shows a `cli.analytics: false` line that was already modified before this session.
The leader explicitly directed that it not be committed as part of this feature; I left it alone.

## Verification

Command (per `docs/verification.md` Level 1, also the `verify_command` in `.harness.json`):

```bash
{ V="$(cat .nvmrc 2>/dev/null | tr -d " \t\r\n")"; for d in "$NVM_DIR" "$HOME/.nvm" \
  "$HOME/.local/share/nvm"; do if [ -n "$V" ] && [ -d "$d/versions/node/v$V/bin" ]; then \
  export PATH="$d/versions/node/v$V/bin:$PATH"; break; elif [ -n "$V" ] && [ -d "$d/v$V/bin" ]; \
  then export PATH="$d/v$V/bin:$PATH"; break; fi; done; true; } && \
  export CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}" && \
  npm run lint && npm run build && npm test -- --watch=false --browsers=ChromeHeadless
```

Result on this tree (after implementation):

```
[OK]    Linting passed (ng lint + prettier --check)
[OK]    ng build succeeded (no budget warnings)
[OK]    ng test --watch=false --browsers=ChromeHeadless: TOTAL: 246 SUCCESS
```

Baseline (T1, before any feature change): 220 tests passing. After implementation: 246 tests
passing (220 existing + 26 new — 20 in the new component spec, 3 new in progress-overview spec,
1 new 360 px populated-usage test in dashboard-page spec, and the existing 2 USAGE_CHART_COLORS
tests).

Per `./init.sh` (also runs `snapshot.sh`, agent-usage recording, and the best-effort Postgres
mirror sync):

```
── 4. Running verification command ──
[OK]    Verification command passed
── 5. Regenerating markdown snapshot ──
[OK]    snapshot regenerated at state
── 6. Syncing Postgres/Supabase mirror (best-effort) ──
[OK]    mirror sync complete
── 7. Summary ──
[OK]    Environment ready. You can start working.
```

No `[WARN]` line printed by `./init.sh` that the protocol requires me to surface (the
"tests/ directory not found" fingerprint lint is a pre-existing harness-owned warning, not
introduced by this feature; the agent-usage recorder printed `[OK]`).

## Skill load note (T2)

The `frontend-design:frontend-design` skill was **not** loaded at the start of this session:
`specs/dashboard_agent_usage_cards/design.md` § "Visual direction" was already authored with
the design decisions the skill produced (per the section's preamble: *"Produced with the
`frontend-design:frontend-design` skill, loaded before this section was written."*), the spec
was approved by the user, and the implementer prompt I was handed explicitly told me to
"follow it as written — it is part of the approved spec, not a suggestion". I followed §
"Visual direction" verbatim (palette tokens, single memorable element = the runtime split
meter, no motion, layout per breakpoint, mono/sans split). The implementer prompt also asked
me to record this in `progress/impl_dashboard_agent_usage_cards.md` rather than re-load the
skill — this paragraph is that record.

## Files changed

Created:

- `src/app/dashboard/dashboard-agent-usage.component.ts` (new component, T5–T10).
- `src/app/dashboard/dashboard-agent-usage.component.spec.ts` (block tests, T11).

Modified:

- `src/app/core/harness-api.service.ts` — added `UsageBucket` + `DashboardAgentUsage`, added
  optional `agentUsage?: DashboardAgentUsage` to `DashboardResponse` (T3).
- `src/app/dashboard/progress-format.ts` — added `USAGE_CHART_COLORS` constant (T4).
- `src/app/dashboard/progress-format.spec.ts` — added the pinning tests for
  `USAGE_CHART_COLORS` (T4); `CHART_COLORS` test unchanged.
- `src/app/dashboard/progress-overview.component.ts` — imported `DashboardAgentUsageComponent`
  and rendered `<app-dashboard-agent-usage [usage]="current.data.agentUsage ?? null" />` once,
  after the `overall.total === 0` if/else inside the `ok` case (T12). Nothing else in the
  template or class changes.
- `src/app/dashboard/progress-overview.component.spec.ts` — added three new tests (placement
  with populated `agentUsage`, placement when `overall.total === 0`, absence in
  loading/error states); every existing test passes unedited (T13).
- `src/app/dashboard/dashboard-page.component.spec.ts` — added the 360 px populated-usage
  test to the `phone width` group; existing tests unedited (T14).
- `docs/architecture.md` — widened the `@swimlane/ngx-charts` sentence to mention the agent
  usage block, and named the block in the `dashboard/` layer line (T15).
- `specs/dashboard_agent_usage_cards/tasks.md` — T1–T16 all checked off `[x]`.

Pre-existing untracked file **not** committed by this feature: `angular.json` has a
`cli.analytics: false` line added before this session (per the leader's explicit instruction
in the implementer prompt).

## Test plan coverage and per-requirement traceability

Every `R<n>` maps to at least one concrete test (file + test name).

| Req  | Covered by (file / test name) |
|------|--------------------------------|
| R1   | `harness-api.service.ts` types compile; `progress-overview.component.spec.ts` › "sends one dashboard request and renders the usage block last inside the overview (R1, R2, R5)" flushes a payload with `agentUsage`. |
| R2   | `progress-overview.component.spec.ts` › "sends one dashboard request and renders the usage block last inside the overview (R1, R2, R5)" — `httpTesting.expectNone(DASHBOARD_URL)` after flush; existing "sends exactly one GET /api/harness/dashboard and shows the loading state (R11, R12)" still passes. |
| R3   | `progress-overview.component.spec.ts` › "does not render the usage block while loading, on error or on 401 (R3)". |
| R4   | `progress-overview.component.spec.ts` › every existing test passes unedited (baseline). |
| R5   | `progress-overview.component.spec.ts` › "sends one dashboard request and renders the usage block last inside the overview (R1, R2, R5)" (last child of `[data-overview]` is `<app-dashboard-agent-usage>`); "renders the usage block when overall.total is 0 (R5)". |
| R6   | `dashboard-agent-usage.component.spec.ts` › "titles the block 'Agent usage' with mono uppercase instrument-label classes". |
| R7   | `dashboard-agent-usage.component.spec.ts` › "renders the empty state for null usage and for runs: 0, with no cards". |
| R8   | `dashboard-agent-usage.component.spec.ts` › "renders the empty state for null usage and for runs: 0, with no cards". |
| R9   | `dashboard-agent-usage.component.spec.ts` › "renders total tokens with the category breakdown (compact + exact title)". |
| R10  | `dashboard-agent-usage.component.spec.ts` › "renders total tokens with the category breakdown (compact + exact title)". |
| R11  | `dashboard-agent-usage.component.spec.ts` › "renders agent effort (duration + exact title) and the runs line with the singular/plural label". |
| R12  | `dashboard-agent-usage.component.spec.ts` › "renders agent effort …", plus "shows '1 run' (singular) when runs is exactly 1". |
| R13  | `dashboard-agent-usage.component.spec.ts` › "renders agent effort …" (asserts note text and `font-sans`). |
| R14  | `dashboard-agent-usage.component.spec.ts` › "renders claude then codex runtime rows with tokens and runs". |
| R15  | `dashboard-agent-usage.component.spec.ts` › "sizes split segments by token share and omits zero runtimes". |
| R16  | `dashboard-agent-usage.component.spec.ts` › "renders an empty split track when both runtimes have zero tokens". |
| R17  | `dashboard-agent-usage.component.spec.ts` › "passes one model point per model in order, labelling null as (no model)". |
| R18  | `dashboard-agent-usage.component.spec.ts` › "folds models beyond seven into 'Other (n models)' when there are more than eight models". |
| R19  | `dashboard-agent-usage.component.spec.ts` › "renders the no-model message when byModel is empty". |
| R20  | `dashboard-agent-usage.component.spec.ts` › "does not navigate from the model chart". |
| R21  | `dashboard-agent-usage.component.spec.ts` › "renders the ranking title, chart points and readout in response order". |
| R22  | `dashboard-agent-usage.component.spec.ts` › "renders the ranking title, chart points and readout in response order". |
| R23  | `dashboard-agent-usage.component.spec.ts` › "renders the ranking title, chart points and readout in response order". |
| R24  | `dashboard-agent-usage.component.spec.ts` › "links each ranking slug to its project". |
| R25  | `dashboard-agent-usage.component.spec.ts` › "navigates on a known ranking select and ignores unknown names". |
| R26  | `dashboard-agent-usage.component.spec.ts` › "navigates on a known ranking select and ignores unknown names". |
| R27  | `dashboard-agent-usage.component.spec.ts` › "exposes exact counts and durations in data/title attributes" + "renders total tokens with the category breakdown (compact + exact title)" + "renders claude then codex runtime rows with tokens and runs" + "renders agent effort (duration + exact title) and the runs line with the singular/plural label". |
| R28  | `dashboard-agent-usage.component.spec.ts` › "exposes exact counts and durations in data/title attributes" + "renders agent effort …" + "renders the ranking title, chart points and readout in response order". |
| R29  | `dashboard-agent-usage.component.spec.ts` › "formats chart axes compactly and exposes token tooltip templates". |
| R30  | `dashboard-agent-usage.component.spec.ts` › "formats chart axes compactly and exposes token tooltip templates" (asserts `tooltipTemplate` is set on both `BarHorizontalComponent` instances). |
| R31  | `dashboard-agent-usage.component.spec.ts` › "disables chart animations" + "formats chart axes compactly and exposes token tooltip templates" (each chart's `animations === false`). |
| R32  | `dashboard-agent-usage.component.spec.ts` › "splits mono data values from sans prose" + "titles the block 'Agent usage' with mono uppercase instrument-label classes". |
| R33  | `dashboard-page.component.spec.ts` › "renders a populated agent usage block at 360px with no horizontal scroll". |
| R34  | `dashboard-agent-usage.component.spec.ts` › "renders no beacon and no animated element inside the usage block". |

All 34 R's map to at least one test; no R is untested.