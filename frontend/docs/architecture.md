# Architecture — What does "doing a good job" mean here?

> This document defines the quality bar for this project. The reviewer agent
> evaluates code against this file. If it's not here, it's not a requirement.

> **Scope note.** This project is the **Angular frontend** of a two-process application. Until the
> harness was split into independent per-stack installations, this document described both stacks at
> once; the Rust + Axum backend's layers, dependency allowlist, error envelope and Postgres rules
> now live in the sibling backend project's own `docs/architecture.md`. Decisions that genuinely
> span the boundary (the two-process split itself, Supabase Auth, the HTTP contract) are stated here
> from the frontend's side and restated there from the backend's.

## Stack decision (feature 1: `scaffold_frontend_stack`)

This is a browser SPA that talks to a **separate backend API**, deliberately not merged into one
fullstack framework — the SPA only ever talks to the backend over HTTP, never touches a database or
the filesystem directly.

- **This project:** Angular (TypeScript, standalone components).
- **Backend:** Rust + Axum, a separate project and a separately startable process.
- **Auth:** Supabase Auth (email/password via Supabase's GoTrue). This frontend uses the
  `@supabase/supabase-js` client to perform the login flow and holds the resulting session; the
  backend does not issue or store any session of its own — it verifies the Supabase-issued JWT
  (sent as a `Bearer` token) on every protected route.
  **Local mode (feature 6: `local_auth_login`).** The backend exposes a runtime `AUTH_MODE` through
  the public `GET /api/auth/mode` (`supabase` by default, or `local`). `AuthService.init()` runs from
  `provideAppInitializer`, so the mode is resolved before the first guard evaluation. In `local`
  mode the login form posts to `POST /api/auth/login`, which returns a backend-issued HS256 token
  (`{ accessToken, expiresAt }`); the Supabase client is never constructed (it is resolved lazily
  through the `Injector` on supabase branches only). If the mode request fails, times out (5 s) or
  returns an unknown mode, the app fails closed (`unavailable`): the guard redirects to `/login`,
  the login page shows an `[ERR]` banner, and the next submit retries the mode request once. The
  guard, interceptor and dashboard read one provider-neutral `AuthSession`
  (`{ accessToken, email, expiresAt }`) in both modes.
- **Data:** this frontend never reaches a database. All harness state arrives as JSON from the
  backend: the project list from `GET /api/harness/projects`, the cross-project overview from
  `GET /api/harness/dashboard` (rendered at `/`), one project's state from
  `GET /api/harness/projects/{slug}/state` (rendered at the `/projects/:slug` route), and one
  feature's process log from `GET /api/harness/projects/{slug}/features/{name}/log` (rendered in
  the Process log card when `?feature=<name>` selects a row; feature 7: `feature_process_log_panel`).

### Why Angular over React/Vue (discarded alternative)

Angular ships routing, HTTP client, forms, and a CLI-driven build/test toolchain as one first-party,
versioned unit, so there is no separate ecosystem decision to make for router/HTTP/test-runner the
way there would be with React (which requires picking `react-router`, a data-fetching library, a
build tool, and a test runner independently). For a single small SPA maintained mostly by agents,
one first-party toolchain that only has one way to do each of those things reduces the number of
independent conventions to hold consistent (see `docs/conventions.md`'s "extreme homogeneity"
principle). Rejected React/Vue for requiring that extra ecosystem-assembly step, not for any
technical shortcoming of either.

### Why Supabase Auth over custom JWT/cookie auth (discarded alternative)

An earlier draft chose backend-issued credentials (a single configured admin user) with a
self-signed JWT in an httpOnly cookie, reasoning that this is a single-operator tool with no need
for a full identity provider. That draft was discarded: hand-rolling credential storage (password
hashing, JWT signing/rotation, cookie handling) is exactly the kind of security-sensitive code this
project should not maintain itself when a managed provider already does it correctly, and Supabase
Auth is required regardless for the separately-planned Supabase Postgres migration — using it for
auth now means this frontend's login flow never needs to change when that migration happens.
Rejected self-signed JWT/cookie auth because it re-implements a solved problem for no benefit once
Supabase is already the target data platform.

## Principles

