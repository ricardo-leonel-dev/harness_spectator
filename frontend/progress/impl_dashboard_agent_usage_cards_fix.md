# Implementer handoff — dashboard_agent_usage_cards (reopened, session 28)

Outcome: these fixes make the code and tests match `specs/dashboard_agent_usage_cards/requirements.md` again. They also clean up the minor items the leader listed. The work is ready for review. I did not log out.

## Files changed
- `src/app/dashboard/dashboard-agent-usage.component.ts`
- `src/app/dashboard/dashboard-agent-usage.component.spec.ts`

Base revision: `f913cbf` (uncommitted working tree).

## Changes and requirement mapping

| Item | Code change | Test (spec.ts) |
|---|---|---|
| R16 | The `[data-usage-split]` track always renders. When the sum is 0 it has no segments. Each share label (`[data-usage-split-claude]` / `[data-usage-split-codex]`) has its own `@if (splitSegments().length > 0)`, so both are hidden when there are no segments, as `design.md` § Visual direction says ("hidden when `[]`"). | `renders an empty split track when both runtimes have zero tokens`: the track exists, it has 0 `[data-usage-split-segment]` children and both label elements are absent. |
| R19 | `[data-usage-models]` always renders. It contains either the chart or the `[data-usage-models-empty]` message. The fixed height is applied only when a chart is shown: the binding evaluates to `null` when `byModel` is empty, so no inline height is set. | `renders the no-model message when byModel is empty`: the container exists, its text is the message, it contains no `ngx-charts-bar-horizontal`, `style.height` is empty, and the only chart on the page is the ranking chart. |
| R15 (unchanged behavior) | None | `sizes split segments by token share and omits zero runtimes` still passes. |
| Cleanup 3 | Removed `modelColors()`/`rankingColors()` and their `[customColors]` bindings. Colors still come from the scheme `domain`. | New `colors each chart from its scheme domain`: model domain = `[USAGE_CHART_COLORS.model]`, ranking = `[USAGE_CHART_COLORS.ranking]`, `customColors` undefined. The existing `USAGE_CHART_COLORS` test in `progress-format.spec.ts` still passes. |
| Cleanup 4 / R14 | Runtime runs now read `{{ formatTokens(runs) }}{{ runsLabel(runs) }}`, kept inside the same `<data>` element, so its `value`/`title` from R27 are unchanged. | New `labels a runtime row with exactly one run as singular "run"`: 1 -> `1 run`, 2 -> `2 runs`. The existing `... runtime rows ...` test still asserts `1.2K runs`. |
| Cleanup 5 | `splitPercent` returns `0` when the runtime's share is absent or 0 and `100` when it is 100%. Otherwise `<1` below 1, `>99` above 99, and in the middle range claude = `round(claude)` and codex = `100 - round(claude)`. A visible segment never reads 0% or 100%, and the two labels add up to 100. | New `keeps split labels consistent with the visible segments`: 996/4 -> `>99%`/`<1%` with 2 segments; 505/495 -> `51%`/`49%` (independent rounding would give 51/50). |

There were no other changes. The visual change is limited to the zero-token case, which now shows an empty split track with no share labels. That is what R16 and `design.md` require.

## Revision 2 (after review: changes requested)
- Correction: the first version of this handoff said R16 required the `0%` labels. That was wrong. R16 only requires the track. `design.md` says the labels are hidden when `splitSegments()` is `[]`.
- Code: the two share-label spans are now each wrapped in `@if (splitSegments().length > 0)`. Nothing else changed.
- Test: the R16 test's two `'0%'` assertions are replaced with `toBeNull()` checks on both label selectors. The track and zero-segment assertions are unchanged.
- I logged the fix in session 28.
- I re-ran `./init.sh`: exit 0, **TOTAL: 249 SUCCESS**, ChromeHeadless only. The same two `tests/` `[WARN]` lines appeared. Karma also warned that a test in `DashboardPageComponent` ("process log requests the agent usage once ...") has no expectations. That test is in another file this fix does not touch.

## Verification
- `./init.sh` (verify_command = lint + build + `npm run test -- --watch=false --browsers=ChromeHeadless`): exit 0, **TOTAL: 249 SUCCESS**, 0 FAILED, headless only.
- Prettier was run on both files before `init.sh`.
- `init.sh` printed two non-fatal `[WARN]` lines (same as before this fix):
  - `[WARN] tests directory '.../frontend/tests' not found; skipping fingerprint lint`
  - `[WARN]  No tests/ directory; fingerprint lint skipped`
