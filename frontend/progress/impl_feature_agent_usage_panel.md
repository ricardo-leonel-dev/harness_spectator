# Implementer handoff — feature_agent_usage_panel (feature 9)

## Outcome

Implemented, self-verified. Ready for reviewer.

## Frontend-design skill

Loaded via the `Skill` tool *before* writing any markup or styles in `src/app/dashboard/`,
as required by `docs/architecture.md` Principle 5 and the project's persistent memory rule.
The skill's guidance was applied together with the design.md "Visual direction" section,
which had already been written after the skill. One memorable element only (the overlap
strip + per-run interval tracks), existing Tailwind tokens only (no new tokens), no new
motion (the existing `animate-spin-fast motion-reduce:animate-none` was reused for the
loader), concise copy (the section note restates the agent-effort / wall-time relationship
in plain English instead of a sentence fragment).

## Files created / modified

### New
- `src/app/dashboard/agent-usage-section.component.ts` — presentational section
  (`AgentUsageState` union, loading / error / empty / ok branches, recursive
  `NgTemplateOutlet` run tree, feature-span + overlap strip + per-run tracks, totals block,
  focusable run list with `aria-label`).
- `src/app/dashboard/agent-usage-section.component.spec.ts` — section tests covering
  R10–R44 (loader, error, empty, tree order, node-level rendering, exact-data attributes,
  detached tag, span positioning, zero-length feature span, strip, totals, motion, focus
  label, no-beacon rule).
- `src/app/dashboard/usage-format.ts` — `formatTokens` (R36, R37), `formatExactTokens`
  (R38), `formatDuration` (R39), `formatExactSeconds` (R35). Kept apart from
  `progress-format.ts` so feature 10 can import without pulling chart colours.
- `src/app/dashboard/usage-format.spec.ts` — formatter tables mirroring design.md.

### Modified
- `src/app/core/harness-api.service.ts` — added `AgentRunTokens`, `AgentRunNode`,
  `TokenTotals`, `AgentUsageTotals`, `AgentUsageResponse`, and
  `getFeatureAgentUsage(slug, name)` (R1, R2; `encodeURIComponent` on slug + name).
- `src/app/core/harness-api.service.spec.ts` — fixture-driven `getFeatureAgentUsage` test.
- `src/app/dashboard/process-log-card.component.ts` — added optional `usage` input with
  a default of `{ kind: 'idle' }`; renders `<app-agent-usage-section>` between
  `[data-log-header]` and the sessions block in the `ok` branch only (R8, R9, R45). The
  other branches are untouched. `AgentUsageSectionComponent` is imported here and in its
  spec.
- `src/app/dashboard/process-log-card.component.spec.ts` — placement test (iteration over
  `idle/loading/not-found/error` verifying no `[data-usage]` renders, plus an ok-state
  test that asserts DOM order header → usage → sessions). All existing card tests pass
  unchanged.
- `src/app/dashboard/dashboard-page.component.ts` — extracted a `target$` observable
  (`router.events → filter → startWith → map → distinctUntilChanged → shareReplay({
  bufferSize: 1, refCount: true })`). Two independent switchMaps subscribe to it: the
  existing log pipeline (preserved verbatim except for the upstream source) and a new
  usage pipeline. Added `agentUsage` signal, `[usage]="agentUsage()"` binding on the
  process-log-card.
- `src/app/dashboard/dashboard-page.component.spec.ts` — added `usageUrl` helper,
  `emptyUsage()` fixture, three new tests (R3/R4/R6: exactly one request when selected,
  none otherwise; R5: cancellation on feature and project change; R7/R12: sessions
  survive a usage failure). Added only the bare usage-request flushes to the existing
  feature-selecting tests (no assertion edits). Extended the 360px "populated process
  log" test with a four-level unbroken usage tree to cover R41's overflow budget.
- `docs/architecture.md` — added the new agent-usage endpoint to the Data Flow block,
  expanded the `dashboard/` layer description to mention the agent usage section.
