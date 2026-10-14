# Tasks — feature_process_log_panel

Ordered; check off `[x]` as completed. See `design.md` for signatures, class strings, copy and the
test each task refers to. Invoke the `frontend-design` skill before touching `src/app/dashboard/`
(`docs/architecture.md` Principle 5), and follow `design.md` § "Visual direction".

## Baseline

- [x] T1 Run the verify command (`docs/verification.md` Level 1) on the untouched tree and confirm
      exit 0, so later failures are attributable to this feature.

## API

- [x] T2 (R1, R2) Add `FeatureHeader`, `ProcessLogEntry`, `ProcessLogSession`, `FeatureLogResponse`
      and `getFeatureLog(slug, name)` to `src/app/core/harness-api.service.ts`.
- [x] T3 (R1, R2) Add the `getFeatureLog` test to `harness-api.service.spec.ts`.

## Features table

- [x] T4 (R3, R6, R7, R9, R10) Add the `selected` input and `toggled` output to
      `features-table.component.ts`; wrap each row in a `role="listitem"` element; make the row
      `role="button"`, `tabindex="0"`, `aria-pressed`, with click/Enter/Space handlers and the
      row classes from "Interaction states".
- [x] T5 (R3, R6, R7, R9, R10) Create `features-table.component.spec.ts` with the two table tests.

## Process log card

- [x] T6 (R18, R19, R20, R21, R22, R35, R36) Create `process-log-card.component.ts` with the
      exported `ProcessLogState` union, the titled card and the idle/loading/not-found/error
      states.
- [x] T7 (R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33) Render the header and the session
      rail: session line, state label and node, time rows, plan/next/changes lists, entries,
      verification and closure, omitting empty fields; no client-side sorting.
- [x] T8 (R34) Apply the overflow rules (`min-w-0`, `break-all`/`break-words`) and the `lg` height
      cap with the focusable, labelled scroll region.
- [x] T9 (R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R35, R36)
      Create `process-log-card.component.spec.ts` with the card tests from the test plan.

## Dashboard wiring

- [x] T10 (R11, R13, R14) Add `selectedFeature`/`processLog` signals, the second router pipeline
      keyed on `(slug, feature)` with `switchMap`, and `toLogError`; leave the state pipeline's
      slug-only key untouched.
- [x] T11 (R4, R5, R8) Add `onFeatureToggled` navigating to `['/projects', slug]` with or without
      `feature`, `replaceUrl: true`; bind `[selected]`/`(toggled)` on `app-features-table`.
- [x] T12 (R15, R16) Inject `DOCUMENT`; add the narrow-viewport check and `scrollIntoView` with the
      reduced-motion behaviour, called only after a row activation.
- [x] T13 (R12, R17) Render `<app-process-log-card [state]="processLog()" />` as the aside's last
      child; confirm `openProject` still navigates without query params.
- [x] T14 (R4, R5, R8, R9, R11, R12, R13, R14, R15, R16, R17, R18, R21, R22, R34) Add the
      dashboard integration tests from the test plan, including the extended 360 px test.

## Docs and closure

- [x] T15 (R1) Update `docs/architecture.md`: log route in "Data Flow", card in the `dashboard/`
      layer description.
- [x] T16 Run the verify command; confirm all existing dashboard tests pass unchanged and write the
      `R<n>` → test traceability table in `progress/impl_feature_process_log_panel.md`.
