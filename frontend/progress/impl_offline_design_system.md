# Implementation Report — offline_design_system (feature 3)

Session: 10. Feature `sdd=0`, so there is no `specs/offline_design_system/` — the DB row's
acceptance criteria (mirrored in `state/features/003-offline_design_system.md`) are the contract.

## Outcome: READY for review

All 8 acceptance criteria are met. `./init.sh` exits 0 with `[OK] Environment ready.`
Test suite went from **5 to 17 specs, all passing**.

## `frontend-design` skill invocation (C3 / architecture Principle 5)

Invoked and applied. **Mechanism note for the reviewer:** this subagent is provisioned with only
Read/Write/Edit/Bash — no `Skill` tool and no `WebFetch`. The skill was therefore loaded the way the
Skill tool loads it, by reading its definition from disk:

`/Users/ricardoaguilar/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`

Its two-pass process (brainstorm a token/type/layout/signature plan → critique it against the brief
for generic defaults → only then write code) was followed. What the critique pass changed:

- **Palette/type were pinned by the brief**, so per the skill ("where the brief pins down a visual
  direction, follow it exactly") the near-black + single-amber-accent direction was kept even though
  it sits near one of the skill's named AI-default looks. The freedom was spent on **structure and
  motion** instead.
- **Colour-pill status badges were cut** in favour of the lifecycle track: status becomes a _position
  on a path_ (queued dot → connector → status node), which encodes something true about features
  (they move through a lifecycle) rather than decorating them. This is the skill's "structure is
  information" rule and is what the acceptance criteria asked for.
- **Motion was limited to two things**: the beacon ping (3 sanctioned places) and the terminal caret.
  Both are disabled under `prefers-reduced-motion`. Nothing else animates except colour transitions.
- **Copy was rewritten as direction, not mood**: empty states are `Nothing queued yet — add a feature
with scripts/harness.sh add-feature.`, `No agent session open.`, `Nothing blocked.`; errors are
  `[ERR]`-tagged and carry the real message verbatim.

## Artifact reference — could not be rendered (flagged, not blocking)

The visual source of truth <https://claude.ai/code/artifact/d4174953-8df9-4724-ad0d-cf17646c48c2>
was **not** viewable from this subagent: no `WebFetch` tool, and the artifact shell's content
endpoint (`/api/frame/<uuid>`) returns Cloudflare **403** to `curl`. Logged to the session at the
time rather than silently worked around.

Implementation therefore followed the **acceptance criteria**, which the task statement names
authoritative ("the local DB row is authoritative") and which transcribe the artifact's contract in
full: tokens, font roles, the exact icon list, the beacon's 3 placements, and a per-component layout
description. Every criterion is individually satisfied and testable (below). What could not be
recovered is sub-criterion detail (exact spacing rhythm, precise motion timing). **If the reviewer can
render the artifact, that is the one thing worth diffing against.**

## Changes by file

| File                                                   | Change                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tailwind.config.js`                                   | **new** — the only place hex lives. `theme.extend.colors`: `ink/panel/panel-raised/line/text/muted/signal` + `status.{pending,in-progress,blocked,done,spec-ready}`; `fontFamily.sans` → IBM Plex Sans, `.mono` → IBM Plex Mono; `fontSize.label` (11px/0.18em tracking) as the repeated instrument-label token; `keyframes/animation.caret`. |
| `package.json`                                         | `tailwindcss@^3.4.19` + `postcss` + `autoprefixer` (dev); `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `lucide-angular` (runtime); `overrides` entry for lucide (see note below).                                                                                                                                                |
| `src/styles.css`                                       | Rewritten: 5 self-hosted `@fontsource` latin imports, `@tailwind base/components/utilities`, `@layer base` applying `bg-ink text-text font-sans` to html/body. All previous hardcoded hex/`font-family` removed.                                                                                                                              |
| `src/index.html`                                       | `<title>` → `harness . spectator`. No links added; the only `<link>` remains the `data:` favicon.                                                                                                                                                                                                                                             |
| `src/app/auth/login-page.component.ts`                 | Restyled: ink shell, panel card, beacon+`lock` mark, `harness . spectator` wordmark with signal dot, mono uppercase labels, `mail`/`key` field icons, mono inputs, signal CTA with ink text, `[ERR]` banner. `styles: []` removed.                                                                                                            |
| `src/app/dashboard/lifecycle-track.component.ts`       | **new** — 2-node track + mono status label; beacon only when `in_progress`; muted fallback for unknown statuses.                                                                                                                                                                                                                              |
| `src/app/dashboard/status-badge.component.ts`          | **deleted** — replaced by the lifecycle track.                                                                                                                                                                                                                                                                                                |
| `src/app/dashboard/dashboard-page.component.ts`        | Sticky topbar (wordmark, project slug, live `N agent active`/`idle` indicator with beacon, initial tile, `log-out` icon button), responsive 2-col grid, `[ERR]` banner. `styles: []` removed.                                                                                                                                                 |
| `src/app/dashboard/features-table.component.ts`        | Hairline rows, mono data cells, sans label headers, lifecycle track per row, actionable empty state. `styles: []` removed.                                                                                                                                                                                                                    |
| `src/app/dashboard/open-session-card.component.ts`     | Mono terminal block (`bg-ink`, key/value grid, `clock` icon on the timestamp) ending in a blinking caret. `styles: []` removed.                                                                                                                                                                                                               |
| `src/app/dashboard/blocked-features-card.component.ts` | Left red rule per item (`border-l-2 border-status-blocked`) + `alert-triangle` in the heading. `styles: []` removed.                                                                                                                                                                                                                          |
| `src/app/auth/login-page.component.spec.ts`            | Selectors updated (`form`, `[role="alert"]`); **added** design-chrome test and a validation test.                                                                                                                                                                                                                                             |
| `src/app/dashboard/dashboard-page.component.spec.ts`   | Rewritten: all 5 statuses, live/idle indicator, terminal block + caret, blocked left rule, **logout flow**, `[ERR]` banner.                                                                                                                                                                                                                   |
| `src/app/dashboard/lifecycle-track.component.spec.ts`  | **new** — per-status node/connector/label colours, geometry, beacon-only-for-`in_progress`, unknown-status fallback.                                                                                                                                                                                                                          |

## Acceptance criteria → evidence

| Criterion                                                   | Evidence                                                                                                                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tailwind+postcss+autoprefixer, exact tokens + font families | `tailwind.config.js`; built CSS contains the token values (e.g. ink `10 13 18`)                                                                                                        |
| fontsource imported once in `styles.css`, no CDN `<link>`   | 5 `@font-face` in built CSS, 5 `.woff2` in `dist/.../media/`, **zero** `url(https…)`; `index.html` has only a `data:` favicon                                                          |
| lucide icons as inline SVG via `pick()`                     | `lock`/`mail`/`key`/`log-out`/`clock`/`alert-triangle`; login spec asserts `lucide-lock`/`lucide-mail`/`lucide-key` classes on rendered `<svg>`                                        |
| login restyled per contract                                 | login spec: beacon count, wordmark text, mono+uppercase labels, mono inputs, `bg-signal`+`text-ink` submit, `[ERR]` banner                                                             |
| dashboard/table/session/blocked restyled                    | dashboard spec: 5 lifecycle tracks, `1 agent active`+beacon vs `idle`, terminal block with `[data-caret]` as last child, `[data-blocked-item]` with `border-l-2 border-status-blocked` |
| no inline `styles: []`, no hex outside config               | `grep -rn "styles: \[" src/` → none; `grep -rEn "#[0-9a-fA-F]{3,8}" src/` → none                                                                                                       |
| specs pass, coverage retained + extended                    | 17/17; login validation+submit+error, all 5 statuses, logout flow all covered                                                                                                          |
| `./init.sh` exits 0                                         | `[OK] Environment ready.`                                                                                                                                                              |

## Decisions a reviewer should check

1. **Tailwind v3, not v4** — deliberate. The criteria require `tailwind.config.js` with
   `theme.extend` + `@tailwind` directives (the v3 model), and the architecture allowlist names only
   `tailwindcss`/`postcss`/`autoprefixer`; v4 would need `@tailwindcss/postcss`, which is _not_ on the
   allowlist.
2. **No `postcss.config.js` was created.** Angular 22's builders auto-wire Tailwind from a root
   `tailwind.config.js` (`@angular/build/src/builders/application/options.js` `getTailwindConfig`).
   Adding a postcss config would have _disabled_ that auto-wiring — the builder explicitly skips
   Tailwind when postcss is customised — and Angular only reads _JSON_ postcss configs anyway.
3. **`npm overrides` for `lucide-angular`.** It declares peers `@angular/core: 13.x - 21.x` (stale vs
   our Angular 22), so a plain `npm install` would ERESOLVE. Fixed with an `overrides` entry pinning
   its Angular peers to ours, rather than `--legacy-peer-deps`, so `npm install` keeps working with
   no special flags. The package is partial-Ivy compiled (`ɵɵngDeclareComponent`), which the Angular
   22 linker consumes fine; build and 17 specs prove it renders.
4. **`pick()` wiring.** `LucideAngularModule.pick({…})` returns a `ModuleWithProviders`, which
   standalone components reject in `imports` (NG2012). Used the equivalent supported form:
   `imports: [LucideAngularModule]` + `providers: [pick({…}).providers ?? []]` — still per-component
   registration, never the whole icon set, as `docs/conventions.md` requires. The array is nested
   because `Component.providers` is `Provider[]` while `ModuleWithProviders.providers` widens to
   include `EnvironmentProviders`; `Provider` admits `any[]` and Angular flattens it, so this avoids
   a cast.
5. **The beacon is inline markup in 3 places, not a shared component.** A `src/app/shared/` component
   would have added a top-level layer, which `docs/architecture.md` Principle 1 forbids without
   updating that doc first (out of my edit scope). Every instance is tagged `data-beacon`, so the
   "exactly 3" rule is greppable and is asserted by tests. `grep -rn "data-beacon" src/ | grep -v spec`
   returns exactly 3 lines.
6. **Beacon renders only when something is actually live** — topbar only when a session is open,
   track only for `in_progress` (the DB permits at most one). So at most 2 beacons on the dashboard
   and 1 on login, never more.
7. **`@angular/cdk` was not installed** — no overlay/modal/focus-trap need arose, per the brief.

## Notes for the orchestrator (not fixed — outside my edit scope)

1. **`src/app/app.routes.ts` is not Prettier-clean, and was already that way at `HEAD`** (verified
   against `git show HEAD:./src/app/app.routes.ts`). I did not touch that file and did not reformat
   it, to keep this feature's diff honest. `npm run lint` is green regardless — Prettier is not wired
   into `ng lint`, so nothing enforces it in `verify_command`. Worth a one-line cleanup commit or a
   `--check` step in the verify pipeline, as a separate decision.
2. **`./init.sh` still prints `[WARN] bootstrap_project sync failed:` (HTTP 404 `PGRST125`)** from the
   best-effort Postgres/Supabase mirror in step 6. This is **pre-existing** — it appeared identically
   on the baseline run before any of my changes — and is unrelated to this feature.
3. **`docs/conventions.md` font rule vs. the acceptance criteria.** The doc says frontend-authored UI
   copy renders `font-sans` and only harness data values render `font-mono`; the criteria explicitly
   require _mono_ uppercase field labels on login. I followed the criteria there (login labels are
   mono) and the doc everywhere else (table headers, card headings, button text and prose are sans;
   feature names, agent identities, timestamps, session ids and status labels are mono). The one
   further deviation is the open-session terminal block, where the `agent`/`feature`/`started`/`next`
   keys are mono because the block as a whole is a rendering of a session record. If the reviewer
   considers this a conflict rather than a resolution, `docs/conventions.md` is the file to amend —
   I could not edit it.
4. **`npm audit` reports 7 pre-existing vulnerabilities** (4 moderate, 3 high) in the dependency tree.
   Not introduced or worsened by this feature's additions; flagged only for visibility.

## Verification

```
./init.sh
→ lint: All files pass linting
→ build: Application bundle generation complete
→ test: TOTAL: 17 SUCCESS
→ [OK] Environment ready.
```

Offline-first proof from the built bundle (`dist/harness-frontend/browser/`):
`grep -o 'url(https[^)]*)' styles-*.css` → nothing; `media/*.woff2` → 5 files;
`index.html` asset refs → all relative.
