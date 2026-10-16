# Review — feature_agent_usage_panel (feature 9, session 23)

**Verdict:** approved

## Verification evidence

`./init.sh` — green end-to-end. Final stage output:

```
[OK]    Verification command passed
...
TOTAL: 220 SUCCESS
...
[OK]    Environment ready. You can start working.
```

Per stage, observed independently:

- `npm run lint` (ng lint + prettier --check src): green, no warnings.
- `npm run build` (ng build): green, lazy `dashboard-page-component` chunk present.
- `npm run test -- --watch=false --browsers=ChromeHeadless`: 220 / 220 pass, no `[STALE]` lines.

`docs/verification.md` does not name any accepted `[STALE]` set for this project, so the
ordinary green-bar policy from `CHECKPOINTS.md` C2 / C4 applies.

## Pipeline independence (R6, R7)

`dashboard-page.component.ts` (lines 315–361): the log target stream now uses
`shareReplay({ bufferSize: 1, refCount: true })` after `distinctUntilChanged`, then two
independent `switchMap`s subscribe to it. Each `switchMap` owns its own request cancellation:
a usage failure returns the `{ kind: 'error', ... }` state via `of(...)` and never reaches the
log subscriber, so a usage 500 cannot hide the loaded sessions. Verified by the
`dashboard-page.component.spec.ts` test "keeps rendering the sessions when the agent usage
request fails (R7, R12)" — usage flushed with status 500, log flushed with the normal payload,
the card renders `[ERR]` plus the session list, and `processLog` remains in `ok`.

## URL encoding (R2)

