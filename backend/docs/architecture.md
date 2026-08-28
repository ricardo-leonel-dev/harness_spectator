# Architecture — What does "doing a good job" mean here?

> This document defines the quality bar for this project. The reviewer agent
> evaluates code against this file. If it's not here, it's not a requirement.

> **Scope note.** This project is the **Rust + Axum backend** of a two-process application. Until the
> harness was split into independent per-stack installations, this document described both stacks at
> once; the Angular frontend's layers, dependency allowlist and UI rules now live in the sibling
> frontend project's own `docs/architecture.md`. Decisions that genuinely span the boundary (the
> two-process split itself, Supabase Auth, the HTTP contract) are stated here from the backend's side
> and restated there from the frontend's.

## Stack decision (feature 1: `scaffold_frontend_stack`)

This is a read-only HTTP API serving a **separate browser SPA**, deliberately not merged into one
fullstack framework. The SPA talks to this backend over HTTP; this backend owns all database access.

- **This project:** Rust + Axum.
- **Frontend:** Angular (TypeScript, standalone components), a separate project and a separately
  startable process.
- **Auth:** Supabase Auth (email/password via Supabase's GoTrue). The frontend performs the login
  flow with `@supabase/supabase-js` and holds the session; this backend does **not** issue or store
  any session of its own — it verifies the Supabase-issued JWT (sent as a `Bearer` token) on every
  protected route.
- **Data:** this backend's Postgres schema is designed for Supabase Postgres from day one (see
  "Data Flow" below) — actually migrating existing local Postgres data into that Supabase-hosted
  schema is out of scope and left for later work.

### Why Axum over Actix-web/Rocket (discarded alternative)

The backend surface is small (one JWT-verification middleware, one protected data endpoint). Axum
is built directly on `tower`/`hyper`, the same middleware/service abstractions used across the wider
Rust async ecosystem, so its `tower::Service`-based middleware (CORS, tracing, auth extraction)
composes without a framework-specific plugin system. Actix-web's actor-based runtime and Rocket's
macro-heavy, more opinionated request-guard system both add framework-specific concepts this small
a surface doesn't need. Rejected for being unnecessary conceptual overhead relative to Axum, not for
being technically worse.

### Why Supabase Auth over custom JWT/cookie auth (discarded alternative)

An earlier draft chose backend-issued credentials (a single configured admin user) with a
self-signed JWT in an httpOnly cookie, reasoning that this is a single-operator tool with no need
for a full identity provider. That draft was discarded: hand-rolling credential storage (password
hashing, JWT signing/rotation, cookie handling) is exactly the kind of security-sensitive code this
project should not maintain itself when a managed provider already does it correctly, and Supabase
Auth is required regardless for the separately-planned Supabase Postgres migration — using it for
auth now means this backend's verification path never needs to change when that migration happens.
Rejected self-signed JWT/cookie auth because it re-implements a solved problem for no benefit once
Supabase is already the target data platform.

### Why Postgres (Supabase-shaped) over continuing with SQLite (discarded alternative)

An earlier draft had this backend read a local `harness.db` SQLite file directly via a read-only
connection. That draft is discarded because the acceptance criteria explicitly require the schema to
target a dedicated Supabase Postgres schema from the start, so that migrating existing local
Postgres data into Supabase later is not blocked by having built this against SQLite. The backend
reads from a Postgres database (dev-time: a local Postgres instance; later: the same schema hosted
on Supabase) via `sqlx`, using only Supabase-portable schema features (standard SQL types, no
local-only extensions) so the connection string is the only thing that changes when the data is
migrated.

## Principles

1. **Layers.**
   - `src/auth/` — the Supabase JWT verification extractor/middleware. No login, logout, or
     session-issuing route exists here — that is entirely Supabase's responsibility.
   - `src/harness/` — the read-only Postgres reader (`sqlx` queries) and the
     `/api/harness/state` route.
   - `src/config.rs` — the only place environment variables are read.
   Don't let implementers introduce additional top-level layers without updating this file first.
2. **Dependencies.** Approved allowlist, not "anything goes":
   - Runtime: `axum`, `tokio`, `tower`, `tower-http` (`cors`, `trace` features), `serde`,
     `serde_json`, `sqlx` (`postgres`, `runtime-tokio`, `tls-rustls`, `macros`, `uuid`, `chrono`
     features), `jsonwebtoken`, `dotenvy`, `thiserror`, `tracing`, `tracing-subscriber`.
   - Dev: `sqlx` (`test` support) for integration tests against a throwaway Postgres schema.
   - No ORM beyond `sqlx`'s query layer. Adding a dependency outside this list requires updating
     this file first, in the same spirit as the layers rule above.
3. **Error handling.** Every error response is JSON `{ "error": "<message>" }` with an appropriate
   status code (401 unauthorized, 404 not found, 500 internal). A single centralized Axum error type
   implementing `IntoResponse` is the only place that formats this envelope; internal error details
   (DB errors, JWT parse errors) are logged via `tracing` but never included in the response body.
   No handler silently swallows a `Result::Err` — every fallible operation returns a `Result` that
   either becomes a typed error response or is propagated with `?`.
4. **State/mutability.** The Postgres connection pool (`sqlx::PgPool`) is created once at startup
   from `DATABASE_URL` and reused for the process lifetime. This backend never issues an `INSERT`,
   `UPDATE`, or `DELETE` statement against the target database — it is a read-only dashboard, not
   another way to run `scripts/harness.sh`. `DATABASE_URL` SHOULD point at a Postgres role granted
   `SELECT` only, so the read-only guarantee holds at the database-privilege level, not just by
   application-code discipline. Auth is entirely delegated to Supabase — this backend holds no
   session state of its own.

## Data Flow

```
frontend (separate project/process)
  -> HTTP request carrying Authorization: Bearer <supabase access_token>
  -> Axum app                                              (src/app.rs)
     -> CORS check (FRONTEND_ORIGIN allowlist)
     -> [protected routes only] auth extractor              (verifies the Supabase JWT: signature
                                                              via SUPABASE_JWT_SECRET, exp, aud)
     -> route handler
        - GET /api/harness/state: read-only sqlx query against the target Postgres schema
  -> JSON response
```

The target database is not necessarily any particular project's own mirror — it is configured via
the `DATABASE_URL` env var, so the same backend can point at any sibling harness project's mirrored
Postgres schema. `SUPABASE_JWT_SECRET` must match the Supabase project the frontend authenticates
against, and `FRONTEND_ORIGIN` must match where that frontend is served from.

## What NOT to do

- Do not add write/mutation endpoints (e.g. no route that calls `scripts/harness.sh
  claim`/`log-out`/etc.) — this stack is a read-only viewer.
- Do not implement login/logout/session-issuing routes — Supabase Auth owns the entire
  credential/session lifecycle; this backend only verifies tokens it did not issue.
- Do not merge this backend into the frontend's framework/process — they must remain two
  independently startable processes (`cargo run` here, `npm start` there).
- Do not use any Postgres extension or feature that is unavailable on Supabase-hosted Postgres
  (e.g. filesystem-backed extensions, superuser-only features) — the schema must be
  Supabase-portable from the first migration file.
- Do not commit `SUPABASE_JWT_SECRET`, `DATABASE_URL`, or any other secret — they are supplied via
  untracked `.env` files (see `.env.example`), consistent with `harness.db` already being gitignored
  for similar reasons.
