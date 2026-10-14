# Implementation Report: design_fidelity_pass (feature 4)

Session: 12. `sdd=0`, so the contract is the 14 acceptance criteria in harness.db (`state/features/004-design_fidelity_pass.md`). The visual source of truth is `progress/design_reference/{login,dashboard}.dc.html`.

## Outcome: READY for review

- `./init.sh` exits 0 (`[OK] Environment ready.`). Lint, including `prettier --check src`, is clean. Build is clean. Karma: **27/27 SUCCESS** (17 before).
- `grep -rEn '#[0-9a-fA-F]{3,8}' src` (excluding environment) finds nothing. No `https://` in `src`. The built CSS has no `url(https…)`, and 12 self-hosted `.woff2` files are bundled.
- `init.sh` printed two `[WARN]` lines, both pre-existing and unrelated to this feature: `tests directory … not found; skipping fingerprint lint` and `No tests/ directory; fingerprint lint skipped`.
- I checked the login visually with a headless Chrome screenshot of the production build at 1280×800, compared against `login.dc.html`. The dashboard needs a live Supabase session, so it is covered by DOM specs only.

## frontend-design skill

I loaded it through the Skill tool (`frontend-design:frontend-design`) before touching any markup. The reference pins palette, type, layout and motion, so I followed the skill's own rule ("where the brief pins down a visual direction, follow it exactly"). I added no invented elements, and every decision below traces back to the reference.

## INCIDENT: needs leader/user action

To fix formatting I ran `npm run format`. That script is `prettier --write .`, which covers the whole project, not just `src`. It reformatted files outside my scope. The changes are whitespace and table alignment only, with no change in meaning:

- **Already reverted** with `git checkout` (tracked, with no prior uncommitted edits): `eslint.config.js`, `docs/architecture.md`, `specs/**`, `progress/impl_scaffold_frontend_stack.md`, `progress/impl_upgrade_angular_latest.md`.
- **Not reverted.** These had pre-existing uncommitted user edits, and auto-mode denied overwriting them:
  - `docs/conventions.md`
  - `docs/verification.md`
  - `progress/review.md`
  - `docs/specs.md`

  I rebuilt each one by taking HEAD, adding the user's diff, and leaving out prettier's changes. For conventions and verification, the only difference from HEAD is exactly the user's amendment. The rebuilt files are in `/private/tmp/claude-501/-Users-ricardoaguilar-Documents-Development-personal-harness-spectator/f54d6aa2-ae2a-48a7-8c57-50b3af4cbcdc/scratchpad/recover/`, as `docs_conventions.md.restored`, `docs_verification.md.restored` and `progress_review.md.restored`.

  For `docs/specs.md`, prettier applied to `personal_harness/templates/docs/specs.md.tmpl` matches the current file exactly, so the original was that template. Restore it by copying the template.
- **Git-excluded harness files, also reformatted:** `AGENTS.md`, `.claude/agents/*.md`, `.claude/settings.json`, `progress/design_reference/{login,dashboard}.dc.html`, `progress/impl_offline_design_system.md`. The harness files can be regenerated from the toolkit with `install.sh`/`gen_agents.sh`. The other three have no pristine copy I can find.
- **Suggestion:** change the `format` script to `prettier --write src`, or add a `.prettierignore`, so this cannot happen again.

## Changes by file

| File | Change |
|---|---|
| `tailwind.config.js` | **New colour tokens:** `row-hover`, `edge`, `line-strong`, `faint`, `subtle`, `dim`, `soft`, `bright`, `err-text`, `grid-dot`. `status.pending` changed to `#46505f` to match the reference.<br>**Type and spacing:** `fontSize.label` tracking changed to 0.12em. New `fontSize.tiny/micro/2xs`. New `spacing.1.75/2.25/2.75` and `borderWidth.1.5`.<br>**Surfaces:** `boxShadow.card`, `backgroundImage.dot-grid`, `backgroundSize.dots`.<br>**Motion:** keyframes `beacon` (the reference ping), `fade-in`, and `caret` matched to `hs-blink`. Animations `beacon` (2.4s), `beacon-fast` (1.8s), `spin-fast` (0.8s), `fade-in`. |
| `src/styles.css` | Adds `@fontsource/ibm-plex-mono/latin-600.css`. The reference uses mono semibold; this is an existing dependency. |
| `src/app/auth/login-page.component.ts` | Rebuilt to match `login.dc.html`: dot-grid backdrop, 368px card, centred beacon header, placeholders, the icon-overlap fix, spinner, full-border error banner, mono footer. `Lock` icon dropped. |
| `src/app/dashboard/dashboard-page.component.ts` | Topbar, `1.7fr/1fr` grid, mono `Features` title, `loggingOut` signal, logout overlay. |
| `src/app/dashboard/features-table.component.ts` | Table replaced by reference rows: no header row, no SDD column, padded id, truncated title. Empty state kept. |
| `src/app/dashboard/lifecycle-track.component.ts` | Rewritten as a `STATUS_TRACK` map: connector, filled/hollow node, pulse, readable label. Muted fallback for unknown statuses. |
| `src/app/dashboard/open-session-card.component.ts` | `$`-prefixed terminal lines with the caret inline after `next`. The clock moved from the timestamp line to the card title, as in the reference. |
| `src/app/dashboard/blocked-features-card.component.ts` | Title `Blocked` in mono. Item rhythm and typography follow the reference. |
| `*.spec.ts` (3 files) | See the mapping below. |

