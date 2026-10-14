# Design — local_auth_login

Follows `docs/architecture.md` (layers, dependency allowlist, error handling, state) and
`docs/conventions.md` (naming, Tailwind, tests). This file only records choices made inside those
boundaries. No new dependency is added.

## Dependency

Blocked on the backend feature `local_auth_mode`. Unit tests here stub the backend with
`HttpTestingController`, so the frontend can be implemented first, but the Level 3 manual smoke test
in local mode needs that backend feature merged.

## Backend contract (assumptions to align with the backend spec)

| # | Assumption | Why the frontend cares |
|---|---|---|
| A1 | `GET /api/auth/mode` is public and returns `200 {"mode": "supabase" \| "local"}`. | R1, R19 validate exactly this shape. |
| A2 | `POST /api/auth/login` returns `200 {"accessToken": string, "expiresAt": number}`, `expiresAt` in **unix seconds** (same unit as Supabase's `expires_at`). | R7, R10 and expiry handling. Field names are a proposal; if the backend picks others, only `LocalLoginResponse` and the R7 parser change. |
| A3 | Bad credentials → `401`; the body is not read (the frontend shows its own fixed copy). | R9. |
| A4 | In supabase mode `POST /api/auth/login` → `404`. | Treated as the generic failure (R10); only reachable on a mode mismatch. |
| A5 | The backend's CORS layer allows `POST` and the `Content-Type` header for the frontend origin. Today `backend/src/app.rs` only allows `GET`, so the JSON `POST` preflight would fail. | Without it every local sign-in hits R10. |
| A6 | No refresh endpoint: when the token expires the user signs in again. | R15/R16. |
| A7 | The token is stateless: logout needs no backend call. | R17. |

## Session model

`AuthService.session` changes from `Signal<Session | null>` (Supabase type) to a provider-neutral
signal. Both modes map into it, so the guard, interceptor and dashboard read one shape.

```ts
// src/app/auth/auth.service.ts
export type AuthMode = 'supabase' | 'local' | 'unavailable';

export interface AuthSession {
  accessToken: string;
  email: string | null;
  expiresAt: number | null; // unix seconds; null when Supabase omits expires_at
}

export const LOCAL_SESSION_STORAGE_KEY = 'harness.localSession';
export const MODE_REQUEST_TIMEOUT_MS = 5000;
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid login credentials';
export const LOCAL_SIGN_IN_FAILED_MESSAGE =
  'Sign-in failed: the backend returned an error or could not be reached.';
export const MODE_UNAVAILABLE_MESSAGE =
  'Cannot reach the backend to choose a sign-in method. Start the backend, then sign in.';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly mode: Signal<AuthMode | null>;        // null until init() settles
  readonly session: Signal<AuthSession | null>;
  init(): Promise<void>;                          // never rejects
  hasValidSession(): boolean;                     // used by authGuard
  login(email: string, password: string): Promise<LoginResult>;
  logout(router: Router): Promise<void>;
}
```

Supabase mapping: `{ accessToken: s.access_token, email: s.user?.email ?? null, expiresAt:
s.expires_at ?? null }`. Supabase-mode `hasValidSession()` stays `session() !== null` (supabase-js
refreshes tokens itself; adding an expiry check there would change today's behaviour). Local-mode
`hasValidSession()` also requires the session not to be expired (R16). `unavailable` always returns
`false` (R20).

## Files to touch

| File | Change |
|---|---|
| `src/app/core/harness-api.service.ts` | Add `getAuthMode(): Observable<AuthModeResponse>` (`GET /api/auth/mode`) and `loginLocal(email, password): Observable<LocalLoginResponse>` (`POST /api/auth/login`). Keeps Principle 1: this service stays the only `HttpClient` caller against the backend. |
| `src/app/auth/auth.service.ts` | Mode resolution, `AuthSession`, local login/restore/expiry/logout, lazy Supabase client (below). |
| `src/app/auth/auth.guard.ts` | `auth.session()` → `auth.hasValidSession()`. Redirect shape unchanged. |
| `src/app/core/auth.interceptor.ts` | `session.access_token` → `session.accessToken`. |
| `src/app/auth/login-page.component.ts` | Banner text = `errorMessage() ?? (mode() === 'unavailable' ? MODE_UNAVAILABLE_MESSAGE : null)` (R19). Footer content replaced with the fixed "Made with coffee and heart" line (R22, R23), identical in every mode (R24); `LucideAngularModule.pick({ Key, Mail })` becomes `pick({ Coffee, Heart, Key, Mail })`. No other markup/class changes. |
| `src/app/dashboard/dashboard-page.component.ts` | `userInitial`: `session?.user?.email` → `session?.email`. |
| `src/app/app.config.ts` | `provideAppInitializer(() => inject(AuthService).init())`. |
| `src/app/app.component.ts` | Drop the `ngOnInit` `init()` call (now in the initializer). |
| `src/app/auth/auth.service.spec.ts` (new), `src/app/auth/auth.guard.spec.ts` (new), `src/app/core/auth.interceptor.spec.ts` (new) | Tests, see "Test strategy". |
| `src/app/auth/login-page.component.spec.ts`, `src/app/dashboard/dashboard-page.component.spec.ts` | Add `provideHttpClient`/`provideHttpClientTesting` where missing and flush the mode request after `auth.init()`; add local-mode cases. |
| `docs/architecture.md` | Auth bullet, Principle 4 (second `localStorage` entry) and Data Flow gain the local-mode path. |
| `docs/verification.md` | Level 3 gains a local-mode smoke variant. |

## Mode resolution and startup

`init()`:

1. `firstValueFrom(api.getAuthMode().pipe(timeout(MODE_REQUEST_TIMEOUT_MS)))`; any error, timeout
   or a `mode` outside `supabase|local` → `mode = 'unavailable'`, no session, resolve (R19, R20).
2. `supabase` → remove the storage key (R18), resolve the Supabase client, then today's
   `onAuthStateChange` + `getSession()` (R2).
3. `local` → read and validate the storage key; valid and not expired → set session and arm the
   expiry timer (R13); otherwise remove it (R14).

Running `init()` from `provideAppInitializer` makes bootstrap wait for it, so the initial guard
evaluation sees the resolved mode and session (R1). `init()` must never reject, otherwise Angular
aborts bootstrap. The mode request passes through `authInterceptor` with no session, so it carries no
`Authorization` header.

## No Supabase traffic in local mode (R5)

`AuthService` stops injecting `SUPABASE_CLIENT` as a field. It injects `Injector` and calls
`injector.get(SUPABASE_CLIENT)` only on the supabase branches. The provider in `app.config.ts` is
already a `useFactory`, which Angular runs on first `get`, so in local mode `createClient` never
runs. That matters: constructing a `supabase-js` client restores any persisted Supabase session and
may refresh it over the network on its own.

## Local login

`login()` in local mode: `firstValueFrom(api.loginLocal(email, password))`.

- `HttpErrorResponse` with `status === 401` → `{ ok: false, error: INVALID_CREDENTIALS_MESSAGE }` (R9).
  The copy matches what Supabase returns today, so the page reads the same in both modes.
- Any other error, or a `200` body failing the R7 check → `{ ok: false, error:
  LOCAL_SIGN_IN_FAILED_MESSAGE }`, nothing stored (R10).
- Success → session `{ accessToken, expiresAt, email }` (email from the form; the backend response
  does not return it), write the storage key, arm the expiry timer, `{ ok: true }`. The page then
  navigates to `/` exactly as today (R8).

`login()` with `mode === 'unavailable'`: re-run step 1 of `init()` once; if it now resolves, continue
in that mode (R21), otherwise return `{ ok: false, error: MODE_UNAVAILABLE_MESSAGE }`.

## Expiry

- On setting a local session, `setTimeout` for `expiresAt * 1000 - Date.now()` ms. The delay is
  clamped to `2_147_483_647` (the max `setTimeout` delay; larger values fire immediately in
  browsers). When it fires, if the session is still not expired (clamped case), re-arm; otherwise
  clear the session, remove the key, and `router.navigate(['/login'])` (R15). `Router` is resolved
  through `Injector` at fire time.
- The timer can lag (laptop sleep). `authGuard` therefore also checks expiry through
  `hasValidSession()` (R16), so the next navigation is safe even if the timer has not fired yet.
- Logout and expiry both `clearTimeout` the pending timer.

## Logout

Local: clear the timer, clear the session, remove the key, `router.navigate(['/login'])`; no Supabase
or backend call (R17, A7). Supabase: unchanged `signOut()` then navigate (R4). The dashboard's
"Logging out…" overlay keeps working because `logout()` still returns a promise that settles after
navigation.

## Error paths

| Situation | Result |
|---|---|
| Mode request fails, times out or returns an unknown mode | `mode = 'unavailable'`, mode banner on `/login`, guard redirects (R19, R20). |
| Local login `401` | `[ERR] Invalid login credentials` (R9). |
| Local login other failure / malformed `200` | `[ERR] Sign-in failed: …` (R10). |
| Corrupt or expired stored session | Key removed, signed out (R14). |
| Protected request `401` while a local session is held | Not handled here: the dashboard shows its existing inline `[ERR]` banner, same as supabase mode today. |

`localStorage` read/write failures are not specially handled, matching how `supabase-js` is used
today.

## Test strategy

Per `docs/conventions.md` "Tests": stub only the network boundary. `HttpTestingController` for
`/api/auth/mode`, `/api/auth/login`, `/api/harness/projects` and `/api/harness/projects/{slug}/state`; a hand-written fake Supabase client
provided via `{ provide: SUPABASE_CLIENT, useFactory: () => { factoryCalls++; return fake; } }`, so
local-mode tests prove R5 by asserting `factoryCalls === 0`, and supabase-mode tests assert its
`signInWithPassword`/`signOut` calls. `localStorage` is cleared in `beforeEach`/`afterEach`. Expiry and
timeout tests use `fakeAsync` + `tick()` (`Date.now()` advances with `tick` inside `fakeAsync`).
`httpTesting.verify()` in `afterEach` proves no unexpected backend request (e.g. no `POST` in
supabase mode, R3).

Coverage grouping: R24 is covered by running the existing login-page visual assertions, the footer
assertions of R22/R23 included, once per mode (a parametrised `describe`), plus one comparison of the
login form's `innerHTML` rendered in `supabase` mode against the same render in `local` mode (they must
be equal), per `docs/specs.md` "Coverage granularity". R22 is asserted by the footer's child order
(text `Made with`, `lucide-icon[name="coffee"]`, text `and`, `lucide-icon[name="heart"]`) and by the
heart carrying `text-signal`. R23 is asserted by the `.sr-only` span's text being exactly
`Made with coffee and love` and the visible wrapper carrying `aria-hidden="true"`. R11 and R18 share
the interceptor spec.

## Visual direction

`frontend-design` was loaded for this spec. The brief pins the direction: the login page must look
identical in both modes, so there is no new layout, palette, type or motion. The visible changes are
the mode-unavailable banner copy and a new, mode-independent footer line:

- **Mode-unavailable banner:** reuses the existing `[ERR]` banner element and classes unchanged
  (`rounded border border-status-blocked/35 bg-status-blocked/[0.12] px-2.5 py-2 text-xs
  text-err-text`, `[ERR]` tag in `font-mono text-[10px] tracking-[0.08em] text-status-blocked`).
  Message text in `font-sans` (frontend-written prose).
- **Footer (R22, R23, R24):** replaces `Secured by Supabase Auth` in every mode. Keep the existing
  `<footer>` element and its classes (`mt-0.5 flex items-center justify-center font-mono text-[9.5px]
  uppercase tracking-[0.08em] text-faint`) — it stays an instrument-style caption, so it remains
  `font-mono` and uppercase (the DOM text stays `Made with` / `and`; the `uppercase` class does the
  casing). Markup:

  ```html
  <footer class="mt-0.5 flex items-center justify-center font-mono text-[9.5px] uppercase tracking-[0.08em] text-faint">
    <span class="inline-flex items-center gap-[0.5em]" aria-hidden="true" data-footer-visual>
      <span>Made with</span>
      <lucide-icon name="coffee" class="block h-[1em] w-[1em] text-current" />
      <span>and</span>
      <lucide-icon name="heart" class="block h-[1em] w-[1em] text-signal" />
    </span>
    <span class="sr-only">Made with coffee and love</span>
  </footer>
  ```

  - Icons are sized `h-[1em] w-[1em]` so they inherit the footer's 9.5px text size instead of a
    fixed pixel size; `gap-[0.5em]` scales the spacing the same way.
  - The coffee icon inherits the footer colour (`text-current` → `text-faint`); the heart uses the
    accent token `text-signal` (`#e8a33d`, the same amber as the beacon and the submit button). No
    fill — the outline heart matches the stroke-only coffee cup and the field icons.
  - Accessibility: the visible line is `aria-hidden="true"` because a screen reader would otherwise
    read "Made with and" (the icons have no text). The Tailwind `sr-only` span supplies the
    accessible equivalent `Made with coffee and love`. The footer is not a link and not focusable.
  - Icons registered per component via `LucideAngularModule.pick({ Coffee, Heart, Key, Mail })`, per
    `docs/conventions.md` "Icons".
- Interaction states (focus, disabled, spinner, "Signing in…") are unchanged in both modes. The
  footer has no hover, focus or motion.

UI copy introduced by this feature:

| Where | Text |
|---|---|
| Banner, local `401` | `Invalid login credentials` |
| Banner, other local failure | `Sign-in failed: the backend returned an error or could not be reached.` |
| Banner, mode unavailable | `Cannot reach the backend to choose a sign-in method. Start the backend, then sign in.` |
| Footer, visible (every mode) | `Made with` [coffee icon] `and` [heart icon] |
| Footer, screen-reader text (every mode) | `Made with coffee and love` |

The previous footer copy `Secured by Supabase Auth` is removed. A mode-dependent footer
(`Secured by local auth` in local mode) was considered and dropped by human decision: the footer no
longer names an auth provider, so it is true in both modes and the page stays identical (R24).

## Discarded alternatives

1. **Build-time `AUTH_MODE` in `environment.ts`.** Rejected: it creates a second source of truth that
   can disagree with the backend's runtime `AUTH_MODE`, and switching modes would need a frontend
   rebuild. The acceptance criteria require reading `GET /api/auth/mode`.
2. **Fall back to supabase mode when the mode request fails.** Rejected: in a local deployment this
   would build the Supabase client (network traffic, R5) and send the user's credentials to the wrong
   provider, with a confusing error. Failing closed with a clear banner is safer. It also has little
   cost, since the dashboard is useless without the backend anyway. Trade-off: with the backend down,
   a supabase-mode user with a persisted session now lands on `/login` instead of a dashboard error
   banner.
3. **A strategy interface (`AuthProvider`) with `SupabaseAuthProvider` and `LocalAuthProvider`
   classes behind a token.** Rejected for surface: there are two branches in three methods, all
   consumers already depend on `AuthService`, and the abstraction would add an injection token and
   two classes to the `auth/` layer without removing any branching from the consumers.
4. **Wrap the local token in a synthetic Supabase `Session`.** Rejected: it would invent `user`,
   `refresh_token` and similar fields just to fit a type, and keep supabase-js types leaking into the
   guard, interceptor and dashboard.
5. **Async `authGuard` waiting on an `auth.ready` promise instead of an app initializer.** Rejected:
   the interceptor and the dashboard also read the session synchronously. A single bootstrap gate
   covers every consumer.
6. **Keep the local token in memory or `sessionStorage` only.** Rejected: a reload or a new tab would
   force a new sign-in, unlike supabase mode, which persists in `localStorage` (Principle 4). The XSS
   exposure is the same one `supabase-js` already accepts.
7. **Mode-dependent footer (`Secured by local auth` in local mode, `Secured by Supabase Auth`
   otherwise).** Rejected by human decision during spec review: it made the login page differ between
   modes. The provider-neutral "Made with coffee and heart" line is accurate in every mode.
8. **`aria-label` on the `<footer>` with the icons `aria-hidden`.** Rejected: `aria-label` on a
   non-landmark/generic element is not reliably announced (a `<footer>` inside a `<form>` has no
   `contentinfo` role), so screen readers could skip it or still read the visible words. A
   `sr-only` text node is read consistently.
