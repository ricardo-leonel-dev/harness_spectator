# Tasks — dashboard_agent_usage_cards

Ordered; check off `[x]` as completed. See `design.md` for signatures, class strings, copy and the
test each task refers to. The `R<n>` → test mapping goes in
`progress/impl_dashboard_agent_usage_cards.md` under `## Traceability` (`docs/specs.md`).

## Baseline and design

- [x] T1 Run the verify command (`docs/verification.md` Level 1) on the untouched tree and confirm
      exit 0, so later failures are attributable to this feature.
- [x] T2 (R6, R32, R33, R34) Before writing any markup or styles under `src/app/dashboard/`, load the
      `frontend-design:frontend-design` skill with the Skill tool and follow it together with
      `design.md` § "Visual direction" (existing tokens only, the runtime split meter as the single
      memorable element, no motion). Record in `progress/impl_dashboard_agent_usage_cards.md` that it
      was loaded and when. If the skill is not available, stop and report it as a blocker.

## Contract

- [x] T3 (R1) Add `UsageBucket` and `DashboardAgentUsage` to `src/app/core/harness-api.service.ts`
      and the optional `agentUsage?: DashboardAgentUsage` property to `DashboardResponse`.
- [x] T4 Add `USAGE_CHART_COLORS` to `src/app/dashboard/progress-format.ts` and its pinning test to
      `progress-format.spec.ts`; `CHART_COLORS` and its tests unchanged.

## Usage block component

- [x] T5 (R6, R7, R8) Create `src/app/dashboard/dashboard-agent-usage.component.ts` with the `usage`
      input, the `data` computed (empty usage = null or `runs === 0`), the `Agent usage` title and the
      empty state.
- [x] T6 (R9, R10, R11, R12, R13, R27, R28) Render the KPI strip: total tokens with the category
      breakdown, agent effort with the run count and note, every compact count in `<data>` with exact
      `title`, every duration with `formatExactSeconds` `title`.
- [x] T7 (R14, R15, R16) Render the breakdown panel's runtime section: the split meter
      (`splitSegments`) and the two runtime rows.
- [x] T8 (R17, R18, R19, R20, R29, R30, R31) Render the model chart (`modelPoints`, 8-row cap with
      `Other (<n> models)`, `(no model)` label, no `select` binding, compact axis ticks,
      `#tooltipTemplate`, `animations: false`) and the no-model message.
- [x] T9 (R21, R22, R23, R24, R25, R26, R29, R30, R31) Render the ranking panel: chart
      (`rankingPoints`, `(select)="onRankingSelect($event)"` with the known-slug guard, compact axis,
      tooltip, `animations: false`) and the readout `<ol>` with rank, slug `routerLink`, tokens and
      effort.
- [x] T10 (R32, R33, R34) Apply the layout per breakpoint, the mono/sans split and the overflow rules
      (`min-w-0`, `truncate` + `title`, `overflow-hidden` chart wrappers); confirm no `animate-*`
      class or beacon.
- [x] T11 (R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23,
      R24, R25, R26, R27, R28, R29, R30, R31, R32, R34) Create
      `dashboard-agent-usage.component.spec.ts` with the block tests from the test plan.

## Overview wiring

- [x] T12 (R2, R3, R4, R5) In `progress-overview.component.ts` import `DashboardAgentUsageComponent`
      and render `<app-dashboard-agent-usage [usage]="current.data.agentUsage ?? null" />` once,
      after the `overall.total === 0` if/else inside the `ok` case; change nothing else.
- [x] T13 (R1, R2, R3, R4, R5) Add the placement and request tests to
      `progress-overview.component.spec.ts`; every existing test passes unedited.
- [x] T14 (R33) Add the 360 px populated-usage test to `dashboard-page.component.spec.ts`'s
      phone-width group; existing tests unedited.

## Docs and closure

- [x] T15 (R5) Update `docs/architecture.md`: widen the `@swimlane/ngx-charts` sentence to "the
      progress overview and its agent usage block", and name the block in the `dashboard/` layer
      line.
- [x] T16 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19,
      R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34) Run the verify
      command; confirm all existing tests pass and write the `R<n>` → test traceability table in
      `progress/impl_dashboard_agent_usage_cards.md`.
