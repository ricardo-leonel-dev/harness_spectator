# Implementation handoff: feature_process_log_panel (feature 7, sdd=1)

## Outcome

Ready for review. All 16 tasks (T1 to T16) are checked off in
`specs/feature_process_log_panel/tasks.md`. `./init.sh` exits 0: lint and Prettier pass, the build
passes, and Karma reports **117 SUCCESS, 0 FAILED**. The baseline before any change was 96 SUCCESS
(T1), so this feature adds 21 tests. Every existing test passes and none was edited.

I followed every "Open decision" as the human accepted it: clicking the selected row deselects it,
navigation uses `replaceUrl: true`, timestamps show as raw ISO strings in `<time datetime>`,
`description`/`acceptance` are typed but not rendered, and a 401 shows inline as `[ERR]`.

## Scope (files)

Production:
- `src/app/core/harness-api.service.ts`: adds `FeatureHeader`, `ProcessLogEntry`,
  `ProcessLogSession`, `FeatureLogResponse` and `getFeatureLog(slug, name)`, which
  `encodeURIComponent`s both values. (T2)
- `src/app/dashboard/features-table.component.ts`: each row now has a `role="listitem"` wrapper.
  The row itself is `role="button"`, `tabindex="0"` and has `[attr.aria-pressed]`. It handles
  click, `keydown.enter` and `keydown.space` (`onSpace` calls `preventDefault`), and binds
  `[class.border-signal]`/`[class.bg-edge]` when selected. Adds the `selected` input and the
  `toggled` output. The row classes come from design.md "Interaction states", with
  `[&:last-child>div]:border-b-0` on the wrapper. (T4)
- `src/app/dashboard/process-log-card.component.ts` (new): exports `ProcessLogState` and
  `ProcessLogCardComponent` (OnPush, presentational). It renders an idle hint, a loading
  `role=status`, 404 and error `role=alert` banners, the header (id, name, title,
  lifecycle track) and the session rail. It has the helpers `present`, `items`, `sessionState`,
  `idLabel`, does no client-side sorting, applies the overflow rules, and adds the `lg:max-h-[60vh]`
  focusable scroll region labelled `Sessions of <name>`. (T6 to T8)
- `src/app/dashboard/dashboard-page.component.ts`: adds the `selectedFeature`/`processLog` signals
  and a second router pipeline keyed on `(slug, feature)` with `distinctUntilChanged` +
  `switchMap`. The state pipeline's slug-only key is untouched. Also adds `toLogError`,
  `onFeatureToggled` (navigates to `['/projects', slug]` with or without `feature`,
  `replaceUrl: true`) and an injected `DOCUMENT`. `matchMedia('(min-width: 1024px)')` gates
  `scrollIntoView`, which uses `auto` instead of `smooth` under `prefers-reduced-motion`. The card
  is the aside's last child. `openProject` is unchanged and still passes no query params.
  (T10 to T13)
- `src/app/dashboard/lifecycle-track.component.ts`: **outside design.md's file table, see
  "Deviations".** Adds `@Input() pulse = true`, and the beacon renders only when
  `track.pulse && pulse`.
- `docs/architecture.md`: adds the log route to the Data Flow diagram and the stack "Data"
  bullet, and adds the card and selectable rows to the `dashboard/` layer line. (T15)

Tests:
- New: `src/app/dashboard/features-table.component.spec.ts` (2 tests) and
  `src/app/dashboard/process-log-card.component.spec.ts` (9 tests).
- Extended: `src/app/core/harness-api.service.spec.ts` (+1),
  `src/app/dashboard/lifecycle-track.component.spec.ts` (+1) and
  `src/app/dashboard/dashboard-page.component.spec.ts` (+8: a `process log` describe with 7 tests,
  plus 1 new test in `phone width`).

Spec bookkeeping: `specs/feature_process_log_panel/tasks.md` T1 to T16 are `[x]`.

## Deviations (each recorded with append-log)

1. **`LifecycleTrackComponent` gained a `pulse` input.** R23 requires an `app-lifecycle-track`
   bound to `status` in the card header, and R36 forbids any `[data-beacon]` in the card. The track
   renders `data-beacon="lifecycle"` for `in_progress`, so the two requirements conflict for any
   in-progress feature, including the most common case: viewing the feature being worked on. The fix
   is an opt-out input that defaults to `true`, so every existing caller renders exactly as before
   (the four-beacon-kinds dashboard test still passes unchanged). The card passes
   `[pulse]="false"`. Tested by `lifecycle-track.component.spec.ts`: "drops the in_progress beacon
   when pulse is false…", and by the card's "never renders a beacon" test with an `in_progress`
   header.
2. **The 360 px test is a new test, not an edit of the existing one.** design.md says to "extend the
   360 px test", but it also requires existing dashboard tests to pass *unchanged*. I added
   `renders a populated process log at 360px with no horizontal scroll` in the same `phone width`
   describe, reusing `mountAt360`. It uses unbroken agent, plan, changes, entry, verification,
   closure and title tokens.
