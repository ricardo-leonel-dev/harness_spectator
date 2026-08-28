# Architecture — What does "doing a good job" mean here?

> This document defines the quality bar for this project. The reviewer agent
> evaluates code against this file. If it's not here, it's not a requirement.

## Stack decision (feature 1: `scaffold_frontend_stack`)

This project is a two-process web app: a **frontend** (browser SPA) and a **separate backend
API**, deliberately not merged into one fullstack framework — the SPA only ever talks to the
backend over HTTP, never touches a database or the filesystem directly.

- **Frontend:** Angular (TypeScript, standalone components), in `frontend/`.
- **Backend:** Rust + Axum, in `backend/`.
- **Auth:** Supabase Auth (email/password via Supabase's GoTrue). The Angular frontend uses the
  `@supabase/supabase-js` client to perform the login flow and holds the resulting session; the
  Axum backend does not issue or store any session of its own — it verifies the Supabase-issued
  JWT (sent as a `Bearer` token) on every protected route.
- **Data:** the backend's Postgres schema is designed for Supabase Postgres from day one (see
  "Data Flow" below) — the actual migration of the user's existing local Postgres data into that
  Supabase-hosted schema is out of scope for this feature and left for later work.

### Why Angular over React/Vue (discarded alternative)

Angular ships routing, HTTP client, forms, and a CLI-driven build/test toolchain as one first-party,
versioned unit, so there is no separate ecosystem decision to make for router/HTTP/test-runner the
way there would be with React (which requires picking `react-router`, a data-fetching library, a
build tool, and a test runner independently). For a single small SPA maintained mostly by agents,
one first-party toolchain that only has one way to do each of those things reduces the number of
independent conventions to hold consistent (see `docs/conventions.md`'s "extreme homogeneity"
principle). Rejected React/Vue for requiring that extra ecosystem-assembly step, not for any
technical shortcoming of either.

### Why Axum over Actix-web/Rocket (discarded alternative)

The backend surface is small (one JWT-verification middleware, one protected data endpoint). Axum
is built directly on `tower`/`hyper`, the same middleware/service abstractions used across the wider
Rust async ecosystem, so its `tower::Service`-based middleware (CORS, tracing, auth extraction)
composes without a framework-specific plugin system. Actix-web's actor-based runtime and Rocket's
macro-heavy, more opinionated request-guard system both add framework-specific concepts this small
a surface doesn't need. Rejected for being unnecessary conceptual overhead relative to Axum, not for
being technically worse.

### Why Supabase Auth over custom JWT/cookie auth (discarded alternative)

An earlier draft of this spec chose backend-issued credentials (a single configured admin user) with
a self-signed JWT in an httpOnly cookie, reasoning that this is a single-operator tool with no need
for a full identity provider. That draft was discarded: hand-rolling credential storage (password
hashing, JWT signing/rotation, cookie handling) is exactly the kind of security-sensitive code this
project should not maintain itself when a managed provider already does it correctly, and Supabase
Auth is required regardless for the project's separately-planned Supabase Postgres migration — using
it for auth now means the frontend's login flow and the backend's verification path never need to
change when that migration happens. Rejected self-signed JWT/cookie auth because it re-implements a
solved problem for no benefit once Supabase is already the target data platform.

### Why Postgres (Supabase-shaped) over continuing with SQLite (discarded alternative)

An earlier draft had the backend read a local `harness.db` SQLite file directly via a read-only
connection. That draft is discarded because the acceptance criteria for this feature explicitly
require the backend's schema to target a dedicated Supabase Postgres schema from the start, so that
migrating the user's existing local Postgres data into Supabase later is not blocked by having built
this feature against SQLite. The backend now reads from a Postgres database (dev-time: a local
Postgres instance; later: the same schema hosted on Supabase) via `sqlx`, using only
Supabase-portable schema features (standard SQL types, no local-only extensions) so the connection
string is the only thing that changes when the data is migrated.

## Principles

1. **Layers.**
   - `frontend/src/app/auth/` — the Supabase client wrapper, the login page, the `AuthService`
     (Angular signal-based session state), and the functional `authGuard` that gates the
     harness-state dashboard behind a valid Supabase session.
   - `frontend/src/app/dashboard/` — components that render harness state (features table, open
     session card, blocked features card) fetched via `frontend/src/app/core/`.
   - `frontend/src/app/core/` — the `HarnessApiService` (the only place that calls Angular's
     `HttpClient` against the backend) and the `authInterceptor` that attaches the Supabase access
     token as `Authorization: Bearer <token>` to outgoing requests.
   - `backend/src/auth/` — the Supabase JWT verification extractor/middleware. No login, logout, or
     session-issuing route exists here — that is entirely Supabase's responsibility.
   - `backend/src/harness/` — the read-only Postgres reader (`sqlx` queries) and the
     `/api/harness/state` route.
   - `backend/src/config.rs` — the only place environment variables are read.
   Don't let implementers introduce additional top-level layers without updating this file first.