1. **Layers.**
   - `src/app/auth/` — the Supabase client wrapper, the login page, the `AuthService`
     (Angular signal-based session state), and the functional `authGuard` that gates the
     harness-state dashboard behind a valid Supabase session.
   - `src/app/dashboard/` — components that render harness state (features table with
     selectable rows, open session card, blocked features card, process log card with its
     nested agent usage section, the cross-project progress overview at `/`, and the
     dashboard-level agent usage cards block nested inside that overview) fetched via
     `src/app/core/`.
   - `src/app/core/` — the `HarnessApiService` (the only place that calls Angular's
     `HttpClient` against the backend) and the `authInterceptor` that attaches the Supabase access
     token as `Authorization: Bearer <token>` to outgoing requests and signs the user out
     app-wide on any non-login 401 (see "401 rule" under Principles).
   Don't let implementers introduce additional top-level layers without updating this file first.

   **401 rule.** `authGuard` only sees the local session before routing, so an expired or revoked
   token surfaces as a 401 on an API call. To keep every API path consistent, the interceptor owns
   the app-wide response: when an HTTP request whose URL is **not** `POST /api/auth/login` fails
   with status 401, the interceptor first captures the current router URL as `returnUrl`, then
   asks `AuthService.endSession()` to clear the local session and (when the failure was not on
   `/login`) navigates to `/login` with `returnUrl` as a query parameter. The original
   `HttpErrorResponse` is always re-emitted to the caller so each component still owns its error
   rendering (e.g. the progress overview suppresses its `[ERR]` banner on 401, since the
   interceptor is already redirecting). The local login 401 is exempt because it means "wrong
   password", which the login form renders as a `[ERR]` inline message itself.
2. **Dependencies.** Approved allowlist, not "anything goes":
   - Runtime: `@angular/core`, `@angular/common`, `@angular/router`, `@angular/forms`,
     `@angular/common/http`, `@angular/animations`, `@angular/cdk`, `@supabase/supabase-js`,
     `@swimlane/ngx-charts`, `rxjs`, `lucide-angular`, `@fontsource/ibm-plex-sans`,
     `@fontsource/ibm-plex-mono`.
   - Dev: `@angular/cli`, `@angular-devkit/build-angular`, `typescript`, `eslint` +
     `typescript-eslint` + `angular-eslint`, `prettier`, `karma`, `karma-chrome-launcher`,
     `jasmine-core`, `@types/jasmine`, `tailwindcss`, `postcss`, `autoprefixer`.
   - No state-management library beyond Angular signals + `AuthService`/`HarnessApiService`. No
     prebuilt UI component library — `@angular/material` and equivalents are rejected; `@angular/cdk`
     is the one exception, used only for its unstyled behavior primitives (overlay positioning,
     focus-trap, a11y, drag-drop), never for a themed/pre-styled component. Every visible component
     is hand-built and styled with Tailwind utility classes (see `docs/conventions.md`).
     `@swimlane/ngx-charts` is the one library used for chart rendering inside the progress
     overview and its agent usage block (gauge, doughnut, stacked horizontal bars, plus the
     model and ranking horizontal bar charts) — its modules are imported only by that overview
     (and, transitively, the agent usage block it renders), with chart data passed as ordinary
     typed objects and chart chrome restyled via Tailwind arbitrary variants and one tooltip
     block in `src/styles.css`.
   - **Offline-first.** No dependency, asset, `<link>`, or `<script>` may reach an external CDN at
     runtime — no Google Fonts, no cdnjs/unpkg/jsdelivr, no icon-font service. This app must render
     correctly with zero internet access (aside from its own Supabase Auth / backend API calls,
     which are the point). Fonts and icons ship inside the app bundle instead: `@fontsource/ibm-plex-sans`
     + `@fontsource/ibm-plex-mono` for self-hosted `.woff2` files, `lucide-angular` for inline SVG
     icons — see Principle 5.
   - Adding a dependency outside this list requires updating this file first, in the same spirit as
     the layers rule above.
3. **Error handling.** Every `HttpClient` call's error path is surfaced in the UI (a visible inline
   message) — no empty `catch`/unhandled `error` callback, no error logged to the console and
   otherwise ignored.
4. **State/mutability.** Component state via Angular signals; the only cross-cutting mutable state
   is `AuthService`'s mode and session signals. In supabase mode the session is backed by the
   Supabase client's own persistence in `localStorage`, which `@supabase/supabase-js` manages; in
   local mode it is backed by one `localStorage` entry, `harness.localSession`
   (`{ accessToken, expiresAt, email }`), which `AuthService` validates on startup, clears on
   logout or expiry, and removes at startup in supabase mode. No other global mutable singletons.
