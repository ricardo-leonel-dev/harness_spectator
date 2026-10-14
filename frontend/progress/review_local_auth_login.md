# Review — feature 6 (local_auth_login), round 1

**Verdict:** APPROVED

## Checkpoints

- C1: [x] I re-ran `./init.sh` myself: exit 0, `TOTAL: 96 SUCCESS`, `[OK] Verification command
  passed` (lint, prettier check, build, Karma). The warnings are environmental: `No tests/
  directory; fingerprint lint skipped` and `cannot reach http://localhost:3001 — skipping mirror
  sync` (the Docker mirror is down).
- C2: [x] Feature 6 is the only `in_progress` feature, and session 16 is the current one.
- C3: [x] The code respects the architecture.
  - `HarnessApiService` stays the only `HttpClient` caller. `getAuthMode()` and `loginLocal()`
    were added there.
  - No new dependency was added.
  - The Supabase client is resolved lazily (`injector.get(SUPABASE_CLIENT)` in
    `AuthService.supabase()`), so local mode never runs the factory.
  - There are no debug statements or TODOs. `grep` finds no `console.log`, `fit` or `fdescribe`
    in `src/`.
  - The handoff records that `frontend-design` was loaded.
  - The icons follow conventions: `LucideAngularModule.pick({ Coffee, Heart, Key, Mail })`, sized
    and coloured with Tailwind classes.
- C4: [x] Real tests exist for every changed source file. They are new `auth.service.spec.ts`,
  `auth.guard.spec.ts` and `auth.interceptor.spec.ts`, plus updated login-page, dashboard and
  project-selector specs.
  - Only the network boundary is stubbed: `HttpTestingController` and a fake Supabase client
    behind a counting factory. `HarnessApiService`, the guard, the interceptor and the router are
    real.
  - The POST method and body are asserted in `auth.service.spec.ts:253-254` and
    `login-page.component.spec.ts:469-470`. `httpTesting.verify()` in `afterEach` covers R3.
  - I ran the suite myself: 96/96.
- C5: [ ] This is expected. Session 16 stays open until the implementer runs `log-out` after this
  approval. The working tree holds only this feature's files. The repo-root `.DS_Store` and the
  backend changes are outside `frontend/`.
- C6: [x]
  - `specs/local_auth_login/{requirements,design,tasks}.md` exist.
  - R1 to R24 use EARS form with stable ids.
  - T1 to T22 are `[x]`, and each one has a matching diff.
  - I checked each R against the named test, not just the handoff table. Examples: R1 asserts
    exactly one GET with no `Authorization` header, and that `init()` stays unsettled until the
    flush. R5 and R17 assert `factoryCalls === 0`. R16 advances `Date.now` without firing the
    timer. R22 and R23 assert child order, `svg.lucide-coffee` and `svg.lucide-heart`, the heart
    at `rgb(232, 163, 61)`, `aria-hidden="true"` and the exact sr-only text. R24 compares the form
    `innerHTML` across both modes. Every R maps to at least one passing test.

## Live end-to-end evidence

Setup:
- Frontend: `http://192.168.1.8:4200` (dev server).
- Backend: `http://192.168.1.8:4000` in `AUTH_MODE=local`. `GET /api/auth/mode` returns
  `{"mode":"local"}`. The mirror schema is empty.
- Browser: headless Chrome 155, driven over CDP with a fresh `--user-data-dir`. The Chrome
  process was stopped afterwards.
- Script: `scratchpad/cdp-review-auth.mjs`. It reads the password from the scratchpad file and
  never prints it.

The same results held at 1440px and at 360px (DPR 2):

| Check | Result |
|---|---|
| Visit `/` with empty storage | Redirected to `/login?returnUrl=%2F`. |
| Footer, visible content | Children are `text:Made with`, `icon:coffee(svg)`, `text:and` and `icon:heart(svg)`. The wrapper has `aria-hidden="true"`. The text is uppercase in IBM Plex Mono. Both icons are 9.5×9.5 px. |
| Footer, colours | The heart has class `text-signal`, colour and SVG stroke `rgb(232, 163, 61)`. The coffee icon inherits `rgb(70, 80, 95)` (`text-faint`). |
| Footer, screen-reader text | The `.sr-only` text is exactly `Made with coffee and love`, with `position:absolute` and `width:1px`. "Secured by" is absent. |
| Horizontal overflow | None: `scrollWidth` equals `innerWidth` (1440 and 360). |
| Wrong password | The banner reads `[ERR] Invalid login credentials`, the same copy as supabase mode. The page stays on `/login`, and `harness.localSession` is absent. |
| Correct password | The app lands on `/` and shows the expected "No projects in the mirror yet" empty state and the "R" initial. `harness.localSession` holds `accessToken` (283 chars), `expiresAt` (about 3595 s ahead) and `email`. |
| Reload | Still on `/` and the key is still present. |
| Log out | Back on `/login` and the key is removed. Revisiting `/` redirects to `/login?returnUrl=%2F`. |
| Network | Only hosts `192.168.1.8:4200` and `192.168.1.8:4000` were contacted, so there was no request to any Supabase URL. The only "supabase" URLs are the dev server's own `@supabase_supabase-js.js` module chunk on `:4200`. `GET /api/auth/mode` and `POST /api/auth/login` carried no auth header. `GET /api/harness/projects` carried `Bearer <token>`. The CORS preflight (`OPTIONS`) for the POST passed. |

Screenshots are in `scratchpad/review-shots-auth/`:
- `w1440-1-login.png`
- `w1440-2-wrong-password.png`
- `w1440-3-dashboard.png`
- `w1440-4-after-reload.png`
- `w1440-5-after-logout.png`
- the matching `w360-*.png` set

## Implementer deviations: judgement

1. **Accepted: the baseline test leak was fixed in the dashboard spec `beforeEach`.** The change
   clears `harness.lastProject` and `harness.localSession`. It is test-only hygiene, and the
   handoff and session log record it. T1's "exit 0" was not met on the untouched tree, and that
   is documented honestly.
2. **Accepted: `project-selector.component.spec.ts` was edited.** It is a one-line mode flush,
   which R1 forces because that spec boots `AuthService`.
3. **Accepted: `getSession()` rejection maps to "no session".** This is required by design.md
   ("`init()` must never reject"). The catch is not empty, so it does not conflict with
   Principle 3.
4. **Accepted: leaving `unavailable` on retry runs the full startup branch.** That is
   `enterMode()`: supabase removes the key and subscribes, and local restores the session. It
   keeps R18 and R13 true after a late mode resolution, which is consistent with R21.
5. **Accepted: `logout()` in `unavailable` (or before init) clears locally.** It makes no
   Supabase call. Unavailable never holds a session (R20), so this is the safe choice and keeps
   R5's spirit.
6. **Accepted: the timer is cleared on `DestroyRef`.** This is test-safety only, and it is
   invisible at runtime because the root injector lives for the whole app.
7. **Accepted: the interceptor does not re-check expiry.** This matches the design's "Files to
   touch" row and its error table.
8. **Accepted: contract alignment.** I confirmed it live. The field names, the 401, Bearer use and
   CORS for the POST all work against the real backend.

## Required Changes

None.

## Non-blocking notes

- `docs/verification.md` Level 3 now has a local-mode variant. The live run above follows its
  steps 1 to 5. Step 6, stopping the backend, was not exercised live because the backend must
  stay up. It is covered by the R19 unit tests.