2. **Dependencies.** Approved allowlist, not "anything goes":
   - Frontend runtime: `@angular/core`, `@angular/common`, `@angular/router`,
     `@angular/forms`, `@angular/common/http`, `@supabase/supabase-js`, `rxjs`.
   - Frontend dev: `@angular/cli`, `@angular-devkit/build-angular`, `typescript`, `eslint` +
     `typescript-eslint` + `angular-eslint`, `prettier`, `karma`, `karma-chrome-launcher`,
     `jasmine-core`, `@types/jasmine`.
   - Backend runtime: `axum`, `tokio`, `tower`, `tower-http` (`cors`, `trace` features), `serde`,
     `serde_json`, `sqlx` (`postgres`, `runtime-tokio-rustls`, `macros`, `uuid`, `chrono`
     features), `jsonwebtoken`, `dotenvy`, `thiserror`, `tracing`, `tracing-subscriber`.
   - Backend dev: `sqlx` (`test` support) for integration tests against a throwaway Postgres
     schema.
   - No UI component library, no CSS framework, no ORM beyond `sqlx`'s query layer, no
     state-management library beyond Angular signals + `AuthService`/`HarnessApiService`. Adding a
     dependency outside this list requires updating this file first, in the same spirit as the
     layers rule above.
3. **Error handling.**
   - Backend: every error response is JSON `{ "error": "<message>" }` with an appropriate status
     code (401 unauthorized, 404 not found, 500 internal). A single centralized Axum error type
     implementing `IntoResponse` is the only place that formats this envelope; internal error
     details (DB errors, JWT parse errors) are logged via `tracing` but never included in the
     response body. No handler silently swallows a `Result::Err` — every fallible operation
     returns a `Result` that either becomes a typed error response or is propagated with `?`.
   - Frontend: every `HttpClient` call's error path is surfaced in the UI (a visible inline
     message) — no empty `catch`/unhandled `error` callback, no error logged to the console and
     otherwise ignored.
4. **State/mutability.**
   - Backend: the Postgres connection pool (`sqlx::PgPool`) is created once at startup from
     `DATABASE_URL` and reused for the process lifetime. This backend never issues an `INSERT`,
     `UPDATE`, or `DELETE` statement against the target database — it is a read-only dashboard, not
     another way to run `scripts/harness.sh`. `DATABASE_URL` SHOULD point at a Postgres role granted
     `SELECT` only, so the read-only guarantee holds at the database-privilege level, not just by
     application-code discipline. Auth is entirely delegated to Supabase — this backend holds no
     session state of its own.
   - Frontend: component state via Angular signals; the only cross-cutting mutable state is
     `AuthService`'s session signal (backed by the Supabase client's own session persistence in
     `localStorage`, which `@supabase/supabase-js` manages). No other global mutable singletons.

## Data Flow

```
browser
  -> supabase-js signInWithPassword(email, password)     (frontend/src/app/auth/)
  -> Supabase Auth (GoTrue, hosted)
  <- session { access_token, ... }                        (persisted by supabase-js)

browser
  -> HttpClient request, authInterceptor adds
     Authorization: Bearer <access_token>                 (frontend/src/app/core/)
  -> Axum app                                              (backend/src/app.rs)
     -> CORS check (FRONTEND_ORIGIN allowlist)
     -> [protected routes only] auth extractor              (verifies the Supabase JWT: signature
                                                              via SUPABASE_JWT_SECRET, exp, aud)
     -> route handler
        - GET /api/harness/state: read-only sqlx query against the target Postgres schema
  -> JSON response
  -> HarnessApiService
  -> Angular components (frontend/src/app/dashboard/)
```

The backend's target database is not necessarily this project's own `harness.db` mirror — it is
configured via the `DATABASE_URL` env var, so the same backend can point at a sibling harness
project's mirrored Postgres schema, per the feature's description. The frontend's Supabase project
is configured via `SUPABASE_URL`/`SUPABASE_ANON_KEY` (matching the existing `supabase_url_env`/
`supabase_key_env` names already declared in `.harness.json`, which this project's mirror sync also
uses).

## What NOT to do

- Do not call Postgres (or read `harness.db`/`state/` in any other way) from `frontend/` — all data
  access goes through the backend HTTP API. The frontend's only direct external dependency is
  Supabase Auth (via `supabase-js`), never the database.
- Do not add write/mutation endpoints to the backend (e.g. no route that calls
  `scripts/harness.sh claim`/`log-out`/etc.) — this stack is a read-only viewer.
- Do not implement the backend's own login/logout/session-issuing routes — Supabase Auth owns the
  entire credential/session lifecycle; the backend only verifies tokens it did not issue.
- Do not implement self-service signup, password reset, or multi-user account management in this
  feature — creating the one Supabase user is an out-of-band setup step, not application code.
- Do not merge the frontend and backend into a single framework/process — they must remain two
  independently startable processes (`ng serve` and `cargo run`).
- Do not use any Postgres extension or feature that is unavailable on Supabase-hosted Postgres
  (e.g. filesystem-backed extensions, superuser-only features) — the schema must be
  Supabase-portable from the first migration file.
- Do not commit `SUPABASE_JWT_SECRET`, `DATABASE_URL`, `SUPABASE_ANON_KEY`, or any other secret —
  they are supplied via untracked `.env` files (see `.env.example` in each package), consistent
  with `harness.db` already being gitignored for similar reasons.
- Do not add a UI component library or CSS framework (see the dependency allowlist above).
