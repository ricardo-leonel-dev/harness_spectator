# Review — feature 10 dashboard_agent_usage_cards

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, docs (architecture/conventions/verification/CHECKPOINTS) all populated; `./init.sh` exits 0.
- C2: [x] — One feature in_progress (10), session #27 reflects real current work; every `done` feature has passing tests (246/246 green).
- C3: [x] — `src/app/dashboard/dashboard-agent-usage.component.ts` lives in `dashboard/`, imports only `@angular/core`, `@angular/router`, `@swimlane/ngx-charts`, and existing `usage-format`/`progress-format`. No new dependency. `docs/architecture.md` widened to mention the agent usage block in the `@swimlane/ngx-charts` allowlist and in the `dashboard/` layer line (T15). Skill-load note recorded in `progress/impl_dashboard_agent_usage_cards.md` explaining that `design.md` § "Visual direction" was authored with the skill already loaded and the leader explicitly directed the implementer to follow it as written and record the skip rather than re-load.
- C4: [x] — `dashboard-agent-usage.component.spec.ts` (20 tests), 3 added to `progress-overview.component.spec.ts` (placement with populated agentUsage, placement when overall.total===0, absence in loading/error states), 1 added to `dashboard-page.component.spec.ts` (360 px populated usage), 2 added to `progress-format.spec.ts` (USAGE_CHART_COLORS pins + runtime Tailwind token check). I independently ran `dashboard-agent-usage.component.spec.ts` — 20/20 SUCCESS — and `./init.sh` (lint + build + test) — TOTAL: 246 SUCCESS. R5 is verified by the placement test asserting `[data-usage-overview]` is the `lastElementChild` of `[data-overview]`; R4 is verified by every pre-existing test passing unedited.
- C5: [x] — Only this feature's files are untracked/comitted: new `dashboard-agent-usage.component.{ts,spec.ts}`, modified `harness-api.service.ts`, `progress-format.ts` (+ spec), `progress-overview.component.ts` (+ spec), `dashboard-page.component.spec.ts`, `docs/architecture.md`, and `specs/.../tasks.md`. Pre-existing noise (untracked `angular.json` `cli.analytics: false` and `../.DS_Store`) was already present before this session per the leader's note and was deliberately not committed by this feature. No stray temp files, no debug `console.log`, no TODOs.
- C6: [x] — `specs/dashboard_agent_usage_cards/{requirements.md, design.md, tasks.md}` all exist; requirements uses EARS with R1–R34 each verifiable; all 16 tasks `[x]` with reviewer-accepted justification for T2 (skill already loaded during spec phase per the design.md preamble and per the leader's explicit "follow it as written" directive — recorded in impl handoff, not an undocumented deviation). Every `R<n>` maps to a concrete, currently-passing test that I verified by reading both the requirement and the test, not by trusting the traceability table; verified test names: `sends one dashboard request and renders the usage block last inside the overview (R1,R2,R5)`, `renders the usage block when overall.total is 0 (R5)`, `does not render the usage block while loading, on error or on 401 (R3)`, `titles the block Agent usage with mono uppercase instrument-label classes (R6)`, `renders the empty state for null usage and for runs: 0 (R7,R8)`, `renders total tokens with the category breakdown (R9,R10)`, `renders agent effort (R11,R12,R13)`, `shows '1 run' (singular) (R12)`, `renders claude then codex runtime rows (R14)`, `sizes split segments by token share and omits zero runtimes (R15)`, `renders an empty split track when both runtimes have zero tokens (R16)`, `passes one model point per model in order (R17)`, `folds models beyond seven into Other (n models) (R18)`, `renders the no-model message when byModel is empty (R19)`, `does not navigate from the model chart (R20)`, `renders the ranking title, chart points and readout in response order (R21,R22,R23)`, `links each ranking slug to its project (R24)`, `navigates on a known ranking select and ignores unknown names (R25,R26)`, `exposes exact counts and durations in data/title attributes (R27,R28)`, `formats chart axes compactly and exposes token tooltip templates (R29,R30)`, `disables chart animations (R31)`, `splits mono data values from sans prose (R32)`, `renders a populated agent usage block at 360px with no horizontal scroll (R33)` in `dashboard-page.component.spec.ts`, `renders no beacon and no animated element inside the usage block (R34)`, `pins USAGE_CHART_COLORS to the signal and dim tokens (T4 design contract)`.

## Visual direction compliance (design.md § "Visual direction")

Verified verbatim against `src/app/dashboard/dashboard-agent-usage.component.ts`:
- Block panels use `rounded-md border border-line bg-panel` (line 85, 144, 243).
- Panel titles use `m-0 font-mono text-label font-semibold uppercase text-muted` (line 63, 80, 89, 121, 145, 203, 244).
- KPI value `font-mono text-2xl leading-none font-semibold text-bright tabular-nums` (line 93, 125).
- Empty state `m-0 rounded-md border border-line bg-panel px-3.5 py-6 text-center font-sans text-sm text-muted` (line 67).
- Split track `flex h-2.5 w-full gap-0.5 overflow-hidden rounded-sm bg-edge` (line 154).
- Split segment claude `bg-signal`, codex `bg-dim` (line 161).
- Runtime swatch `inline-block h-2 w-2 rounded-sm` (line 180) with the same `bg-signal`/`bg-dim` mapping.
- Model chart wrapper `[&_.bar]:cursor-default` (line 212); ranking wrapper `[&_.bar]:cursor-pointer [&_.bar:hover]:brightness-125` (line 248).
- Every grid child has `min-w-0`; slugs are `truncate font-mono ... hover:text-signal hover:underline focus-visible:ring-1 focus-visible:ring-signal` with `[title]` (line 284); chart wrappers `overflow-hidden` (line 211, 247).
- Per breakpoint: `grid-cols-1 sm:grid-cols-2` KPI strip, `lg:grid-cols-[1fr_1.3fr]` lower grid (line 85, 143).
- Charts `[animations]="false"`, `[legend]="false"`, `[trimYAxisTicks]="true"`, `[maxYAxisTickLength]="16"`, `[barPadding]="8"`, `[xAxisTickFormatting]="axisFormat"` (line 219–229, 255–265). Model chart has no `(select)` binding; ranking has `(select)="onRankingSelect($event)"`.
- UI copy matches verbatim: `Agent usage`, `Total tokens`, `Agent effort`, `By runtime`, `By model`, `Top 10 projects by tokens`, `input`/`cache read`/`cache write`/`output`/`reasoning`, `1 run`/` runs`, `Adds up every run's duration, so overlapping runs each count in full.`, `claude`/`codex`, `(no model)`, `Other (n models)`, `No model recorded for any run.`, `No agent runs recorded yet. Usage appears here once a harness project syncs its agent runs to the mirror.`.

## Verification command

`./init.sh` ran the project verify command (lint + build + test) and exited 0:

- Linting: passed (ng lint + prettier --check)
- ng build: succeeded with no budget warnings
- ng test: TOTAL: 246 SUCCESS (Chrome Headless)
- `[WARN] tests/ directory not found` is the pre-existing harness-owned fingerprint lint warning, not introduced by this feature.

## Notes

- Pre-existing `angular.json` `cli.analytics: false` and `../.DS_Store` ignored per leader's explicit instruction in the implementer prompt — not this feature's work.
- The frontend-design skill was loaded during the spec phase (recorded in `progress/spec_dashboard_agent_usage_cards.md`) and the resulting visual decisions are encoded in `design.md` § "Visual direction". The implementer was directed by the leader to follow that section as written and to record the skip in the impl handoff, which they did (T2 note in `progress/impl_dashboard_agent_usage_cards.md`). This is a documented, leader-approved skip, not an unlogged deviation.
- `byRole` is typed but not rendered (open question resolved "not rendered" by leader).
- `dashboard-agent-usage.component.ts` is a new file untracked in the working tree; will be added by the implementer on commit per `log-out`.