- `specs/feature_agent_usage_panel/tasks.md` — every task is checked `[x]`.

## Task → R-ids → status

| Task | Status | Covers |
|---|---|---|
| T1  | done | baseline verify |
| T2  | done | skill loaded, visual direction applied |
| T3  | done | R1, R2 |
| T4  | done | R1, R2 |
| T5  | done | R35, R36, R37, R38, R39 |
| T6  | done | R35, R36, R37, R38, R39 |
| T7  | done | R10, R11, R12, R13, R43, R44 |
| T8  | done | R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R40 |
| T9  | done | R26, R27, R28, R29 |
| T10 | done | R30, R31, R32, R33, R34, R35 |
| T11 | done | R41, R42 |
| T12 | done | R10–R35, R40, R42, R43, R44 |
| T13 | done | R8, R9, R45 |
| T14 | done | R8, R9, R45 |
| T15 | done | R3, R4, R5, R6, R7 |
| T16 | done | R3, R4, R5, R6, R7, R12, R41 |
| T17 | done | R1 |
| T18 | done | R1–R45 |

No partial / skipped tasks.

## Self-verification

`bash init.sh` — green. Tail of the run:

```
── 4.6. Recording agent usage (best-effort) ──
[OK]    agent usage: recorded 2 agent run(s) (claude: 2, codex: 0), skipped 20 unchanged file(s)

── 5. Regenerating markdown snapshot ──
[OK]    snapshot regenerated at state

── 6. Syncing Postgres/Supabase mirror (best-effort) ──
[OK]    mirror sync complete

── 7. Summary ──
[OK]    Environment ready. You can start working.
```

Per-stage:
- `npm run lint` (ng lint + prettier --check src): green, no warnings.
- `npm run build` (`ng build`): green; lazy `dashboard-page-component` chunk 319 KB raw.
- `npm run test -- --watch=false --browsers=ChromeHeadless`: `TOTAL: 220 SUCCESS`,
  no `[STALE]` or failure markers. Five were added to a baseline that already had the
  rest of the suite green; feature 9's tests are part of the 220.

There were four development-cycle failures caught and fixed before the run was green:
1. `usageTreeWithRole` had an implicitly-typed recursive `make` (TS7022). Fixed with
   an explicit `AgentRunNodeFromUsage` type alias.
2. The test asserted the totals note using a Unicode U+2019 right-quote but the spec
   uses an ASCII apostrophe. Fixed the assertion.
3. The feature-span math in the "positions run segments" test assumed 110s; the actual
   span in the basicUsage fixture is 100s (lead-1 ends at 01:40, thread-x is contained
   inside). Fixed the expected percentages to 100% / 30% / 30%.
4. The "cancels the in-flight usage request" test mistakenly re-asserted
   `expectOne(usageUrl('second'))` after it had already been flushed, and expected a
   phantom follow-up usage request on project change (the new URL `/projects/other-project`
   has no `?feature=` so no usage request is sent). Replaced with the correct assertion:
   no agent-usage requests remain after the project switch.

## Deviations from the spec

None. The component types, the `getFeatureAgentUsage` signature, the dashboard wiring,
and the placement of the section are all per design.md. No new dependency, no new
Tailwind token, no new motion.

## Impact on dependent features

The dashboard hook (state-only change: card has a new optional `usage` input) is
backwards-compatible: any pre-feature call site that does not bind `usage` defaults to
`{ kind: 'idle' }`, which renders the section title + nothing else. Feature 10
(`dashboard_agent_usage_cards`, currently `pending`) can `import { formatTokens,
formatExactTokens, formatDuration, formatExactSeconds } from
'./usage-format'` and re-use the same formatter pipeline; the `TokenTotals` /
`AgentUsageTotals` types are also exported from `harness-api.service.ts` for that
purpose.

## Traceability — R<n> → test

