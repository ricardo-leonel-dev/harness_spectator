# Review — feature 4 (design_fidelity_pass)

**Verdict:** APPROVED

Session 12, `sdd=0`. The contract is the 14 acceptance criteria in `state/features/004-design_fidelity_pass.md`. The visual source of truth is `progress/design_reference/{login,dashboard}.dc.html`.

## Checkpoints

- C1: [x] — `./init.sh` exited 0 (`[OK] Environment ready.`).
- C2: [x] — one feature is `in_progress` (4). Session 12 is the real, current work.
- C3: [x] — no hex values and no CDN references in `src/`. Icons come from lucide `pick()` only. Fonts come from `@fontsource` only (`latin-600` mono added to `src/styles.css`). No `console.log` and no TODOs were added. The `frontend-design` skill invocation is recorded in `progress/impl_design_fidelity_pass.md` § "frontend-design skill".
- C4: [x] — Karma 27/27 SUCCESS, run by me through `./init.sh`. Each changed component has a spec that renders real DOM and checks computed style or geometry (see the table below).
- C5: [x] (pending log-out) — no stray files from this feature. `.DS_Store` and `progress/impl_offline_design_system.md` predate it. The session stays open until the implementer runs `log-out` after this approval.
- C6: N/A (sdd=0)

## Criterion verification (spec read and run by me, markup compared with the reference)

| # | Verdict | Evidence |
|---|---|---|
| 1 | [x] | `login-page.component.ts`: `data-login-header` is `flex-col items-center`. It holds the `login-mark` beacon, an h1 "Sign in" in `font-sans font-semibold` at 17px, and a mono uppercase "harness · spectator". There is no Lock icon and no prose. The L spec checks computed weight 600, computed uppercase and `svg.lucide-lock` = null. |
| 2 | [x] | `bg-ink` shell, plus a `bg-dot-grid bg-dots opacity-60` layer (same as the reference: `radial-gradient(#131820 1px…)`, 26px, opacity 0.6). The card has `max-w-[368px] rounded-md shadow-card` (`0 30px 70px rgba(0,0,0,.55)`), matching the reference. The spec checks the computed radius, shadow and max-width. |
| 3 | [x] | Placeholders match exactly. The icon sits in a wrapper at `left-2.5` and the input has `pl-8`. The spec asserts with `getBoundingClientRect` that the offset is about 10px, the width about 14px, and the icon's right edge is before the text start. My screenshot shows no overlap. |
| 4 | [x] | While submitting, `[data-spinner]` (`animate-spin-fast motion-reduce:animate-none`) shows next to "Signing in…" and the button is disabled. The error banner has `border border-status-blocked/35` and a mono `[ERR]`. The spec checks a computed 1px border on all four sides and no `border-l-2`. |
| 5 | [x] | Footer: mono, uppercase, `tracking-[0.08em]`, `text-[9.5px]`. The spec checks computed uppercase, letter-spacing > 0 and font-size < 10px. |
| 6 | [x] | Features h1 and both card h2s are `font-mono text-label uppercase`. The blocked card title reads "Blocked". The spec checks the computed font-family is IBM Plex Mono. `docs/conventions.md` already has the instrument-label exception. |
| 7 | [x] | `features-table.component.ts`: list rows, no table/thead/SDD. `padStart(2,'0')`, mono name, `font-sans text-dim truncate` title, track as the last child, `hover:bg-row-hover`, empty state kept. The spec forces an overflowing title (`scrollWidth > clientWidth`). |
| 8 | [x] | The `STATUS_TRACK` map in `lifecycle-track.component.ts` matches the reference script block for all 5 statuses (connector, filled/hollow, node colour, pulse only on in_progress). The T spec iterates every status and checks the computed transparent background on hollow nodes. |
| 9 | [x] | Labels are 'pending', 'spec ready', 'in progress', 'blocked', 'done' with per-status colours. Unknown statuses fall back to `text-muted`, a hollow `border-faint` node and underscores turned into spaces (T and D specs). |
| 10 | [x] | Lines are `$`-prefixed (`text-faint`) for agent/feature/started/next, and the caret is the last child of the `next` line, right after the value. The terminal block has no clock. The spec checks the caret's parent and its previous sibling. |
| 11 | [x] | Header is `bg-panel` with the wordmark beacon and "Harness" in mono uppercase (computed), `·` in `text-line-strong`, mono slug, `rounded-full` initial, and a `lucide-log-out` icon. The agent indicator works as before (the beacon only shows when `activeAgents() > 0`, otherwise "idle"). This matches the reference `beaconColor` logic. |
| 12 | [x] | The `loggingOut` signal drives a `fixed inset-0 bg-ink/[0.88]` overlay with a `border-signal` spinner and mono "redirecting to sign in…". The button is disabled and reads "Logging out…". The spec holds `signOut` open: computed background `rgba(10, 13, 18, 0.88)`, a second click does not call `signOut` again, and after release the route is `/login`. |
| 13 | [x] | `grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 p-4 lg:p-5`, aside `gap-3.5`. This matches the reference (`gap:16px; padding:20px`, aside `gap:14px`). |
| 14 | [x] | `grep 'data-beacon[^-]' src` (excluding specs) finds exactly 4: login-mark, wordmark, agent (conditional), lifecycle (conditional). Every `animate-*` line in `src` also has `motion-reduce:animate-none`, and the row `transition-colors` has `motion-reduce:transition-none`. Beacon pings also have `motion-reduce:hidden`. The D spec checks that the set of beacons across login and live dashboard is exactly 4, and that idle shows only `wordmark`. |