**Root cause of the icon overlap (criterion 3).** `lucide-icon` has a `class` *input* that it copies onto the inner `<svg>`. The positioning utilities (`absolute left-3 top-1/2 -translate-y-1/2`) were therefore applied twice: once to the host and once to the svg inside the already-positioned host. That pushed the svg to about 24–40px, over text that starts at 36px.

The fix puts positioning on a wrapper `<span class="absolute inset-y-0 left-2.5 flex items-center">`, and the icon carries only `block h-3.5 w-3.5`. A geometry spec asserts the result: icon offset ≈ 10px, width ≈ 14px, and right edge < the input's text start.

## Criterion → test mapping

Spec files: `L` = `src/app/auth/login-page.component.spec.ts`, `D` = `src/app/dashboard/dashboard-page.component.spec.ts`, `T` = `src/app/dashboard/lifecycle-track.component.spec.ts`.

| # | Test(s) | What is asserted against the real DOM / computed style |
|---|---|---|
| 1 | L `renders a centred header: pulsing signal mark, sans "Sign in" h1 and a mono subtitle, no prose` | Header is `flex-col items-center` and contains the single `login-mark` beacon. No `lucide-lock`. h1 is "Sign in", `font-sans`, computed weight 600. Subtitle is "harness · spectator", mono, computed uppercase. The prose sentence is absent. |
| 2 | L `sits on an ink backdrop with a dotted grid, in a 368px card with 6px radius and a deep shadow` | `bg-ink`. Computed `radial-gradient` background image with size `26px 26px`. Form computed radius 6px, shadow contains 70px, max-width 368px. |
| 3 | L `labels fields in mono uppercase, shows the reference placeholders and keeps icons clear of the text` | Placeholders are exact. `lucide-mail`/`lucide-key` measured with `getBoundingClientRect`: offset ≈ 10px, width ≈ 14px, right edge < input left + padding-left. |
| 4 | L `shows a spinner beside "Signing in…" while the sign-in is in flight`; L `displays an inline [ERR] banner …` | `[data-spinner]` (`animate-spin-fast`, `motion-reduce:animate-none`) is present while submitting, the label reads "Signing in…", and the button is disabled. Banner has a computed 1px border on all 4 sides, `border-status-blocked/35`, no `border-l-2`, and a mono `[ERR]` tag. |
| 5 | L `closes with a mono uppercase "Secured by Supabase Auth" footer` | Exact text, mono, computed uppercase, letter-spacing > 0, font-size < 10px. |
| 6 | D `titles every section and card with a mono uppercase instrument label; the blocked card reads "Blocked"` | Titles read `Features`/`Open session`/`Blocked`. Each has `text-label`, computed uppercase, and a computed font-family containing IBM Plex Mono. |
| 7 | D `lists features as reference rows: …`; D `keeps the empty state when there are no features` | No `table`/`thead`/`th`, no "SDD". Ids are `01`/`12`. Name is mono. Title is sans `text-dim` with computed ellipsis/nowrap and `scrollWidth > clientWidth`. The track is the last child, flush right. Row has `hover:bg-row-hover`. Empty-state copy is kept. |
| 8 | T `follows the reference STATUS_TRACK for every known status`; T `right-aligns the track at a fixed width` | For each status: queued `bg-line-strong`, then connector colour (`bg-line` for pending/spec_ready, `bg-signal`, `bg-status-blocked`, `bg-status-done`), then filled vs hollow node (hollow has a transparent computed background and a `border-1.5` ring). The track is 150px and right-justified. |
| 8, 14 | T `pulses only for in_progress, with motion disabled under prefers-reduced-motion` | A single `lifecycle` beacon appears for in_progress only. Its ping carries `motion-reduce:animate-none` and `motion-reduce:hidden`. Zero pings for every other status. |
| 9 | D `renders a human-readable, status-coloured lifecycle label for every status`; T `falls back to a muted hollow track …` | Labels are `pending`/`in progress`/`blocked`/`done`/`spec ready`/`archived` with per-status colour classes. Unknown statuses are `text-muted`, use a hollow `border-faint` node, and render `on_hold` as "on hold". |
| 10 | D `renders the open session as a $-prefixed terminal block with the caret inline after the next step` | 4 lines. Keys are agent/feature/started/next with the exact values. Each line starts with a `text-faint` `$`. Exactly one caret, inside the `next` line, right after its value. No `lucide-clock` in the block. |
| 11 | D `renders the topbar: …`; D `keeps only the wordmark beacon and an idle indicator …` | Header is `bg-panel` (not `panel-raised`). Wordmark beacon is present with mono, computed-uppercase "HARNESS". `·` separator. Mono slug. Indicator reads "1 agent active", or "idle" with `text-faint`. Initial "U" in a `rounded-full` circle. Log-out button carries a `lucide-log-out` svg. |
| 12 | D `shows a redirecting overlay and a disabled "Logging out…" button until navigation completes`; D `signs out and returns to the login page` | `signOut` is held open while these are checked: the overlay is computed `position: fixed` with background `rgba(10, 13, 18, 0.88)`; the spinner is `border-signal` with reduced-motion off; the message is mono "redirecting to sign in…"; the button is disabled and reads "Logging out…". A second click does not call `signOut` again, and the route has not changed. On release, the route becomes `/login`. |
| 13 | D `lays out a 1.7fr / 1fr grid on large screens and a single column below` | `grid-cols-1` plus `lg:grid-cols-[1.7fr_1fr]`, `gap-4` (computed 16px), `lg:p-5`, aside `gap-3.5`. |
| 14 | D `places exactly four beacon kinds: …` plus the criterion 1/8/11 tests | Live dashboard has the `{agent, lifecycle, wordmark}` beacons and login has `{login-mark}`, giving a union of exactly 4. Every `[data-beacon-ping]` has `motion-reduce:animate-none` and `motion-reduce:hidden`. Idle state has only `wordmark`. In source, `data-beacon` appears in exactly 4 places. Every other animation (caret, spinners, overlay fade, row hover transition) also carries a `motion-reduce:` off-switch. |

