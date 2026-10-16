# Requirements — dashboard_stats_api

Format: `docs/specs.md` (EARS, one `SHALL` clause per `R<n>`, every `R<n>` verifiable by a concrete
test). "The system" below is this backend (`spectator_backend`).

Scope: one protected, read-only route that returns aggregate progress across every project in the
toolkit's Postgres mirror: an overall summary and a top-10 project ranking. Consumer: the frontend
feature `progress_dashboard_view` (sibling `spectator_frontend` project, Notion card "Progress
dashboard view").

Consumer navigation: the frontend makes each chart clickable and navigates to the existing harness
project listing/detail. Each `topProjects` element carries the project's `slug` exactly as stored in
`projects.slug`, which is the path parameter of the existing `GET /api/harness/projects/{slug}/state`
route. Both routes only surface projects with `deleted_at IS NULL`, so every returned slug resolves on
that route. This needs no new behaviour; R14 pins the `slug` value and the test for it checks the
round trip.

Out of scope: per-project drill-down (already served by `/api/harness/projects/{slug}/state`),
time series or history, caching. Documentation updates (`docs/architecture.md`,
`docs/verification.md`) are delivered by a task in `tasks.md`, not behaviour, so they carry no `R<n>`.

Terms used by the requirements:

- **dashboard route**: `GET /api/harness/dashboard`.
- **valid token**: a bearer token the existing `AuthUser` extractor accepts in the configured auth mode
  (supabase mode: Supabase-issued JWT; local mode: locally issued token), exactly as on the existing
  harness routes.
- **countable feature**: a `features` row with `deleted_at IS NULL`, `status <> 'superseded'`, whose
  `projects` row has `deleted_at IS NULL`.
- **counted project**: a `projects` row with `deleted_at IS NULL` that owns at least one countable
  feature.
- **percentage(d, t)**: `0.0` when `t = 0`; otherwise `d * 100 / t` rounded to two decimal places with
  ties rounded up (e.g. `1/32` → `3.13`, `1/16` → `6.25`, `1/3` → `33.33`, `2/3` → `66.67`), serialized
  as a JSON number (never `null`, never a string, never `NaN`). JSON numbers carry no trailing zeros,
  so values with fewer significant decimals serialize shorter (`100.00` → `100.0`, `87.50` → `87.5`);
  the response carries the value at 2-decimal precision and the frontend formats it for display with
  exactly 2 decimals (`"100.00"`, `"87.50"`).
- **status count keys**: `pending`, `specDrafting`, `specReady`, `inProgress`, `blocked`, `done`,
  mapping to the `feature_status` values `pending`, `spec_drafting`, `spec_ready`, `in_progress`,
  `blocked`, `done` respectively.

## R1
WHERE supabase auth mode is configured, the system SHALL respond `401` with body exactly
`{"error":"unauthorized"}` to every dashboard-route request that carries no valid token.

## R2
WHERE local auth mode is configured, the system SHALL respond `401` with body exactly
`{"error":"unauthorized"}` to every dashboard-route request that carries no valid token.

## R3
WHEN a dashboard-route request carries a valid token, the system SHALL respond `200` with a JSON
object whose only keys are `overall` and `topProjects`.

## R4
WHEN the system responds `200` on the dashboard route, the system SHALL return an `overall` object
whose only keys are `done` (integer), `total` (integer), `percentage` (number) and `byStatus`
(object).

## R5
WHEN the system responds `200` on the dashboard route, the system SHALL set `overall.total` to the
number of countable features across all projects.

## R6
WHEN the system responds `200` on the dashboard route, the system SHALL set `overall.done` to the
number of countable features across all projects whose `status` is `done`.

## R7
WHEN the system responds `200` on the dashboard route, the system SHALL return `overall.byStatus` with
exactly the six status count keys, each set to the number of countable features across all projects
with the mapped status (`0` when there are none).

## R8
IF a `features` row has `deleted_at` set THEN the system SHALL exclude it from every count and
percentage in the dashboard-route response.

## R9
IF a `features` row has `status = 'superseded'` THEN the system SHALL exclude it from every count and
percentage in the dashboard-route response.

## R10
IF a `projects` row has `deleted_at` set THEN the system SHALL exclude that project and all of its
features from the dashboard-route response.

## R11
WHEN the system responds `200` on the dashboard route, the system SHALL set `overall.percentage` to
percentage(`overall.done`, `overall.total`).

## R12
WHEN no countable feature exists, the system SHALL respond `200` with `overall` equal to
`{"done":0,"total":0,"percentage":0.0,"byStatus":{"pending":0,"specDrafting":0,"specReady":0,"inProgress":0,"blocked":0,"done":0}}`.

## R13
WHEN no counted project exists, the system SHALL respond `200` with `topProjects` equal to `[]`.

## R14
WHEN the system responds `200` on the dashboard route, the system SHALL return each `topProjects`
element with exactly the keys `slug` (string, that project's `projects.slug` value unchanged), `done` (integer, that project's countable features with
status `done`), `total` (integer, that project's countable features) and `percentage`
(percentage(`done`, `total`) of that element).

## R15
IF a non-deleted project owns no countable feature THEN the system SHALL omit that project from
`topProjects`.

## R16
WHEN the system responds `200` on the dashboard route, the system SHALL order `topProjects` by `done`
descending, then by the returned `percentage` value descending, then by `slug` ascending (byte-wise).

## R17
WHEN 10 or fewer counted projects exist, the system SHALL return every counted project in
`topProjects`.

## R18
WHEN more than 10 counted projects exist, the system SHALL return in `topProjects` exactly the 10
counted projects that rank first under the ordering of R16.

## R19
The system SHALL read the dashboard data using only `SELECT` statements, so that the reader succeeds on
a connection whose transactions default to read-only.