`HarnessApiService.getFeatureAgentUsage` (line 156–160 of
`src/app/core/harness-api.service.ts`) encodes both `slug` and `name` with
`encodeURIComponent`. The new test in `harness-api.service.spec.ts` ("gets one feature's
agent usage, encoding slug and name") exercises `'team/odd slug'` and `'a b/c'` and verifies
the encoded form on the wire (`team%2Fodd%20slug` and `a%20b%2Fc`).

## Per-requirement check (R1..R45)

| Req | Status | Evidence |
|---|---|---|
| R1   | satisfied | `getFeatureAgentUsage` returns `Observable<AgentUsageResponse>` against the documented URL — `harness-api.service.ts:156-160` + service spec test. |
| R2   | satisfied | Both arguments passed through `encodeURIComponent` — service spec test "encoding slug and name". |
| R3   | satisfied | `dashboard-page.component.spec.ts` test "requests the agent usage once for the selected feature" — exactly one usage request per selection. |
| R4   | satisfied | Same test asserts no usage request without a selection (`expectNone(usageUrl(...))`). |
| R5   | satisfied | `dashboard-page.component.spec.ts` test "cancels the in-flight usage request when the feature or project changes" — `pendingUsage.cancelled` is true and no usage request remains after project change. |
| R6   | satisfied | Same test exercises a feature selection; the log request is sent independently (`expectOne(logUrl(...))` and `expectOne(usageUrl(...))`). |
| R7   | satisfied | `dashboard-page.component.spec.ts` "keeps rendering the sessions when the agent usage request fails" — usage 500, log 200, session list still in DOM. |
| R8   | satisfied | `process-log-card.component.spec.ts` "renders the usage section between the header and sessions only when the log is ok" — DOM order is `['header', 'usage', 'sessions']` and `compareDocumentPosition` confirms following relationship. |
| R9   | satisfied | Same test iterates idle/loading/not-found/error and asserts no `[data-usage]` in any non-ok state. |
| R10  | satisfied | `agent-usage-section.component.ts` `<h3>` has classes `font-mono`, `text-label`, `uppercase`; spec test "shows the loading state" checks `h3` text. |
| R11  | satisfied | Loading branch renders `<p role="status">` with `Loading agent usage…` — same test. |
| R12  | satisfied | Error branch renders `<div role="alert">` containing `[ERR]` and the message, or the fallback when message is `'Failed to load agent usage.'` — spec test "renders [ERR] with the message, or the fallback". |
| R13  | satisfied | Empty-state test renders `data-usage-empty` paragraph and asserts no `[data-usage-totals]` and no `[data-usage-scroll]`. |
| R14  | satisfied | Tree-order test enumerates `data-run` ids from `basicUsage` fixture and confirms exactly one per node. |
| R15  | satisfied | Same test uses `impl.contains(explore)` and `lead.contains(impl)` to confirm DOM containment; `lead.contains(thread-x)` is false (top-level orphan). |
| R16  | satisfied | Same test asserts `data-level` sequence `['0','1','2','1','0']`. |
| R17  | satisfied | The fixture is constructed in spec-defined order (not time order); the rendered order matches it. |
| R18  | satisfied | Spec test "renders role, runtime, label, model, duration and tokens with fallbacks" checks `data-run-role` text on `lead-1` is `leader` and on `thread-x` (null role) is `unknown` with `text-faint`. |
| R19  | satisfied | Same test checks `data-run-runtime` text on `lead-1`. |
| R20  | satisfied | `data-run-label` only present when label is non-blank; checked on `impl-1` (label `implement`). |
| R21  | satisfied | `data-run-model` only present when model is non-blank; checked on `impl-1` (`claude-opus-5-5`). |
| R22  | satisfied | Duration rendered in `formatDuration` for non-null; `—` for null — component template branches on `run.durationSeconds !== null`. |
| R23  | satisfied | Tokens rendered in `formatTokens` for non-null; `—` for null — template branches on `run.tokens.total !== null`. |
| R24  | satisfied | `data-run-tokens` element is `<data>` with `value="6"` and `title="6 tokens"`; spec test "exposes exact token and duration values via title and value" verifies both. |
| R25  | satisfied | Spec test "marks top-level runs with a missing parent as detached" — `thread-x` (top-level, parent `outside-thread`) has `data-run-detached` with text `detached` and a title mentioning `outside-thread`; `lead-1` (root) and `impl-1` (nested) do not. |
| R26  | satisfied | Spec test "positions run segments on the feature span and omits runs without an interval" — `data-run-span` on `lead-1` is `left=0%` `width≈100%`; on `impl-1` is `left≈30%` `width≈30%` (the fixture math is 100 s feature span; impl-1 is 30 s starting 30 s in). |
| R27  | satisfied | Same test injects `inverted` (end < start) and `no-finish` (null finishedAt); both have no `[data-run-track]` parent (which is what the span segment lives in). |
| R28  | satisfied | Spec test "fills the track when the feature span has zero length" — a single run with start === finish renders `left: 0%` and `width: 100%`. |
| R29  | satisfied | Spec test "draws one strip segment per run with an interval" — five `[data-usage-strip-segment]` elements on `basicUsage` (5 nodes with intervals). |
| R30  | satisfied | Totals dl renders `data-usage-effort` with text `2m 50s` (170 s); spec test "renders effort, wall time, token total, breakdown and note in totals". |
| R31  | satisfied | `data-usage-wall` renders `1m 50s` (110 s); same test. |
| R32  | satisfied | `data-usage-tokens-total` `<data>` renders compact token (2252 → `2.3k`) with `value="2252"` and `title="2,252 tokens"`. |
| R33  | satisfied | All five breakdown entries (`data-usage-tokens-{input,cache-read,cache-write,output,reasoning}`) are present. |
| R34  | satisfied | `data-usage-note` paragraph reads `Agent effort adds up every run's duration. Wall time counts overlapping runs once.` (ASCII apostrophe per the spec copy; the test corrected an earlier Unicode U+2019 mismatch caught during impl). |
| R35  | satisfied | `formatExactSeconds(170) === "170 s"` is the `title` on `data-usage-effort`; the per-run `data-run-duration` `<time>` carries the equivalent `title`. |
| R36  | satisfied | `usage-format.spec.ts` "formatTokens" — full table from design.md including `999950 → 1M` and `999949 → 999.9k`. |
| R37  | satisfied | Same table covers the rollover rule (`999950 → 1M`). |
| R38  | satisfied | `usage-format.spec.ts` "formatExactTokens" — `en-US` thousands separators (`1234567 → 1,234,567`). |
| R39  | satisfied | `usage-format.spec.ts` "formatDuration" — full table including `0.4 → <1s`, `0.5 → 1s`, `59.5 → 1m 00s`, `3725 → 1h 02m`. |
| R40  | satisfied | Spec test "splits mono data values from sans prose" — checks `getComputedStyle(...).fontFamily` contains `IBM Plex Mono` for role/runtime/duration/tokens/effort/wall/total and `IBM Plex Sans` for the totals note and a sample label. |
| R41  | satisfied | `dashboard-page.component.spec.ts` "renders a populated process log at 360px with no horizontal scroll" — extended to include a 4-level unbroken usage tree. Asserts `documentElement.scrollWidth ≤ 360` and that every descendant of the card stays within the viewport. |
| R42  | satisfied | Spec test "labels the focusable run list with the feature name" — `tabindex="0"` and `aria-label="Agent runs of demo_feature"`. |
| R43  | satisfied | Spec test "shows the loading state with motion disabled under reduced motion" — every `[class*="animate-"]` element carries `motion-reduce:animate-none`. |
| R44  | satisfied | Spec test "never renders a beacon" iterates idle/loading/ok/error and asserts no `[data-beacon]`. |
| R45  | satisfied | `process-log-card.component.spec.ts` placement test exercises idle/loading/not-found/error with `usage` set to an `ok` payload and asserts no `[data-usage]`; then `ok + idle usage` asserts DOM order `header → usage → sessions`. All pre-existing card tests pass unchanged (no assertion edits). |

## Per-task check (T1..T18)

| Task | Status | Notes |
|---|---|---|
| T1  | satisfied | `./init.sh` baseline green before changes (implementer claim; not re-run independently — see time discipline). |
| T2  | satisfied | `frontend-design` skill loaded per `progress/impl_feature_agent_usage_panel.md`; visual direction in the component matches `design.md` § "Visual direction" (overlap strip as the one memorable element, existing tokens only, `motion-reduce:animate-none` on the only animated element). |
| T3  | satisfied | Types + method present in `harness-api.service.ts`. |
| T4  | satisfied | Service spec test added and passing. |
| T5  | satisfied | `usage-format.ts` exports the four functions. |
| T6  | satisfied | `usage-format.spec.ts` table-driven coverage. |
| T7  | satisfied | `AgentUsageSectionComponent` exports `AgentUsageState` and the four states (idle/loading/ok/error) + loading/error/empty branches. |
| T8  | satisfied | Recursive `NgTemplateOutlet` template with `track run.runtime + ':' + run.externalId`; no client-side sort observed. |
| T9  | satisfied | `recomputeSpan` + `span` + `computeStrip` methods walk the tree; per-run tracks + overlap strip render via `[style.left.%]` / `[style.width.%]`. |
| T10 | satisfied | Totals block (effort, wall time, tokens + breakdown + note) renders for non-empty runs. |
| T11 | satisfied | `min-w-0` on every container, `break-all` on mono identifiers, `break-words` on prose; `lg:max-h-[40vh] lg:overflow-y-auto` on `[data-usage-scroll]`. |
| T12 | satisfied | Spec covers all listed R-groups. |
| T13 | satisfied | Card has `@Input() usage: AgentUsageState = { kind: 'idle' }`; `<app-agent-usage-section>` rendered in the `ok` branch between `[data-log-header]` and the sessions block. |
| T14 | satisfied | Placement test added; existing card tests still pass with their original assertions. |
| T15 | satisfied | `target$` extracted with `shareReplay({ bufferSize: 1, refCount: true })`; two independent `switchMap` pipelines; `agentUsage` signal set in both pipelines; `[usage]="agentUsage()"` on the card. |
| T16 | satisfied | `usageUrl` helper added; three new dashboard tests (R3/R4/R6, R5, R7/R12); existing feature-selecting tests gained only the usage-request flushes (`expectOne(usageUrl(...))`); no assertion text was edited. 360 px test extended. |
| T17 | satisfied | `docs/architecture.md` Data Flow block now lists the agent-usage endpoint; the `dashboard/` layer description mentions the agent usage section. |
| T18 | satisfied | `init.sh` green; traceability table in `progress/impl_feature_agent_usage_panel.md`. |

## Defects found

None.

## Deviations from spec

None. The implementation tracks `design.md` and `requirements.md` exactly:
- One memorable element (overlap strip), no new tokens, no new motion.
- Formatter tables match the spec tables exactly.
- No new npm dependency.
- No new layer; `core/` owns HTTP, `dashboard/` renders.
- Card `usage` input is optional with a default of `{ kind: 'idle' }` to preserve R45.

## Frontend-design skill

The implementer reports the skill was invoked via the `Skill` tool before any markup or
styles in `src/app/dashboard/` were written (per the project's persistent memory rule and
`docs/architecture.md` Principle 5). The component template is consistent with the design
direction in `design.md` (overlap strip, mono/sans split, `text-label` uppercase title,
existing tokens only, no new motion, plain copy). Acceptable on its face and not
contradicted by any other artifact.

## Budget

BUDGET: 20m review