# Requirements — scaffold_frontend_stack

Stack decisions (Angular frontend, Rust+Axum backend, Supabase Auth, Supabase-shaped Postgres
schema) and their rationale are recorded in `docs/architecture.md`, not repeated here — see that
file for the "why". This file states only what must be true and testable of the resulting system.

## R1
The frontend SHALL provide an `npm start` command, run from `frontend/`, that starts a local
development server.

## R2
The frontend SHALL provide an `npm run build` command, run from `frontend/`, that produces a
production build.

## R3
The backend SHALL provide a command, run from `backend/` (`cargo run`), that starts a local HTTP
server as a process independent of the frontend's dev server (i.e. each is startable and stoppable
without affecting the other).

## R4
The backend SHALL open its connection to the target Postgres database using a connection string
supplied only via the `DATABASE_URL` environment variable (never hardcoded).

## R5
The backend SHALL NOT expose any HTTP endpoint that executes an `INSERT`, `UPDATE`, or `DELETE`
statement against the target Postgres database.

## R6
The backend's schema (migration files under `backend/migrations/`) SHALL NOT use any Postgres
extension or feature unavailable on Supabase-hosted Postgres.

## R7
WHEN a client sends `GET /api/harness/state` with a valid, non-expired Supabase-issued JWT in the
`Authorization: Bearer <token>` header, the backend SHALL respond with HTTP 200 and a JSON body
containing the target project's features, its currently open session (if any), and its blocked
features.

## R8
IF a client sends `GET /api/harness/state` without an `Authorization` header THEN the backend SHALL
respond with HTTP 401 and SHALL NOT include any harness state data in the response body.

## R9
IF a client sends `GET /api/harness/state` with a JWT whose signature does not verify against
`SUPABASE_JWT_SECRET` THEN the backend SHALL respond with HTTP 401 and SHALL NOT include any
harness state data in the response body.

## R10
IF a client sends `GET /api/harness/state` with a syntactically valid but expired JWT THEN the
backend SHALL respond with HTTP 401 and SHALL NOT include any harness state data in the response
body.

## R11
WHEN the frontend application loads and no Supabase session is present, the frontend SHALL render
the login screen and SHALL NOT render the dashboard.

## R12
WHEN the user submits the login form with credentials Supabase Auth accepts, the frontend SHALL
render the dashboard.

## R13
IF the user submits the login form with credentials Supabase Auth rejects THEN the frontend SHALL
display an inline error message and SHALL NOT render the dashboard.

## R14
WHEN the frontend renders the dashboard, it SHALL attach the current Supabase session's access
token as an `Authorization: Bearer <token>` header on its request to the backend's
`GET /api/harness/state` endpoint.

## R15
The system SHALL have `.harness.json`'s `verify_command` set to a command that lints, builds, and
runs the test suite of both `frontend/` and `backend/`, and that command SHALL exit 0 when run
against the scaffolded state of both packages.
