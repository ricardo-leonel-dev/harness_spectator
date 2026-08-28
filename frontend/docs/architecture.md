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
- **Data:** this frontend never reaches a database. All harness state arrives as JSON from the
  backend's `GET /api/harness/state`.

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
   - `src/app/dashboard/` — components that render harness state (features table, open
     session card, blocked features card) fetched via `src/app/core/`.
   - `src/app/core/` — the `HarnessApiService` (the only place that calls Angular's
     `HttpClient` against the backend) and the `authInterceptor` that attaches the Supabase access
     token as `Authorization: Bearer <token>` to outgoing requests.
   Don't let implementers introduce additional top-level layers without updating this file first.
2. **Dependencies.** Approved allowlist, not "anything goes":
   - Runtime: `@angular/core`, `@angular/common`, `@angular/router`, `@angular/forms`,
     `@angular/common/http`, `@supabase/supabase-js`, `rxjs`.
   - Dev: `@angular/cli`, `@angular-devkit/build-angular`, `typescript`, `eslint` +
     `typescript-eslint` + `angular-eslint`, `prettier`, `karma`, `karma-chrome-launcher`,
     `jasmine-core`, `@types/jasmine`.
   - No UI component library, no CSS framework, no state-management library beyond Angular signals
     + `AuthService`/`HarnessApiService`. Adding a dependency outside this list requires updating
     this file first, in the same spirit as the layers rule above.
3. **Error handling.** Every `HttpClient` call's error path is surfaced in the UI (a visible inline
   message) — no empty `catch`/unhandled `error` callback, no error logged to the console and
   otherwise ignored.
4. **State/mutability.** Component state via Angular signals; the only cross-cutting mutable state
   is `AuthService`'s session signal (backed by the Supabase client's own session persistence in
   `localStorage`, which `@supabase/supabase-js` manages). No other global mutable singletons.

## Data Flow

```
browser
  -> supabase-js signInWithPassword(email, password)     (src/app/auth/)
  -> Supabase Auth (GoTrue, hosted)
  <- session { access_token, ... }                        (persisted by supabase-js)

browser
  -> HttpClient request, authInterceptor adds
     Authorization: Bearer <access_token>                 (src/app/core/)
  -> backend GET /api/harness/state                       (separate project/process)
  <- JSON response
  -> HarnessApiService
  -> Angular components (src/app/dashboard/)
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
- Do not add a UI component library or CSS framework (see the dependency allowlist above).
