# Review: feature 7 `feature_process_log_panel` (sdd=1, session 18)

**Verdict:** APPROVED

## Verification run by the reviewer

- `./init.sh`: exit 0. Output: `All files pass linting.` (ng lint + prettier --check src), build OK,
  Karma `TOTAL: 117 SUCCESS` (0 failed), `[OK] Environment ready`. The only warnings are the
  pre-existing "No tests/ directory; fingerprint lint skipped" lines.
- No PostgreSQL baseline applies; I required ordinary green tests and got them.
- I read every changed or new file in `src/`, plus `docs/architecture.md`. No `console.*`, `TODO`,
  `debugger`, `fdescribe` or `fit` in the touched files.

## Requirement traceability (checked against the code and tests myself)

| R | Code | Test checked |
|---|---|---|
| R1, R2 | `harness-api.service.ts` `getFeatureLog` encodes both segments | api spec: `expectOne(.../team%2Fodd%20slug/features/a%20b%2Fc/log)`, method GET, typed payload round-trip |
| R3, R9, R10 | `features-table.component.ts` sets role/tabindex/aria-pressed and binds `[class.border-signal]`/`[class.bg-edge]` | table spec test 1: attributes, bound classes, and the computed amber 2 px left border plus `bg-edge` background |
| R6, R7 | `(keydown.enter)`, `onSpace` calls `preventDefault` | table spec test 2: click, Enter and Space emit; `space.defaultPrevented` is true |
| R4, R5, R8 | `onFeatureToggled` | dashboard: `navigate` spy called with `['/projects','demo-project']`, `{feature}` or `{}`, `replaceUrl: true`; `router.url` checked both ways |
| R11 | second router pipeline | dashboard "restores…": `match(...).length === 1`, then `expectNone` |
| R12, R13 | `openProject` unchanged; `switchMap` | dashboard "switching project…": URL has no query, `pending.cancelled` |
| R14 | state pipeline key still slug-only | dashboard: `expectNone(stateUrl)` after a feature-only change, `pending.cancelled` |
| R15, R16 | `matches()` + `scrollCardIntoView` | dashboard: wide gives no call, narrow gives `smooth`, narrow + reduce gives `auto`, spied on the card host |
| R17, R18 | card is the aside's last child | dashboard: last child, previous sibling is the blocked card, h2 classes, computed uppercase and mono |
| R19–R22 | card states, `toLogError` | card spec (hint, status loader, 404/ERR/fallback) and dashboard (404 and a real 401 inside the card) |
| R23, R24 | header + `[pulse]="false"` track | card spec: id `07`, name, title, track label, empty-sessions copy |
| R25–R30 | no sorting; all field blocks present | card spec: sessions and entries deliberately out of timestamp order; the dt key order and every value are asserted |
| R31 | `present`/`items` | card spec: null, `[]`, blank-only arrays and blank strings all drop their dt |
| R32 | `sessionState` precedence | card spec: closed + paused gives `closed`, plus colour and node classes |
| R33 | mono/sans classes | card spec: computed font-family on 10 mono and 8 sans elements |
| R34 | `min-w-0`, `break-all`/`break-words`/`overflow-wrap:anywhere` | dashboard phone width: populated card at 360 px, `scrollWidth <= 360`, every descendant's right edge `<= 360` |
| R35 | spinner has `motion-reduce:animate-none` | card spec: every `animate-*` element in all five states |
| R36 | `[pulse]="false"` | card spec: no `[data-beacon]` or `[data-beacon-ping]` in any state, using an `in_progress` header (the case that would otherwise pulse) |

Tasks T1 to T16 are all `[x]`, and each one has matching code or doc changes (T15:
`docs/architecture.md` Data stack bullet, `dashboard/` layer line and Data Flow route).

## Declared deviations

1. **`pulse` input on `LifecycleTrackComponent`: accepted.** The conflict is real: the track emits
   `data-beacon="lifecycle"` for `in_progress`, so R23 and R36 cannot both hold without an opt-out.
   The change is minimal (`@Input() pulse = true`, gating applies only to the existing `track.pulse`
   branch). `grep` finds two callers: `features-table.component.ts:50` (no `pulse`, so default true
   and unchanged behaviour) and the new card (`[pulse]="false"`). Tests cover it: the new
   lifecycle-track spec case, the card's "never renders a beacon" case with an `in_progress` header,
   and the untouched existing four-beacon-kinds dashboard test, which still passes. The session log
   records it as a GAP entry.
2. **The 360 px check is a new test: accepted.** design.md asks both to "extend the 360 px test" and
   to keep existing tests unchanged. A sibling test that reuses `mountAt360` satisfies both, and its
   assertions are stricter than the requirement (every descendant inside 360 px). Nit, no change
   required: there is no blank line between the previous `}));` and the new `it(` in
   `dashboard-page.component.spec.ts` (~line 1175).
3. **`aria-pressed:` classes on the selected row: accepted.** design.md lists them explicitly as
   optional duplicates. The implementer's cascade argument holds: bare `border-signal` loses to
   `border-l-transparent`. The table spec asserts the computed colour (rgb(232,163,61), 2 px) and the
   background, so the visual result is tested, not just the class list. The bound R10 classes are
   still present and asserted.

Undeclared items I checked: the idle branch returns `of(idle)` instead of `set` + `EMPTY` (same
behaviour, and still cancels through `switchMap`), and prose renders through `[textContent]` with
`pre-wrap`. Both are fine and both are in the handoff.

## Checkpoints

- C1: [x] `.harness.json`/`harness.db` present, docs filled, `./init.sh` exit 0.
- C2: [x] Only feature 7 is `in_progress`; open session 18 is the current work; the 117-test suite is green.
- C3: [x] Changes stay inside `core/` (HTTP) and `dashboard/` (rendering), with no new dependency.
  The card is presentational, and the page makes the API call. No debug leftovers. The
  `frontend-design` invocation is noted in the handoff's "Visual design" section, and the markup
  matches design.md "Visual direction": palette, rail and nodes, field keys, copy, the `lg:max-h-[60vh]`
  labelled scroll region, and `scroll-text` icon.
- C4: [x] Every changed source file has a spec that imports and exercises it. The tests use the
  real components with `HttpTestingController` and the real router, not mocks of the units under
  test. The reviewer ran the verify command and it is green.
- C5: [x] (pending log-out) No stray temp files; untracked files are the feature's own spec,
  handoff and source/spec files. The implementer runs `log-out` after this approval.
- C6: [x] Spec files exist; requirements use EARS with stable R1 to R36; T1 to T16 are `[x]`; every
  R maps to a passing test the reviewer checked (table above).

## Required changes

None.
