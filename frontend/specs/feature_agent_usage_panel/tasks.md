# Tasks — feature_agent_usage_panel

Ordered; check off `[x]` as completed. See `design.md` for signatures, class strings, copy and the
test each task refers to. The `R<n>` → test mapping goes in
`progress/impl_feature_agent_usage_panel.md` under `## Traceability` (`docs/specs.md`).

## Baseline and design

- [x] T1 Run the verify command (`docs/verification.md` Level 1) on the untouched tree and confirm
      exit 0, so later failures are attributable to this feature.
- [x] T2 (R8, R10, R40, R41, R42, R43, R44) Before writing or changing any markup or styles under
      `src/app/dashboard/`, load the `frontend-design:frontend-design` skill with the Skill tool and
      follow it together with `design.md` § "Visual direction" (existing tokens only, the overlap
      strip as the single memorable element, no new motion). Record in
      `progress/impl_feature_agent_usage_panel.md` that it was loaded and when. If the skill is not
      available in the session, stop and report it as a blocker instead of styling without it.

## API and formatters

- [x] T3 (R1, R2) Add `AgentRunTokens`, `AgentRunNode`, `TokenTotals`, `AgentUsageTotals`,
      `AgentUsageResponse` and `getFeatureAgentUsage(slug, name)` to
      `src/app/core/harness-api.service.ts`.
- [x] T4 (R1, R2) Add the `getFeatureAgentUsage` test to `harness-api.service.spec.ts`.
- [x] T5 (R35, R36, R37, R38, R39) Create `src/app/dashboard/usage-format.ts` with
      `formatTokens`, `formatExactTokens`, `formatDuration` and `formatExactSeconds`.
- [x] T6 (R35, R36, R37, R38, R39) Create `usage-format.spec.ts` with the formatter tables from
      `design.md`.

## Section component

- [x] T7 (R10, R11, R12, R13, R43, R44) Create `agent-usage-section.component.ts` with the exported
      `AgentUsageState` union, the titled section and the loading/error/empty states.
- [x] T8 (R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R40) Render the recursive run
      tree with `NgTemplateOutlet`: `data-run`/`data-level`, role/runtime/label/model, detached tag,
      duration and `<data>` token counts with exact `title`s; no client-side sorting.
- [x] T9 (R26, R27, R28, R29) Add the feature-span computation, `span(run)`, the per-run tracks and
      the overlap strip.
- [x] T10 (R30, R31, R32, R33, R34, R35) Render the totals block: `agent effort`, `wall time`,
      `tokens` with the category breakdown, and the note.
- [x] T11 (R41, R42) Apply the overflow rules (`min-w-0`, `break-all`/`break-words`) and the
      `lg:max-h-[40vh]` focusable, labelled run-list scroll region.
- [x] T12 (R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26,
      R27, R28, R29, R30, R31, R32, R33, R34, R35, R40, R42, R43, R44) Create
      `agent-usage-section.component.spec.ts` with the section tests from the test plan.

## Card and dashboard wiring

- [x] T13 (R8, R9, R45) Add the optional `usage` input to `process-log-card.component.ts` and render
      `<app-agent-usage-section>` between `[data-log-header]` and the sessions block in the `ok`
      branch only; leave every other branch untouched.
- [x] T14 (R8, R9, R45) Add the placement test to `process-log-card.component.spec.ts`; existing card
      tests must pass unchanged.
- [x] T15 (R3, R4, R5, R6, R7) In `dashboard-page.component.ts` extract the log target stream with
      `shareReplay({ bufferSize: 1, refCount: true })`, add the `agentUsage` signal and the usage
      `switchMap` pipeline, and bind `[usage]="agentUsage()"` on the card; the log and state
      pipelines keep their behaviour.
- [x] T16 (R3, R4, R5, R6, R7, R12, R41) Add the dashboard integration tests from the test plan and
      the `usageUrl` helper; add only the usage-request expectations to existing feature-selecting
      tests (`design.md` § "Test preservation"), without editing their assertions.

## Docs and closure

- [x] T17 (R1) Update `docs/architecture.md`: usage route in "Data Flow" and the agent usage section
      in the `dashboard/` layer description.
- [x] T18 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19,
      R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35, R36, R37, R38,
      R39, R40, R41, R42, R43, R44, R45) Run the verify command; confirm all existing tests pass and
      write the `R<n>` → test traceability table in `progress/impl_feature_agent_usage_panel.md`.
