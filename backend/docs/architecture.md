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
- **Auth:** two runtime modes chosen by `AUTH_MODE` (feature 5: `local_auth_mode`).
  - `supabase` (default): Supabase Auth (email/password via Supabase's GoTrue). The frontend performs
    the login flow with `@supabase/supabase-js` and holds the session; this backend does **not**
    issue or store any session of its own — it verifies the Supabase-issued JWT (sent as a `Bearer`
    token) on every protected route.
  - `local`: for machines/LANs with no Supabase project. Users are configured in `.env`
    (`LOCAL_AUTH_USERS`, email + argon2id PHC hash); `POST /api/auth/login` checks a password and
    returns a short-lived HS256 token signed with `LOCAL_AUTH_SECRET`
    (`iss = "harness-spectator"`, `aud = "harness-spectator-local"`). Tokens are stateless: nothing is
    stored server-side, there is no refresh or logout endpoint, and rotating `LOCAL_AUTH_SECRET`
    invalidates every token.
  - Protected routes accept only tokens valid for the active mode (secret **and** `aud`/`iss`).
    `GET /api/auth/mode` is public so the frontend can pick its login flow.
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

**Narrow revival in local mode (feature 5).** Supabase mode is unchanged and remains the default.
Local mode exists because some deployments (a LAN dashboard on a machine with no Supabase project)
have no identity provider at all, so "use the managed provider" is not available there. It is kept
deliberately small so it does not become the hand-rolled credential system rejected above: no user
table or writes (users live in `.env`), password hashing delegated to the `argon2` crate, stateless
tokens signed with `jsonwebtoken` (already a dependency), no refresh, no stored sessions, no cookies.
See `specs/local_auth_mode/design.md` for the rest of the rationale.

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
   - `src/auth/` — authentication. `jwt.rs` verifies Supabase JWTs; `local_token.rs` issues and
     verifies local-mode tokens; `password.rs` wraps argon2id hashing/verification; `extractor.rs`
     holds the `AuthUser` extractor, which dispatches on the active mode; `router.rs` serves
     `GET /api/auth/mode` and, in local mode only, `POST /api/auth/login`. No logout, refresh or
     session-storing route exists here.
   - `src/bin/hash_password.rs` — the `hash-password` developer binary: reads one password line from
     stdin and prints its argon2id PHC hash for `LOCAL_AUTH_USERS`. Reads no environment.
   - `src/harness/` — the read-only Postgres reader (`sqlx` queries) and the
     `/api/harness/projects`, `/api/harness/projects/{slug}/state`,
     `/api/harness/projects/{slug}/features/{name}/log` and `/api/harness/dashboard`
     routes.
   - `src/config.rs` — the only place environment variables are read.
   Don't let implementers introduce additional top-level layers without updating this file first.
2. **Dependencies.** Approved allowlist, not "anything goes":
   - Runtime: `axum`, `tokio`, `tower`, `tower-http` (`cors`, `trace` features), `serde`,
     `serde_json`, `sqlx` (`postgres`, `runtime-tokio`, `tls-rustls`, `macros`, `uuid`, `chrono`
     features), `jsonwebtoken`, `dotenvy`, `thiserror`, `tracing`, `tracing-subscriber`, `argon2`
     (local-mode password hashing, default features).
   - Dev: `sqlx` (`test` support) for integration tests against a throwaway Postgres schema.
   - No ORM beyond `sqlx`'s query layer. Adding a dependency outside this list requires updating
     this file first, in the same spirit as the layers rule above.
3. **Error handling.** Every error response is JSON `{ "error": "<message>" }` with an appropriate
   status code (400 bad request, 401 unauthorized, 404 not found, 500 internal). A single centralized Axum error type
   implementing `IntoResponse` is the only place that formats this envelope; internal error details
   (DB errors, JWT parse errors) are logged via `tracing` but never included in the response body.
   No handler silently swallows a `Result::Err` — every fallible operation returns a `Result` that
   either becomes a typed error response or is propagated with `?`.
4. **State/mutability.** The Postgres connection pool (`sqlx::PgPool`) is created once at startup
   from `DATABASE_URL` and reused for the process lifetime. This backend never issues an `INSERT`,
   `UPDATE`, or `DELETE` statement against the target database — it is a read-only dashboard, not
   another way to run `scripts/harness.sh`. `DATABASE_URL` SHOULD point at a Postgres role granted
   `SELECT` only, so the read-only guarantee holds at the database-privilege level, not just by
   application-code discipline. This holds in both auth modes: local mode reads its users from
   configuration, never from the database. This backend holds no session state of its own in either
   mode — Supabase owns sessions in supabase mode, and local tokens are stateless.

## Data Flow

```
frontend (separate project/process)
  -> HTTP request carrying Authorization: Bearer <supabase access_token | local token>
  -> Axum app                                              (src/app.rs)
     -> CORS check (FRONTEND_ORIGIN allowlist; methods GET, POST; headers authorization,
        content-type)
     -> [protected routes only] AuthUser extractor          (supabase mode: signature via
                                                              SUPABASE_JWT_SECRET, exp, aud =
                                                              authenticated; local mode: signature
                                                              via LOCAL_AUTH_SECRET, exp with zero
                                                              leeway, iss, aud = harness-spectator-local)
     -> route handler
        - GET /api/auth/mode (public): {mode: "supabase" | "local"}
        - POST /api/auth/login (public, local mode only; 404 in supabase mode):
          {email, password} -> {accessToken, expiresAt}; 401 on bad credentials, 400 on a
          malformed body
        - GET /api/harness/projects: every non-deleted project, ordered by slug, as
          [{slug, description, counts: {total, done, inProgress, blocked}}]
        - GET /api/harness/projects/{slug}/state: {project, features, openSession,
          blockedFeatures} for that slug; 404 + JSON error for an unknown/deleted slug
        - GET /api/harness/projects/{slug}/features/{name}/log: {feature, sessions} for
          that feature — the feature header plus every non-deleted session of that
          feature with its non-deleted log entries; 404 + JSON error when the project
          or feature is unknown or soft-deleted. Sessions are ordered by `started_at`
          ascending (ties broken by `session_log.id`); each session's entries are
          ordered by `created_at` ascending (ties broken by `session_log_entries.id`).
          Identical `{ "error": "not found" }` envelope for unknown-project and
          unknown-feature so the frontend does not have to distinguish the two.
        - GET /api/harness/dashboard: aggregate progress across every project in the
          mirror — `{overall, topProjects}`. `overall` carries `{done, total,
          percentage, byStatus}` where `byStatus` is zero-filled across the six
          countable `feature_status` values (`pending`, `specDrafting`, `specReady`,
          `inProgress`, `blocked`, `done`); `superseded` features are excluded from
          every count and percentage. `topProjects` is at most 10 entries, each
          `{slug, done, total, percentage}`, sorted by `done` descending, then by
          the returned `percentage` value descending, then by `slug` ascending
          (byte-wise). Projects with no countable feature are omitted from
          `topProjects`. Every `percentage` is a 2-decimal float
          (half-up rounding, computed in integer hundredths); the response carries
          the value at 2-decimal precision and the frontend formats it for display
          with exactly 2 decimals (`toFixed(2)`). Every returned `slug` resolves on
          `GET /api/harness/projects/{slug}/state` because both routes share the
          `p.deleted_at IS NULL` filter, so the dashboard's chart entries are
          directly navigable to project detail.
  -> JSON response
```

The `feature_process_log` response has no `notes` key and no `reviewStatus` /
`reviewedBy` / `reviewedAt`: the toolkit's Postgres mirror does not currently
carry `feature_notes` (per `db/migrations/0002_superseded.sql`) or review
verdicts on `session_log`, so they cannot be served from here. When the mirror
adds them, the route gains the keys additively rather than changing shape.

### Data source: the toolkit's Postgres mirror (feature 4: `multi_project_mirror_api`)

The reader targets the shared Postgres mirror every harness project syncs into; its authoritative
DDL is the toolkit's `db/schema.postgres.sql` plus `db/migrations/0001_sdd.sql`,
`0002_superseded.sql` and `0003_paused_sessions.sql`. This backend never changes that schema. The
project is chosen per request by slug (there is no configured `PROJECT_SLUG`). Reader rules:

- `features.status` is the `feature_status` enum and is read as text (`status::text`); ids are
  `bigint` (`projects.id` is `uuid`); `session_log.next_step` is `text[]`, joined with `" | "`.
- Rows with `deleted_at` set are excluded (projects, features, sessions, session entries).
- The open session is the latest one with `closed_at`, `paused_at` and `deleted_at` all null — a
  paused session belongs to a blocked feature and is not the open one.
- There is no blocked-features table: a blocked feature is `features.status = 'blocked'`, and its
  note is the latest `session_log_entries.entry` of that feature's latest session, or `""` if none.
- Counts on `/api/harness/projects` are over non-deleted features (`total` includes every status).

`migrations/0001_harness_schema.sql` is a test-only reproduction of the mirror tables and enum the
reader uses, applied by `#[sqlx::test]`; it is never run against the mirror.

The target database is not necessarily any particular project's own mirror — it is configured via
the `DATABASE_URL` env var, so the same backend can point at any sibling harness project's mirrored
Postgres schema. `SUPABASE_JWT_SECRET` must match the Supabase project the frontend authenticates
against (supabase mode), and `FRONTEND_ORIGIN` must match where that frontend is served from.

## What NOT to do

- Do not add write/mutation endpoints (e.g. no route that calls `scripts/harness.sh
  claim`/`log-out`/etc.) — this stack is a read-only viewer.
- Do not implement login/logout/refresh/session-issuing routes, except `POST /api/auth/login` in
  local mode. In supabase mode Supabase Auth owns the entire credential/session lifecycle and this
  backend only verifies tokens it did not issue; in local mode the backend issues stateless tokens
  and never stores sessions.
- Do not merge this backend into the frontend's framework/process — they must remain two
  independently startable processes (`cargo run` here, `npm start` there).
- Do not use any Postgres extension or feature that is unavailable on Supabase-hosted Postgres
  (e.g. filesystem-backed extensions, superuser-only features) — the schema must be
  Supabase-portable from the first migration file.
- Do not commit `SUPABASE_JWT_SECRET`, `LOCAL_AUTH_SECRET`, `LOCAL_AUTH_USERS`, `DATABASE_URL`, or
  any other secret — they are supplied via
  untracked `.env` files (see `.env.example`), consistent with `harness.db` already being gitignored
  for similar reasons.