## Deviations from the reference (deliberate, small)

1. **Font sizes snapped to tokens.** Odd sizes are approximated: field labels 11px (reference 10px), inputs, names and titles 12px (reference 12–12.5px). This avoids repeated arbitrary values, as `docs/conventions.md` requires. Single-use sizes (17px h1, 13px submit, 9.5px footer, 10px `[ERR]`, 11.5px logout) are exact arbitrary values.
2. **Spinners are CSS rings** (a bordered circle with a transparent right edge), not the reference's inline SVG circle. This keeps every `<svg>` in `src` coming from lucide `pick()`. It looks the same at 13px and 20px.
3. **The topbar stays `sticky`.** The reference artboard is a fixed-height frame; a sticky header keeps log-out reachable on long lists.
4. **The `Blocked` title's alert-triangle only shows when something is blocked,** as before. The reference only draws the non-empty state.
5. **Blocked note renders in `font-sans`, as in the reference.** `docs/conventions.md` says API values render in mono, but criterion 7 already sets the precedent that free-text titles are sans. The blocked item *name* stays mono.
6. **Mobile:** the name column is `w-28` below `sm` (200px from `sm` up) so titles do not collapse to zero width on phones.
7. **Clock icon:** it moved from the terminal's `started` line to the card title, where the reference draws it. The terminal block itself has no icon, which is how I read "clock icon removed".

## Verification commands

```
./init.sh                         → exit 0, [OK] Environment ready (27/27 SUCCESS)
npm run lint                      → All files pass linting; Prettier clean on src
npm run build                     → bundle generated, no CDN urls in CSS
grep -rEn '#[0-9a-fA-F]{3,8}' src → only src/environments (none)
```
