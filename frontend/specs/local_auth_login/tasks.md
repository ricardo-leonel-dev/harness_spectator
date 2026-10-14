# Tasks — local_auth_login

Ordered; check off `[x]` as completed. See `design.md` for signatures, constants, error paths and the
test strategy each task refers to. Invoke the `frontend-design` skill before touching
`src/app/auth/login-page.component.ts` or `src/app/dashboard/` (`docs/architecture.md` Principle 5),
even though the visual direction is "unchanged".

## Baseline

- [x] T1 Run the verify command (`docs/verification.md` Level 1) on the untouched tree and confirm
      exit 0, so later failures are attributable to this feature.

## API and session model

- [x] T2 (R1, R6) Add `AuthModeResponse`, `LocalLoginResponse`, `getAuthMode()` and `loginLocal()` to
      `src/app/core/harness-api.service.ts`.
- [x] T3 (R2, R11, R12) Introduce `AuthMode`, `AuthSession` and the exported constants in
      `auth.service.ts`; map the Supabase session into `AuthSession`; update `authInterceptor`
      (`accessToken`) and the dashboard's `userInitial` (`session?.email`).
- [x] T4 (R5) Replace the `SUPABASE_CLIENT` field injection in `AuthService` with lazy
      `Injector.get(SUPABASE_CLIENT)` on supabase branches only.

## Mode resolution and startup

- [x] T5 (R1, R2, R18, R19, R20) Implement `init()` mode resolution with `timeout(MODE_REQUEST_TIMEOUT_MS)`,
      unknown-mode handling, `unavailable` state, and storage-key removal in supabase mode; make
      `init()` never reject.
- [x] T6 (R13, R14) Implement local-session restore and validation from `harness.localSession`.
- [x] T7 (R1) Register `provideAppInitializer(() => inject(AuthService).init())` in `app.config.ts`
      and remove the `ngOnInit` call from `AppComponent`.

## Local sign-in, guard, expiry, logout

- [x] T8 (R3, R6, R7, R8, R9, R10, R21) Implement mode-dependent `login()`: supabase branch unchanged;
      local branch with 401 / other-failure / malformed-body mapping and storage write; the
      `unavailable` branch re-requests the mode once.
- [x] T9 (R12, R16, R20) Add `hasValidSession()` and switch `authGuard` to it.
- [x] T10 (R15) Add the clamped expiry timer (arm on set, re-arm when clamped, clear on logout and
      expiry, navigate to `/login` on expiry).
- [x] T11 (R4, R17) Implement mode-dependent `logout()`.

## Login page

- [x] T12 (R19, R22, R23, R24) In `login-page.component.ts`, drive the banner text from
      `errorMessage()` or the mode-unavailable message; replace the footer's `Secured by Supabase Auth`
      with the fixed "Made with [coffee] and [heart]" markup from `design.md` § "Visual direction"
      (visible line `aria-hidden="true"`, `sr-only` text `Made with coffee and love`, heart
      `text-signal`, icons `h-[1em] w-[1em]`), independent of `mode()`; extend the icon pick to
      `{ Coffee, Heart, Key, Mail }`. No other markup or class changes.

## Tests

- [x] T13 (R1, R2, R5, R13, R14, R18, R19) New `src/app/auth/auth.service.spec.ts`: one mode request
      per `init()`; supabase restore via fake client; `factoryCalls === 0` in local mode across
      init/login/logout; valid/expired/corrupt stored session; key removed in supabase mode; non-2xx,
      network error, unknown mode, and a 5000 ms timeout (`fakeAsync`) → `unavailable`.
- [x] T14 (R6, R7, R8, R9, R10, R21) Login-page spec, local-mode block: POST body, stored JSON,
      navigation to `/`, 401 banner text, 500/network/malformed-body banner text with no key written,
      and mode retry on submit after an initial mode failure.
- [x] T15 (R3, R4) Supabase-mode cases: existing login-page/dashboard specs updated to flush
      `{"mode":"supabase"}`; `httpTesting.verify()` proves no `POST /api/auth/login`; logout still
      calls `signOut()` once and lands on `/login`.
- [x] T16 (R12, R16, R20) New `src/app/auth/auth.guard.spec.ts`: allows a valid local session;
      redirects an expired local session to `/login?returnUrl=…`; redirects in `unavailable` even with
      a stored session.
- [x] T17 (R11, R18) New `src/app/core/auth.interceptor.spec.ts`: Bearer header from a local session;
      no header in supabase mode when only a stored local session exists.
- [x] T18 (R15) Expiry timer test (`fakeAsync`): session cleared, key removed, router at `/login`
      after `tick` past `expiresAt`.
- [x] T19 (R17) Local logout test: key removed, session null, router at `/login`, no Supabase
      factory call and no HTTP request.
- [x] T20 (R19, R22, R23, R24) Parametrise the existing login-page appearance assertions over both
      modes, footer included: footer children in order `Made with`, `lucide-icon[name="coffee"]`,
      `and`, `lucide-icon[name="heart"]` with `text-signal`; visible wrapper `aria-hidden="true"`;
      `.sr-only` text exactly `Made with coffee and love`; no `Secured by` text. Add one test that the
      login form's `innerHTML` is equal in `supabase` and `local` mode. Assert the mode-unavailable
      banner text.

## Docs and verification

- [x] T21 (R1, R6) Update `docs/architecture.md` (auth bullet, Principle 4, Data Flow) and add a
      local-mode variant to `docs/verification.md` Level 3.
- [x] T22 Run the verify command and record the R-to-test traceability in
      `progress/impl_local_auth_login.md`.