3. **Rows also carry `aria-pressed:border-l-signal aria-pressed:hover:bg-edge`.** design.md allows
   these as optional duplicates. They are needed in practice: `border-signal` alone loses the cascade
   to the static `border-l-transparent` (same specificity, emitted later), so the amber left bar would
   not show. Hover over a selected row would also revert to `bg-row-hover`. The bound
   `border-signal`/`bg-edge` classes (R10) are still present and tested. The table spec also asserts
   the computed `border-left-color` (amber, 2 px) and the `bg-edge` background.
4. **The no-selection branch returns `of({kind:'idle'})` instead of `set(idle)` + `EMPTY`.** The
   behaviour is the same: `switchMap` still cancels any in-flight request, and the subscriber sets the
   idle state.
5. **Verification and closure prose render through `[textContent]`.** They use
   `whitespace-pre-wrap` so multi-line log text keeps its line breaks. Prettier reflows a `{{ }}`
   inside a block element onto its own line, which would render a leading space under `pre-wrap`.

## Visual design (CHECKPOINTS C3)

I invoked the `frontend-design` skill before touching `src/app/dashboard/`. design.md's
"Visual direction" pins the design (the session rail, existing tokens only, the exact class strings
and copy), so I implemented it as written with no new tokens or keyframes. The only motion is the
existing `animate-spin-fast` loader with `motion-reduce:animate-none` and the user-triggered scroll.
I did not run a manual Level 3 smoke test against a live backend.

## R → test traceability

C = `process-log-card.component.spec.ts`, D = `dashboard-page.component.spec.ts`,
T = `features-table.component.spec.ts`, A = `harness-api.service.spec.ts`.

| R | Test |
|---|---|
| R1, R2 | A: `gets one feature's process log, encoding slug and name` |
| R3 | T: `renders every row as a focusable toggle button with aria-pressed reflecting the selected input` |
| R4, R5, R8 | D: `selecting a row writes ?feature= with replaceUrl, and activating it again clears it` |
| R6, R7 | T: `emits the row name on click, Enter and Space, preventing default on Space`; D (R6 via Enter): `selecting a row writes ?feature=…` |
| R9 | T: `renders every row as a focusable toggle button…`; D: `restores the selection from the URL on load and requests the log once` |
| R10 | T: `renders every row as a focusable toggle button…` (bound classes plus computed style); D: `restores the selection…` |
| R11 | D: `restores the selection from the URL on load and requests the log once` (`match(...).length === 1`, `expectNone` after the flush, and `verify()` in afterEach) |
| R12 | D: `switching project drops the feature query param and cancels the pending log request` |
| R13 | D: `does not refetch state when only the feature changes, and cancels the previous log request`; D: `switching project drops…` (`TestRequest.cancelled`) |
| R14 | D: `does not refetch state when only the feature changes…` (`expectNone(stateUrl)`) |
| R15, R16 | D: `scrolls the card into view on narrow viewports, honouring reduced motion` (wide: not called; narrow: smooth; narrow + reduce: auto) |
| R17, R18 | D: `places the process log card after the blocked card in the aside` |
| R19 | C: `shows the hint when idle`; D: `selecting a row…` (hint after deselect) |
| R20 | C: `shows a status loader with motion disabled under reduced motion`; D: `restores the selection…` (status while pending) |
| R21 | C: `renders the 404 and error variants, with the fallback message`; D: `shows the not-found message for a 404 and [ERR] for a 401 inside the card` |
| R22 | C: `renders the 404 and error variants, with the fallback message`; D: `shows the not-found message for a 404 and [ERR] for a 401…` |
| R23, R24 | C: `renders the header and the empty-sessions message` |
| R25 to R30 | C: `renders every populated session field in response order` (sessions and entries deliberately out of timestamp order) |
| R31 | C: `omits null, empty and blank fields with their labels` |
| R32 | C: `labels sessions closed, paused or open` (includes closed + paused precedence) |
| R33 | C: `splits mono data values from sans prose` (computed `font-family` on 10 mono and 8 sans elements) |
| R34 | D (`phone width`): `renders a populated process log at 360px with no horizontal scroll` |
| R35 | C: `shows a status loader with motion disabled under reduced motion`; C: `never renders a beacon` (checks every `animate-*` element in every state) |
| R36 | C: `never renders a beacon` (all five states, with an `in_progress` header) |

## Verification

- T1 baseline (untouched tree): `./init.sh` exit 0, Karma `TOTAL: 96 SUCCESS`.
- One intermediate failure, fixed: my own expected element counts in the R33 test (9/9 changed to
  the correct 10/8). No production change was involved.
- Final: `./init.sh` exit 0. `All files pass linting.` (ng lint + prettier --check src), the build
  completed, Karma `TOTAL: 117 SUCCESS`, `[OK] Environment ready`.
- `[WARN]` lines from init.sh (pre-existing, not failures):
  - `[WARN] tests directory '.../frontend/tests' not found; skipping fingerprint lint`
  - `[WARN]  No tests/ directory; fingerprint lint skipped`
- Nothing was committed. Session 18 is still open; I have not logged out.
