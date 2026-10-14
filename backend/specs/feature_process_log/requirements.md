# Requirements — feature_process_log

Format: `docs/specs.md` (EARS, one `SHALL` clause per `R<n>`, every `R<n>` verifiable by a concrete
test). "The system" below is this backend (`spectator_backend`).

Scope: one protected, read-only route that returns the recorded process of one feature from the
toolkit's Postgres mirror: a feature header plus every non-deleted session of that feature, each with
its non-deleted log entries. Consumer: the frontend feature `feature_process_log_panel` (sibling
`spectator_frontend` project).

Out of scope: feature-level notes (`append-log --feature`, the SQLite `feature_notes` table) and review
verdicts (`review_status`/`reviewed_by`/`reviewed_at`). The mirror does not carry them, so no
requirement below can be tested against it; the reasoning is in `design.md` § "Feature-level notes and
review verdicts". Documentation updates (`docs/architecture.md`, `docs/verification.md`) are an
acceptance item delivered by a task in `tasks.md`, not behaviour, so they carry no `R<n>`.

Terms used by the requirements:

- **log route**: `GET /api/harness/projects/{slug}/features/{name}/log`.
- **valid token**: a bearer token the existing `AuthUser` extractor accepts in the configured auth mode
  (supabase mode: Supabase-issued JWT; local mode: locally issued token), exactly as on the existing
  harness routes.
- **target project**: the `projects` row with `slug = {slug}` and `deleted_at IS NULL`.
- **target feature**: the `features` row with `project_id` = the target project's `id`,
  `name = {name}` (exact, case-sensitive match) and `deleted_at IS NULL`.
- **feature session**: a `session_log` row with `feature_id` = the target feature's `id`,
  `project_id` = the target project's `id` and `deleted_at IS NULL`. Paused and closed sessions are
  feature sessions.
- **session entry**: a `session_log_entries` row with `session_id` = a feature session's `id` and
  `deleted_at IS NULL`.
- **state-endpoint timestamp format**: the format `GET /api/harness/projects/{slug}/state` uses for
  `openSession.startedAt` today, i.e. `chrono::DateTime<Utc>::to_rfc3339()`.

## R1
WHERE supabase auth mode is configured, the system SHALL respond `401` with body exactly
`{"error":"unauthorized"}` to every log-route request that carries no valid token.

## R2
WHERE local auth mode is configured, the system SHALL respond `401` with body exactly
`{"error":"unauthorized"}` to every log-route request that carries no valid token.

## R3
WHEN a log-route request carries a valid token and both the target project and the target feature
exist, the system SHALL respond `200` with a JSON object whose only keys are `feature` and `sessions`.

## R4
WHEN the system responds `200` on the log route, the system SHALL return a `feature` object containing
exactly the keys `featureNumber` (integer), `name` (string), `title` (string), `status` (string, the
`feature_status` enum value as text), `sdd` (boolean), `description` (string or null) and `acceptance`
(array of strings in stored array order), each taken from the target feature.

## R5
WHEN the system responds `200` on the log route, the system SHALL return a `sessions` array containing
exactly one element per feature session.

## R6
WHEN the system responds `200` on the log route, the system SHALL order `sessions` by `started_at`
ascending, breaking ties by `session_log.id` ascending.

## R7
WHEN the system responds `200` on the log route, the system SHALL return each `sessions` element with
exactly the keys `localId` (integer, `session_log.local_id`), `agent` (string), `startedAt` (string),
`closedAt` (string or null), `pausedAt` (string or null), `plan` (array of strings or null),
`nextStep` (array of strings or null), `changes` (array of strings or null), `verification` (string or
null), `closure` (string or null) and `entries` (array).

## R8
WHEN the system responds `200` on the log route, the system SHALL return in each session's `entries`
exactly one element per session entry of that session.

## R9
WHEN the system responds `200` on the log route, the system SHALL order each session's `entries` by
`created_at` ascending, breaking ties by `session_log_entries.id` ascending.

## R10
WHEN the system responds `200` on the log route, the system SHALL return each `entries` element with
exactly the keys `entry` (string) and `createdAt` (string).

## R11
IF a `session_log` row of the target feature has `deleted_at` set THEN the system SHALL omit that
session, and therefore all of its entries, from the log-route response.

## R12
IF a `session_log_entries` row of a feature session has `deleted_at` set THEN the system SHALL omit
that entry from the log-route response.

## R13
WHEN the target feature exists and has no feature session, the system SHALL respond `200` with
`sessions` equal to `[]`.

## R14
WHEN the system responds `200` on the log route, the system SHALL render every non-null `startedAt`,
`closedAt`, `pausedAt` and `createdAt` value in the state-endpoint timestamp format.

## R15
WHEN the source column behind a key listed as nullable in R4 or R7 is SQL `NULL`, the system SHALL
include that key in the log-route response with the JSON value `null`.

## R16
IF no target project exists for `{slug}` (unknown slug, or only soft-deleted projects with that slug)
THEN the system SHALL respond `404` on the log route with body exactly `{"error":"not found"}`.

## R17
IF the target project exists and no target feature exists for `{name}` (unknown name, or only
soft-deleted features with that name) THEN the system SHALL respond `404` on the log route with body
exactly `{"error":"not found"}`.

## R18
IF a feature named `{name}` exists only in a project other than the target project THEN the system
SHALL respond `404` on the log route with body exactly `{"error":"not found"}`.

## R19
The system SHALL read the feature log using only `SELECT` statements, so that the reader succeeds on a
connection whose transactions default to read-only.
