# Review — feature 5 (project_selector), round 3

**Verdict:** APPROVED

## Round 2 required changes: resolved

1. **The list failure no longer shows false empty states.** `dashboard-page.component.ts` now
   gates both the features table and the `<aside>` on
   `showsProject = computed(() => this.slug() !== null && this.notFound() === null)` (lines 189
   and 194). With no slug, only the banner or state message for that case renders.
2. **The spec now checks absence.** `default route › surfaces a project-list failure inline…`
   asserts that `app-features-table` and `aside` are absent and that none of "Nothing queued
   yet", "No agent session open." or "Nothing blocked." appear. The implementer reports it fails
   with the old gating.
3. **Non-blocking item, done: 16px gutter at 360px.** Push is removed. Below
   352 + 2×16px, `openPanel()` uses start-aligned positions with `offsetX = 16 - triggerLeft`,
   measured against the injected `DOCUMENT`'s `innerWidth`. The real-overlay spec asserts
   `left 16 / right 344`.
4. **Non-blocking item, done: the panel error wraps.** Its message span has `min-w-0 break-words`,
   and the spec asserts `overflow-wrap: break-word`.

## Checkpoints

- C1: [x] I re-ran `./init.sh`: exit 0, `TOTAL: 43 SUCCESS`, verification command passed. The
  warnings are environmental: `No tests/ directory`, and `cannot reach http://localhost:3001 —
  skipping mirror sync` (Docker Desktop is hung).
- C2: [x] Feature 5 is the only `in_progress` feature; session 14 is current.
- C3: [x] Layers and the dependency allowlist are respected (`@angular/cdk` is allowlisted and
  imported per module). There are no debug statements or TODOs, and `frontend-design` is
  recorded in the impl handoff.
- C4: [x] Specs exist for every changed source file: `harness-api.service.spec.ts`,
  `dashboard-page.component.spec.ts`, and `project-selector.component.spec.ts` (real CDK overlay
  in a 360px iframe). Only HTTP and Supabase are stubbed. I ran them myself: 43/43.
- C5: [ ] Expected: session 14 stays open until the implementer runs `log-out` after this
  approval.
- C6: N/A (sdd=0).

## Live evidence (round 3)

The backend at `:4000` still returns `500` for `GET /api/harness/projects`, because the mirror
Postgres is unreachable while Docker Desktop is hung. This round's live check therefore covers the
list-failure state and the panel geometry. Screenshots are in the scratchpad `review-shots-r2/`.

- **1440px, settled page** (`w1440-3-list-failure-settled.png`): only the `[ERR]` banner. No
  `app-features-table`, no `aside`, none of the false copy.
- **1440px, panel:** `left 124, right 476, width 352`. The error box is 332px wide and its
  `scrollWidth` equals its `clientWidth`, so nothing overflows.
- **360px, settled page** (`w360-3-list-failure-settled.png`): only the `[ERR]` banner, which
  wraps, and no document scroll.
- **360px, panel** (`w360-2-panel-open.png`):
  - `left 16, right 344, width 328`, which matches the 16px gutter.
  - The error text box spans 25–335 and its text 78–324, with `overflow-wrap: break-word`; the
    long URL wraps inside the box.
  - The panel opens the same way by click and by ArrowDown. Escape closes it and returns focus
    to the trigger.

**Not re-run live this round: the real-data flows** (22 projects, switching to
`v_gp5_library-frontend`, the unknown-slug `[404]` with "Choose another project", and the `/`
redirect). The backend cannot serve project data while the mirror Postgres is down. These flows
passed live against the real mirror in round 1 (`review-shots/w1440-*.png`). The round-2 and
round-3 changes touch only the overlay positions, the gating of the table and aside, and the
classes on the error text. HttpTestingController specs cover these flows and pass (43/43).

## Deviations accepted

- `[style.width.%]` for the proportional bar segments, which are data-driven.
- Static `role`, `tabindex` and `aria-selected` on options for angular-eslint; CdkOption host
  bindings override them at runtime.
- The `@angular/cdk` dependency, which is on the `docs/architecture.md` allowlist. The prebuilt
  overlay CSS is structural only.

## Non-blocking observations

- Phone positions are computed when the panel opens. Rotating or resizing the viewport while it
  is open keeps the old offset until the next open. This is acceptable for this tool.

## History

- Round 1: CHANGES_REQUESTED, because the panel overflowed at 360px (`left 112, right 440`) and
  the spec measured a clone instead of the real overlay.
- Round 2: CHANGES_REQUESTED, because the project-list failure rendered false empty states.
