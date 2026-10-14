# Requirements — local_auth_login

Context: today the login page always signs in through Supabase Auth (`supabase-js`
`signInWithPassword`), `AuthService` holds the Supabase session, `authGuard` lets `/` through when a
session exists, and `authInterceptor` attaches `Authorization: Bearer <access_token>`. The sibling
backend feature `local_auth_mode` (not implemented yet; an external dependency of this feature) adds
a runtime `AUTH_MODE` (`supabase` by default, or `local`) and, in local mode, a backend-issued HS256
token. This feature makes the frontend read that mode on startup and, in local mode, sign in against
the backend instead of Supabase while keeping the same session/guard/interceptor flow.

Backend contract consumed (see `design.md` § "Backend contract" for the assumptions to align):

- `GET {apiBaseUrl}/api/auth/mode` (public) → `200 {"mode": "supabase" | "local"}`.
- Local mode only: `POST {apiBaseUrl}/api/auth/login` with JSON `{"email", "password"}` →
  `200 {"accessToken": string, "expiresAt": number}` (`expiresAt` in unix seconds), or `401` with a
  generic JSON error on bad credentials. In supabase mode that route returns `404`.
- Protected routes accept `Authorization: Bearer <token>` in both modes.

Terms used below:

- **auth mode** — the value resolved from `GET /api/auth/mode`: `supabase`, `local`, or
  `unavailable` (the request failed, see R19).
- **local session** — `{ accessToken, expiresAt, email }` obtained from `POST /api/auth/login`.
- **storage key** — `localStorage` key `harness.localSession`.
- **expired** — `expiresAt * 1000 <= Date.now()`.

## Mode detection

## R1
WHEN the application starts, the system SHALL send exactly one `GET {apiBaseUrl}/api/auth/mode`
request and resolve the auth mode before the initial route's `authGuard` is evaluated.

## R2
WHEN the auth mode resolves to `supabase`, the system SHALL restore the session from the Supabase
client's `getSession()` and keep it updated through `onAuthStateChange`, as it does today.

## R3
WHILE the auth mode is `supabase`, WHEN the user submits a valid login form, the system SHALL sign in
with the Supabase client's `signInWithPassword` and SHALL NOT send `POST {apiBaseUrl}/api/auth/login`.

## R4
WHILE the auth mode is `supabase`, WHEN the user logs out, the system SHALL call the Supabase client's
`signOut()` and then navigate to `/login`.

## R5
WHILE the auth mode is `local`, the system SHALL NOT construct or call the Supabase client.

## Local sign-in

## R6
WHILE the auth mode is `local`, WHEN the user submits a valid login form, the system SHALL send
`POST {apiBaseUrl}/api/auth/login` with the JSON body `{"email": <email>, "password": <password>}`.

## R7
WHEN `POST /api/auth/login` returns `200` with a non-empty string `accessToken` and a numeric
`expiresAt` that is not expired, the system SHALL store `{ accessToken, expiresAt, email }` as JSON
under the storage key.

## R8
WHEN a local sign-in succeeds, the system SHALL navigate to `/`.

## R9
IF `POST /api/auth/login` returns `401` THEN the system SHALL show the existing `[ERR]` inline banner
with the text `Invalid login credentials` and SHALL stay on `/login`.

## R10
IF `POST /api/auth/login` fails with any status other than `401` (including a network error), or
returns `200` with a body that does not satisfy R7, THEN the system SHALL show the `[ERR]` inline
banner with the text `Sign-in failed: the backend returned an error or could not be reached.` and
SHALL NOT write the storage key.

## Local session use

## R11
WHILE a non-expired local session is held, the system SHALL attach
`Authorization: Bearer <accessToken>` to outgoing `HttpClient` requests.

## R12
WHILE a non-expired local session is held, `authGuard` SHALL allow navigation to `/`.

## R13
WHEN the application starts in local mode and the storage key holds a valid, non-expired local
session, the system SHALL restore it without asking the user to sign in again.

## R14
IF, at startup in local mode, the storage key holds a value that is not valid JSON, lacks a
non-empty string `accessToken` or a numeric `expiresAt`, or is expired, THEN the system SHALL remove
the storage key and start with no session.

## Expiry and logout

## R15
WHEN the held local session's `expiresAt` is reached while the application is running, the system
SHALL clear the session, remove the storage key, and navigate to `/login`.

## R16
IF `authGuard` is evaluated while the held local session is expired THEN the system SHALL redirect
to `/login` with the `returnUrl` query parameter set to the requested URL.

## R17
WHILE the auth mode is `local`, WHEN the user logs out, the system SHALL clear the session, remove
the storage key, and navigate to `/login` without calling the Supabase client or the backend.

## R18
WHILE the auth mode is `supabase`, the system SHALL remove the storage key at startup and SHALL NOT
attach a stored local token to any request.

## Mode request failure

## R19
IF `GET /api/auth/mode` returns a non-2xx status, fails at the network level, returns a body whose
`mode` is neither `supabase` nor `local`, or does not respond within 5000 ms, THEN the system SHALL
show the `[ERR]` inline banner on the login page with the text
`Cannot reach the backend to choose a sign-in method. Start the backend, then sign in.`

## R20
WHILE the auth mode is `unavailable`, `authGuard` SHALL redirect navigation to `/` to `/login`, even
when the storage key or the Supabase client holds a session.

## R21
WHILE the auth mode is `unavailable`, WHEN the user submits a valid login form, the system SHALL
request `GET /api/auth/mode` once more and, if it resolves, sign in through the flow of the resolved
mode (R3 or R6).

## Login page appearance

## R22
The login page footer SHALL render, in this order, the visible text `Made with`, the lucide `coffee`
icon, the visible text `and`, and the lucide `heart` icon.

## R23
The login page footer SHALL expose the text `Made with coffee and love` to assistive technology while
hiding its visible text and both icons from the accessibility tree.

## R24
The login page SHALL render the same elements, classes, placeholders, and copy, footer included, in
`local` mode as in `supabase` mode.
