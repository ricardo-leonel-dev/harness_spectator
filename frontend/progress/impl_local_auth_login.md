# Implementation handoff: local_auth_login (feature 6, sdd=1)

## Outcome

Ready for review. All tasks T1 to T22 are checked off in `specs/local_auth_login/tasks.md`.
`./init.sh` exits 0 and Karma reports **96 SUCCESS, 0 FAILED**. The suite was green twice in a row
before the init run, so the result is stable.

## Scope (files)

Production:
- `src/app/core/harness-api.service.ts`: adds `AuthModeResponse`, `LocalLoginResponse`, `getAuthMode()`
  (`GET /api/auth/mode`) and `loginLocal()` (`POST /api/auth/login`). (T2)
- `src/app/auth/auth.service.ts`: adds `AuthMode`, the provider-neutral `AuthSession` and the
  exported constants. `init()` resolves the mode with a 5000 ms `timeout` and never rejects. Also:
  supabase/local startup branches, `hasValidSession()`, mode-dependent `login()` and `logout()`,
  the clamped expiry timer, and lazy `Injector.get(SUPABASE_CLIENT)`. (T3 to T6, T8 to T11)
- `src/app/auth/auth.guard.ts`: uses `auth.hasValidSession()`. (T9)
- `src/app/core/auth.interceptor.ts`: uses `session.accessToken`. (T3)
- `src/app/dashboard/dashboard-page.component.ts`: `userInitial` reads `session?.email`. (T3)
- `src/app/app.config.ts`: `provideAppInitializer(() => inject(AuthService).init())`.
  `src/app/app.component.ts` no longer calls `init()` in `ngOnInit`. (T7)
- `src/app/auth/login-page.component.ts`: `bannerMessage = errorMessage() ?? (mode()==='unavailable' ?
  MODE_UNAVAILABLE_MESSAGE : null)`. The footer markup is replaced verbatim from the design.md
  "Visual direction" section, and the icon pick is now `{ Coffee, Heart, Key, Mail }`. No other markup
  or class changes. (T12)

Tests:
- New: `src/app/auth/auth.service.spec.ts`, `src/app/auth/auth.guard.spec.ts`,
  `src/app/core/auth.interceptor.spec.ts`.
- Updated: `src/app/auth/login-page.component.spec.ts` (HttpTestingController, factory-counting fake,
  appearance tests parametrised over both modes, plus local, supabase and unavailable blocks),
  `src/app/dashboard/dashboard-page.component.spec.ts` (`boot()` flushes the mode, plus a new
  local-mode case), and `src/app/dashboard/project-selector.component.spec.ts` (flushes the mode).

Docs (T21): `docs/architecture.md` (Auth bullet, Principle 4, Data Flow) and
`docs/verification.md` (Level 3 local-mode variant).

## Visual decisions

I loaded `frontend-design` before touching `src/app/auth/`. The approved design.md "Visual
direction" pins the change, so I followed it as written:
- The footer markup and classes are exact.
- The heart uses `text-signal` (asserted as `rgb(232, 163, 61)`).
- The `sr-only` span reads "Made with coffee and love".
- The mode-unavailable message reuses the existing `[ERR]` banner element.

There is no new layout, palette, type or motion.

## Traceability (R → test)

Abbreviations: AS = `src/app/auth/auth.service.spec.ts`, AG = `src/app/auth/auth.guard.spec.ts`,
AI = `src/app/core/auth.interceptor.spec.ts`, LP = `src/app/auth/login-page.component.spec.ts`,
DP = `src/app/dashboard/dashboard-page.component.spec.ts`.

