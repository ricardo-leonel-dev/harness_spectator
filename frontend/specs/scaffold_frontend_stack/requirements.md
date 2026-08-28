# Requirements — scaffold_frontend_stack (frontend half)

Stack decisions (Angular frontend, Supabase Auth) and their rationale are recorded in
`docs/architecture.md`, not repeated here — see that file for the "why". This file states only what
must be true and testable of the resulting system.

> **Scope note.** This feature originally scaffolded *both* stacks of the repository in a single
> tracked unit, back when one harness instance covered the whole repo. When the harness was split
> into independent per-stack installations, this spec was split with it: what you see here is the
> **frontend half only**, renumbered `R1`-`R7`. The backend half (its `cargo run` server, its
> `DATABASE_URL` handling, its `GET /api/harness/state` contract and the four 401 paths) lives in
> the backend project's own `specs/scaffold_frontend_stack/requirements.md`. Neither half claims
> the other's work. `R6` below references the backend's endpoint because the frontend genuinely
> calls it over HTTP — that is a dependency, not a duplicated requirement.

## R1
The frontend SHALL provide an `npm start` command, run from the project root, that starts a local
development server.

## R2
The frontend SHALL provide an `npm run build` command, run from the project root, that produces a
production build.

## R3
WHEN the frontend application loads and no Supabase session is present, the frontend SHALL render
the login screen and SHALL NOT render the dashboard.

## R4
WHEN the user submits the login form with credentials Supabase Auth accepts, the frontend SHALL
render the dashboard.

## R5
IF the user submits the login form with credentials Supabase Auth rejects THEN the frontend SHALL
display an inline error message and SHALL NOT render the dashboard.

## R6
WHEN the frontend renders the dashboard, it SHALL attach the current Supabase session's access
token as an `Authorization: Bearer <token>` header on its request to the backend's
`GET /api/harness/state` endpoint.

## R7
The system SHALL have `.harness.json`'s `verify_command` set to a command that lints, builds, and
runs this project's test suite, and that command SHALL exit 0 when run against the scaffolded
state of the package.
