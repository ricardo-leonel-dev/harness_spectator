# Review — feature 10 dashboard_agent_usage_cards (reopened, session 28, re-review)

**Verdict:** APPROVED

Scope: the uncommitted `git diff` against `f913cbf` in
`src/app/dashboard/dashboard-agent-usage.component.ts` and `.spec.ts`. The previous pass on this session
returned CHANGES_REQUESTED: when there were no segments, the split labels rendered `0%`, which violated
`design.md` line 237 ("hidden when `[]`"), and the R16 test asserted that deviation.

## Checkpoints

- C1: [x] — `./init.sh` exits 0, headless (see Verification).
- C2: [x] — Only feature 10 is `in_progress`. Session 28 reflects the current reopen work.
- C3: [x] — The split row now matches design.md lines 236–238. The `flex items-center gap-2` row and the
  `[data-usage-split]` track render unconditionally. Each share label sits in its own
  `@if (splitSegments().length > 0)`, so both labels are hidden when the segment list is `[]`. The
  palette classes are unchanged. No new dependency.
- C4: [x] — `renders an empty split track when both runtimes have zero tokens` uses `bucket()`, whose
  default `tokens.total` is 0 for both runtimes. It asserts that the track is truthy, that it has 0
  `[data-usage-split-segment]`, and that both `[data-usage-split-claude]` and `[data-usage-split-codex]` are
  `null`. The `'0%'` assertions are gone. The suite passes.
- C5: [ ] — Pending by design: the implementer closes the session with `log-out` after this approval. The
  diff adds no stray files. `progress/impl_dashboard_agent_usage_cards_fix.md` is the handoff.
- C6: [x] — I re-checked R15, R16 and R19 against the requirement text and the test assertions. Every other
  `R<n>` behavior was unaffected by this revision.

## What changed since my last pass

Only the split-row template changed: the two label spans are now wrapped in `@if` and the track is
unconditional. I also changed the R16 test's label assertions. The rest of the diff is byte-identical
to what I verified last pass:
- the R19 container,
- the removal of `modelColors`/`rankingColors`/`[customColors]` (the schemes still use
  `domain: [USAGE_CHART_COLORS.*]`),
- `runsLabel` inside the runtime `<data>` (R14/R27 intact),
- `splitPercent` with its boundary logic and tests.

My earlier reasoning still applies to those parts. The test suite itself was rerun in full this pass.

## "No expectations" Karma warning

`WARN: Spec 'DashboardPageComponent process log requests the agent usage once for the selected feature and
none without a selection (R3, R4, R6)' has no expectations.`

This is pre-existing and not from this feature. `git log -L` attributes the test to `2e4aa89
feat(dashboard): show per-feature agent usage panel` (feature 9). The test asserts only through
`httpTesting.expectOne`/`expectNone`. Those calls throw on mismatch, but Jasmine does not count them as
expectations. This is a cosmetic warning for feature 9, not a gap in feature 10. Adding an `expect(...)`
there would be a separate follow-up.

The R33 test added by this feature (`renders a populated agent usage block at 360px with no horizontal
scroll`, `dashboard-page.component.spec.ts` ~line 1415) has real assertions:
- `app-dashboard-agent-usage` is truthy;
- `clientWidth` is 360;
- `scrollWidth <= 360`;
- the block's `getBoundingClientRect().right <= 360`.

## Verification

- `./init.sh` (lint, build, then `npm run test -- --watch=false --browsers=ChromeHeadless`): exit 0,
  **TOTAL: 249 SUCCESS**, Chrome Headless only. No visible browser was opened.
- No PostgreSQL baseline applies, so ordinary green tests are required. All tests passed.
