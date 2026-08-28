# Requirements — scaffold_frontend_stack (backend half)

Stack decisions (Rust + Axum backend, Supabase Auth, Supabase-shaped Postgres schema) and their
rationale are recorded in `docs/architecture.md`, not repeated here — see that file for the "why".
This file states only what must be true and testable of the resulting system.

> **Scope note.** This feature originally scaffolded *both* stacks of the repository in a single
> tracked unit, back when one harness instance covered the whole repo. When the harness was split
> into independent per-stack installations, this spec was split with it: what you see here is the
> **backend half only**, renumbered `R1`-`R9`. The frontend half (its `npm start`/`npm run build`
> commands, its login/dashboard rendering and its Bearer-token attachment) lives in the frontend
> project's own `specs/scaffold_frontend_stack/requirements.md`. Neither half claims the other's
> work. The feature name is kept verbatim so the shared origin stays traceable, even though it
> reads oddly for a backend project.

## R1
The backend SHALL provide a command, run from the project root (`cargo run`), that starts a local
HTTP server as a process independent of the frontend's dev server (i.e. each is startable and
stoppable without affecting the other).

## R2
The backend SHALL open its connection to the target Postgres database using a connection string
supplied only via the `DATABASE_URL` environment variable (never hardcoded).

## R3
The backend SHALL NOT expose any HTTP endpoint that executes an `INSERT`, `UPDATE`, or `DELETE`
statement against the target Postgres database.

## R4
The backend's schema (migration files under `migrations/`) SHALL NOT use any Postgres extension or
feature unavailable on Supabase-hosted Postgres.

## R5
WHEN a client sends `GET /api/harness/state` with a valid, non-expired Supabase-issued JWT in the
`Authorization: Bearer <token>` header, the backend SHALL respond with HTTP 200 and a JSON body
containing the target project's features, its currently open session (if any), and its blocked
features.

## R6
IF a client sends `GET /api/harness/state` without an `Authorization` header THEN the backend SHALL
respond with HTTP 401 and SHALL NOT include any harness state data in the response body.

## R7
IF a client sends `GET /api/harness/state` with a JWT whose signature does not verify against
`SUPABASE_JWT_SECRET` THEN the backend SHALL respond with HTTP 401 and SHALL NOT include any
harness state data in the response body.

## R8
IF a client sends `GET /api/harness/state` with a syntactically valid but expired JWT THEN the
backend SHALL respond with HTTP 401 and SHALL NOT include any harness state data in the response
body.

## R9
The system SHALL have `.harness.json`'s `verify_command` set to a command that formats, lints,
builds, and runs this project's test suite, and that command SHALL exit 0 when run against the
scaffolded state of the package.
