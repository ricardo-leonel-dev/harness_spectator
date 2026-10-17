# Spec summary — dashboard_agent_usage_cards (feature 10)

Spec: `specs/dashboard_agent_usage_cards/{requirements,design,tasks}.md`. 34 requirements (R1–R34),
16 tasks (T1–T16), every R covered by at least one T.

Directory name: `specs/dashboard_agent_usage_cards/` (the feature's exact `name`, which
`claim`/`mark-spec-ready`/`init.sh` use to find it), not `specs/feature_dashboard_agent_usage_cards/`
as the brief said.

## Key decisions
- Contract comes from `../backend/src/harness/reader.rs` (`DashboardAgentUsage`, `UsageBucket`,
  `RuntimeBreakdown`, `ModelUsage`, `ProjectUsage`, merged in 650421f). The flattened buckets are
  typed as `UsageBucket & {model|role|slug}`. Reuses feature 9's `TokenTotals` and `usage-format.ts`
  unchanged.
- No new HTTP call. The usage block reads `agentUsage` from the dashboard response
  `app-progress-overview` already loads. New presentational child `app-dashboard-agent-usage`,
  rendered last inside the overview's `ok` state (also when `overall.total === 0`).
- `agentUsage` is typed as optional, so existing `DashboardResponse` test fixtures still compile and
  stay unedited (the preservation baseline), and an older backend still works. Absent or
  `runs === 0` shows the explicit empty state.
- Cards: total tokens (compact, plus input/cache read/cache write/output/reasoning) and agent effort
  (duration, run count, plus a note that overlapping runs each count in full).
- Breakdown: a hand-built runtime split meter (claude = signal amber, codex = dim grey), which is the
  block's one memorable element, plus an ngx-charts horizontal bar of tokens by model, capped at 8
  rows (7 + `Other (n models)`), with a null model shown as `(no model)`.
- Ranking: an ngx-charts horizontal bar plus a readout `<ol>`. Bar select and slug links go to
  `/projects/<slug>`, guarded the same way as the existing top-10 chart.
- ngx-charts is currently allowlisted "only by the overview". T15 widens that sentence in
  docs/architecture.md to cover this child.
- frontend-design skill loaded for the Visual direction section.

## Open questions for the human
1. Should `byRole` be rendered? It is typed but not rendered now.
2. Should the block hide when `overall.total === 0`? Right now it renders, because runs can exist
   without registered features.
3. Is 8 rows the right cap for the model chart?
4. Are the runtime colours OK (Claude amber, Codex grey)?