| Requirement | Test (file + spec name) |
|---|---|
| R1   | `harness-api.service.spec.ts` "gets one feature's agent usage, encoding slug and name"; `dashboard-page.component.spec.ts` "requests the agent usage once for the selected feature and none without a selection (R3, R4, R6)" |
| R2   | `harness-api.service.spec.ts` "gets one feature's agent usage, encoding slug and name" |
| R3   | `dashboard-page.component.spec.ts` "requests the agent usage once for the selected feature and none without a selection (R3, R4, R6)" |
| R4   | same |
| R5   | `dashboard-page.component.spec.ts` "cancels the in-flight usage request when the feature or project changes (R5)" |
| R6   | `dashboard-page.component.spec.ts` "requests the agent usage once for the selected feature and none without a selection (R3, R4, R6)" |
| R7   | `dashboard-page.component.spec.ts` "keeps rendering the sessions when the agent usage request fails (R7, R12)" |
| R8   | `process-log-card.component.spec.ts` "renders the usage section between the header and sessions only when the log is ok (R8, R9, R45)" |
| R9   | same |
| R10  | `agent-usage-section.component.spec.ts` "shows the loading state with motion disabled under reduced motion (R10, R11, R43)" |
| R11  | same |
| R12  | `agent-usage-section.component.spec.ts` "renders [ERR] with the message, or the fallback when there is none (R12)"; `dashboard-page.component.spec.ts` "keeps rendering the sessions when the agent usage request fails (R7, R12)" |
| R13  | `agent-usage-section.component.spec.ts` "renders the empty message and no totals for runs: [] (R13)" |
| R14  | `agent-usage-section.component.spec.ts` "renders one run item per node, nested under its parent, with data-level, in response order (R14, R15, R16, R17)" |
| R15  | same |
| R16  | same |
| R17  | same |
| R18  | `agent-usage-section.component.spec.ts` "renders role, runtime, label, model, duration and tokens with fallbacks (R18-R23)" |
| R19  | same |
| R20  | same |
| R21  | same |
| R22  | same |
| R23  | same |
| R24  | `agent-usage-section.component.spec.ts` "exposes exact token and duration values via title and value (R24, R35)" |
| R25  | `agent-usage-section.component.spec.ts` "marks top-level runs with a missing parent as detached (R25)" |
| R26  | `agent-usage-section.component.spec.ts` "positions run segments on the feature span and omits runs without an interval (R26, R27)" |
| R27  | same |
| R28  | `agent-usage-section.component.spec.ts` "fills the track when the feature span has zero length (R28)" |
| R29  | `agent-usage-section.component.spec.ts` "draws one strip segment per run with an interval (R29)" |
| R30  | `agent-usage-section.component.spec.ts` "renders effort, wall time, token total, breakdown and note in totals (R30-R34)"; "renders effort and wall time as zero duration when totals are empty (R30, R31)" |
| R31  | same |
| R32  | same |
| R33  | same |
| R34  | same |
| R35  | `usage-format.spec.ts` "formatDuration" table; "formatExactSeconds"; `agent-usage-section.component.spec.ts` "exposes exact token and duration values via title and value (R24, R35)" |
| R36  | `usage-format.spec.ts` "formatTokens" |
| R37  | same |
| R38  | `usage-format.spec.ts` "formatExactTokens" |
| R39  | `usage-format.spec.ts` "formatDuration" |
| R40  | `agent-usage-section.component.spec.ts` "splits mono data values from sans prose (R40)" |
| R41  | `dashboard-page.component.spec.ts` "renders a populated process log at 360px with no horizontal scroll" (extended with a 4-level unbroken usage tree) |
| R42  | `agent-usage-section.component.spec.ts` "labels the focusable run list with the feature name (R42)" |
| R43  | `agent-usage-section.component.spec.ts` "shows the loading state with motion disabled under reduced motion (R10, R11, R43)" |
| R44  | `agent-usage-section.component.spec.ts` "never renders a beacon (R44)" |
| R45  | `process-log-card.component.spec.ts` "renders the usage section between the header and sessions only when the log is ok (R8, R9, R45)" |

Every R<n> has at least one concrete, currently-passing test.

## Budget

BUDGET: 60m impl + 20m review