## Deviation judgements

The report lists 7 deviations, not 6.

1. **Font sizes snapped to tokens** (labels 11px vs 10px; inputs/names/titles 12px vs 12–12.5px). **Acceptable.** No criterion pins these sizes, and the conventions say to prefer tokens over repeated arbitrary values. The screenshot difference is barely visible.
2. **CSS ring spinners instead of an inline SVG.** **Acceptable.** Criteria 4 and 12 only ask for "a spinning indicator" / "a signal spinner". This also keeps every `<svg>` coming from lucide `pick()`, as the feature 3 rules require.
3. **Sticky topbar.** **Acceptable.** The behaviour is unchanged from feature 3. The reference is a fixed-height artboard, so "sticky" vs "static" is not something it can show.
4. **Alert-triangle only when something is blocked.** **Acceptable.** The reference only draws the non-empty state, and criterion 6 only constrains the title text and style.
5. **Blocked note in `font-sans`.** **Acceptable for this feature**, because it matches the reference (the `note` span has no `hs-mono`) and the feature-title precedent in criterion 7. However, `docs/conventions.md` still says that API values render in mono and gives no exception for free-text prose fields (`title`, `note`). Follow-up: amend the conventions so the doc and the code agree. This does not block the feature.
6. **`w-28` name column below `sm`.** **Acceptable.** It is a responsive addition, and at `sm` and above the width is 200px, which matches the reference.
7. **Clock moved to the "Open session" title.** **Acceptable.** The reference draws the clock in the h2. Criterion 10 says "clock icon removed" in the context of the terminal block, and the spec asserts there is no clock inside `[data-terminal]`.

## Notes (not required changes)

- The report says "12 self-hosted `.woff2` files". `dist/*/browser/media` actually has 6 `.woff2` files: sans and mono, each at 400/500/600. The claim is wrong, but nothing is missing.
- `tailwind.config.js` `backgroundImage.dot-grid` repeats the `#131820` literal instead of reusing the `grid-dot` token. Hex in the config file is allowed, so this is cosmetic.
- `status.pending` changed from `#57616f` to `#46505f` (the reference `nodeColor`). This also affects any feature 3 usage of `status-pending`, which is acceptable because it now matches the reference.
- The `npm run format` incident and the doc and package changes were handled by the leader. They are not counted against this feature.

## Commands run

- `./init.sh` → exit 0. Lint passed, build passed, Karma `TOTAL: 27 SUCCESS`. The only `[WARN]` lines are the 2 pre-existing "no tests/ directory" warnings.
- `grep -rEn '#[0-9a-fA-F]{3,8}\b' src | grep -v environments` → 0 hits.
- `grep -rEn 'https?://' src | grep -v environments` → 0 hits.
- `grep -rn 'data-beacon[^-]' src | grep -v spec.ts` → 4 hits.
- `grep -rn 'animate-' src | grep -v spec.ts | grep -v 'motion-reduce:animate-none'` → 0 hits.
- `grep -o 'url([^)]*)' dist/*/browser/styles-*.css | grep -c http` → 0; `grep -c 'fonts.googleapis|cdn' dist/*/browser/index.html` → 0.
- Headless Chrome 1280×800 screenshot of the production build (`dist/*/browser` served locally, `/` → guard → `/login`), compared with a headless render of `login.dc.html` (placeholders filled). Layout, card, header, dot grid, icons and footer match. The only visible differences are the 1px larger labels (deviation 1) and the reference's demo-state error and spinner.
- I read all 3 spec files in full, plus the 6 changed components, and compared them line by line with both `.dc.html` files (including the `STATUS_TRACK` script block).