5. **Visual design.** This app renders with no prebuilt component library and no external network
   dependency for its own look:
   - **Styling:** Tailwind CSS utility classes are the only styling mechanism (see
     `docs/conventions.md`) — no separate CSS framework, no themed component library beyond
     `@angular/cdk`'s unstyled behavior primitives.
   - **Icons:** `lucide-angular`, rendered as inline SVG. Never an icon font, never an
     `<img src="https://...">` to an icon CDN.
   - **Typography:** a deliberate pairing of self-hosted Plex-family faces — `@fontsource/ibm-plex-sans`
     for UI chrome, `@fontsource/ibm-plex-mono` for anything that's literally a harness data value
     (feature/agent identifiers, timestamps, status labels) — chosen because the subject is a console
     for observing coding agents, not decoration. Their `.woff2` files ship inside the app bundle and
     are never fetched from Google Fonts or any other CDN at runtime.
   - Since there's no component library's defaults to fall back on, every visual decision here is
     either deliberate or it's generic. The `frontend-design` skill is **mandatory, not advisory**:
     before any markup or styles are written or reshaped in `src/app/auth/` or `src/app/dashboard/`
     — a new component, a layout change, a visual tweak, or a restyle of an existing one — invoke
     Claude Code's `frontend-design` skill for aesthetic direction, typography, and layout choices.
     The skill is invoked at the **start** of any work that touches these directories, not
     retroactively after the design has already settled. The reviewer agent treats a default or
     generic layout as a rejected review (see "What NOT to do" below), not a style nitpick —
     invoking the skill is what produces a design that survives review.

## Data Flow

```
browser
  -> supabase-js signInWithPassword(email, password)     (src/app/auth/)
  -> Supabase Auth (GoTrue, hosted)
  <- session { access_token, ... }                        (persisted by supabase-js)

browser (startup, before the first route)
  -> backend GET /api/auth/mode                           (public, 5 s timeout)
  <- { mode: "supabase" | "local" }                       (anything else -> "unavailable")

browser (local mode only, instead of supabase-js)
  -> backend POST /api/auth/login { email, password }     (src/app/core/ via src/app/auth/)
  <- { accessToken, expiresAt }                           (persisted as harness.localSession)

browser
  -> HttpClient request, authInterceptor adds
     Authorization: Bearer <accessToken>                  (src/app/core/, either mode)
  -> backend GET /api/harness/projects                    (separate project/process)
          GET /api/harness/dashboard                       (cross-project overview at /)
          GET /api/harness/projects/{slug}/state
          GET /api/harness/projects/{slug}/features/{name}/log
          GET /api/harness/projects/{slug}/features/{name}/agent-usage
  <- JSON response
  -> HarnessApiService
  -> Angular components (src/app/dashboard/)
  <- non-login 401: authInterceptor ends the session and navigates
                    to /login?returnUrl=<current router URL>
```

The Supabase project is configured via `SUPABASE_URL`/`SUPABASE_ANON_KEY`; the backend's base URL
via `API_BASE_URL`. All three are supplied through an untracked `.env` (see `.env.example`) and
written into the gitignored `src/environments/environment.ts` by `scripts/write-env.mjs`.

## What NOT to do

- Do not call Postgres (or read a `harness.db`/`state/` directory in any other way) from this
  project — all data access goes through the backend HTTP API. The only direct external dependency
  is Supabase Auth (via `supabase-js`), never a database.
- Do not merge this frontend into the backend's framework/process — they must remain two
  independently startable processes (`npm start` here, `cargo run` there).
- Do not implement self-service signup, password reset, or multi-user account management — creating
  the one Supabase user is an out-of-band setup step, not application code.
- Do not commit `SUPABASE_ANON_KEY` or any other secret — they are supplied via untracked `.env`
  files (see `.env.example`), consistent with `harness.db` already being gitignored for similar
  reasons.
- Do not add a prebuilt UI component library (`@angular/material` and equivalents) or a second CSS
  framework alongside Tailwind (see the dependency allowlist above). `@angular/cdk` is the one
  exception, for unstyled behavior primitives only.
- Do not reference any external CDN — no Google Fonts `<link>`, no icon-font service, no
  `<script src="https://...">` of any kind. Fonts (`@fontsource/ibm-plex-sans` +
  `@fontsource/ibm-plex-mono`) and icons (`lucide-angular`) must ship inside the app bundle; this app
  has to work with zero internet access at runtime, aside from its own Supabase Auth / backend API
  calls.
- Do not write or reshape UI markup/styles in `src/app/auth/` or `src/app/dashboard/` without first
  invoking the `frontend-design` skill (Principle 5), and do not invoke it after the design has
  already settled — invocation happens at the start, before any markup or CSS is written. A
  default/generic layout is a rejected review, not a style nitpick.