| R | Test(s) |
|---|---|
| R1 | AS "sends exactly one unauthenticated GET /api/auth/mode and settles only after it resolves (R1)". The `provideAppInitializer` wiring is in `app.config.ts`. |
| R2 | AS "restores the Supabase session and follows onAuthStateChange in supabase mode (R2)" |
| R3 | AS "signs in through Supabase in supabase mode and never posts to the backend (R3)"; LP "supabase mode › signs in with Supabase, never posts to the backend, and renders the dashboard (R3)" |
| R4 | AS "signs out of Supabase and lands on /login in supabase mode (R4)"; DP "signs out and returns to the login page" |
| R5 | AS "clears the local session with no Supabase or backend call in local mode (R5, R17)"; LP "local mode › posts the credentials, stores the session and navigates to / without Supabase (R5, R6, R7, R8)"; DP "in local mode, uses the stored token and email and logs out without Supabase". Each asserts `factoryCalls === 0`. |
| R6 | LP "local mode › posts the credentials… (R5, R6, R7, R8)"; AS "stores and holds the backend-issued session in local mode (R6, R7)" |
| R7 | same two tests (exact stored JSON) |
| R8 | LP "local mode › posts the credentials…" (`router.url === '/'`) |
| R9 | LP "local mode › shows \"Invalid login credentials\" on 401 and stays on /login (R9)"; AS "maps 401 and other failures… (R9, R10)" |
| R10 | LP "local mode › shows the generic sign-in failure and stores nothing on {a 500, a 404, a network error, a 200 without accessToken, a 200 with an empty accessToken, a 200 with a string expiresAt, a 200 that is already expired} (R10)" |
| R11 | AI "attaches the restored local token as a Bearer header (R11)" and "attaches the token issued by a local sign-in (R11)"; DP local-mode case |
| R12 | AG "allows / while a non-expired local session is held (R12)" |
| R13 | AS "restores a valid stored session without signing in again (R13)"; DP local-mode case |
| R14 | AS "removes the key and starts signed out when the stored value is {not JSON, JSON null, missing accessToken, an empty accessToken, a string expiresAt, an expired session} (R14)" |
| R15 | AS "clears the session, removes the key and navigates to /login when expiresAt is reached (R15)"; AS "re-arms the timer when expiresAt is beyond the maximum setTimeout delay (R15)" |
| R16 | AG "redirects to /login with returnUrl once the held local session has expired (R16)" (timer not yet fired; `Date.now` advanced) |
| R17 | AS "clears the local session with no Supabase or backend call in local mode (R5, R17)"; DP local-mode case |
| R18 | AS "removes a stored local session at startup in supabase mode (R18)"; AI "never attaches a stored local token in supabase mode (R18)" |
| R19 | AS "resolves to unavailable on {a non-2xx status, a network error, an unknown mode, a body without mode} and never rejects (R19)"; AS "resolves to unavailable when the mode request does not answer within 5000 ms (R19)"; LP "mode unavailable › shows the mode-unavailable [ERR] banner on the login page (R19)" |
| R20 | AG "redirects / to /login while the mode is unavailable, even with a stored session (R20)"; AG "redirects while unavailable even when the Supabase client holds a session (R20)" |
| R21 | LP "mode unavailable › re-requests the mode on submit and signs in locally once it resolves (R21)", "…signs in with Supabase once it resolves (R21)", "keeps the mode-unavailable banner when the retry fails too (R19, R21)"; AS "re-requests the mode once on submit while unavailable and reports it if still down (R21)" |
| R22 | LP "appearance in {supabase,local} mode › closes with a mono uppercase \"Made with [coffee] and [heart]\" footer and a spoken equivalent (R22, R23)" |
| R23 | same test (`aria-hidden="true"` on the visible wrapper; `.sr-only` text exactly `Made with coffee and love`) |
| R24 | LP "renders an identical login form in supabase and local mode (R24)" (form `innerHTML` equal), plus every "appearance in {mode} mode" test run once per mode |

## Deviations / notes for the reviewer

1. **Pre-existing baseline failure (T1).** On the untouched tree, lint and build passed, but tests
   were 42/43. The failure was DashboardPageComponent "unknown project … does not remember the
   slug": `harness.lastProject` had leaked as `demo-project` from an earlier test. The dashboard
   spec's `beforeEach` now also clears that key (and `harness.localSession`). That is a test-only
   change, logged in the session.
2. `project-selector.component.spec.ts` is not in the design's files table. It boots `AuthService`,
   so it must flush the new mode request (a one-line change that R1 forces).
3. `getSession()` rejection in supabase mode is caught and mapped to "no session". This guarantees
   design's "init() must never reject".
4. Leaving `unavailable` by retry runs the full startup branch for the resolved mode before signing
   in. In supabase mode that means removing the key, subscribing and calling `getSession`. In local
   mode it means restoring the stored session.
5. `logout()` in `unavailable` (or before init) follows the local path: clear, then navigate. It
   makes no Supabase call.
6. The expiry timer is also cleared when the root injector is destroyed (`DestroyRef`), so TestBed
   resets do not leak timers.
7. The interceptor only switches field names, as the design says. It does not re-check expiry: a
   lagging timer could attach an expired token once, and the backend's 401 then surfaces as the
   dashboard's existing `[ERR]` banner, as the design.md error table describes.
8. Backend contract checked against `../backend/specs/local_auth_mode`:
   - `accessToken`/`expiresAt` (unix seconds), `401 {"error":"unauthorized"}`, a 404 for login in
     supabase mode, and POST plus Content-Type in CORS all match A1 to A5.
   - The backend returns `400` for a malformed body, and the frontend maps it to the generic R10 copy.
   - No real backend is called in tests.

## Verification

- `./init.sh` exits 0, `[OK] Verification command passed` (lint + prettier check + build + Karma
  96 SUCCESS).
- WARN lines (environmental, non-blocking):
  - `[WARN] tests directory '.../frontend/tests' not found; skipping fingerprint lint`
  - `[WARN]  No tests/ directory; fingerprint lint skipped`
  - `[WARN]  cannot reach http://localhost:3001 — skipping mirror sync`
- I did not run the Level 3 local-mode smoke test. It needs the backend `local_auth_mode` feature
  merged and running.
