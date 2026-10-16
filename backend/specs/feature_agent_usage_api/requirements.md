# Requirements — feature_agent_usage_api

Format: `docs/specs.md` (EARS, one `SHALL` clause per `R<n>`, every `R<n>` verifiable by a concrete
test). "The system" below is this backend (`spectator_backend`).

Scope: one protected, read-only route that returns the agent invocation tree of one feature from the
toolkit's Postgres mirror table `agent_runs` (toolkit `db/migrations/0004_agent_runs.sql`), plus
per-feature totals: summed agent effort, the union of agent intervals and tokens by category. The
existing log route (`feature_process_log`) is not changed. Consumer: the frontend feature
`feature_agent_usage_panel` (sibling `spectator_frontend` project).

Out of scope: cross-project or dashboard aggregation of agent usage (feature 10
`dashboard_agent_usage_stats`), per-session grouping, runs not attributed to a feature, caching, and
applying migration 0004 / the `upsert_agent_run` RPC to the deployed mirror (see `design.md` §
"Mirror dependency"). Documentation updates (`docs/architecture.md`, `docs/verification.md`) are
delivered by a task in `tasks.md`, not behaviour, so they carry no `R<n>`.

Terms used by the requirements:

- **usage route**: `GET /api/harness/projects/{slug}/features/{name}/agent-usage`.
- **log route**: `GET /api/harness/projects/{slug}/features/{name}/log` (feature 6).
- **valid token**: a bearer token the existing `AuthUser` extractor accepts in the configured auth mode
  (supabase mode: Supabase-issued JWT; local mode: locally issued token), exactly as on the existing
  harness routes.
- **target project**: the `projects` row with `slug = {slug}` and `deleted_at IS NULL`.
- **target feature**: the `features` row with `project_id` = the target project's `id`,
  `name = {name}` (exact, case-sensitive match) and `deleted_at IS NULL`.
- **feature run**: an `agent_runs` row with `project_id` = the target project's `id`, `feature_id` =
  the target feature's `id` and `deleted_at IS NULL`.
- **parent of a feature run R**: the feature run P, other than R itself, with `P.runtime = R.runtime`
  and `P.external_id = R.parent_external_id`. A feature run whose `parent_external_id` is `NULL`, or
  matches no such P, has no parent.
- **run order**: `started_at` ascending, rows with `started_at IS NULL` after every row with a
  non-null `started_at`, ties broken by `agent_runs.id` ascending.
- **interval of a feature run**: the time range from `started_at` to `finished_at`, defined only when
  both are non-null and `finished_at >= started_at`.
- **run node**: a JSON object describing one feature run (R4).
- **state-endpoint timestamp format**: `chrono::DateTime<Utc>::to_rfc3339()`, the format used by
  `GET /api/harness/projects/{slug}/state` for `openSession.startedAt`.

## R1
WHERE supabase auth mode is configured, the system SHALL respond `401` with body exactly
`{"error":"unauthorized"}` to every usage-route request that carries no valid token.

## R2
WHERE local auth mode is configured, the system SHALL respond `401` with body exactly
`{"error":"unauthorized"}` to every usage-route request that carries no valid token.

## R3
WHEN a usage-route request carries a valid token and both the target project and the target feature
exist, the system SHALL respond `200` with a JSON object whose only keys are `runs` (array of run
nodes) and `totals` (object).

## R4
WHEN the system responds `200` on the usage route, the system SHALL return every run node with exactly
the keys `externalId` (string), `parentExternalId` (string or null), `runtime` (string), `role` (string
or null, from `agent_role`), `label` (string or null), `model` (string or null), `spawnDepth` (integer
or null), `startedAt` (string or null), `finishedAt` (string or null), `durationSeconds` (number or
null), `tokens` (object) and `children` (array of run nodes), each value taken from the same-named
`agent_runs` column of that feature run.

## R5
WHEN the system responds `200` on the usage route, the system SHALL return each run node's `tokens`
with exactly the keys `input`, `cacheRead`, `cacheWrite`, `output`, `reasoning` and `total` (integer or
null), set from `input_tokens`, `cache_read_tokens`, `cache_write_tokens`, `output_tokens`,
`reasoning_tokens` and `total_tokens` respectively.

## R6
WHEN the source column behind a key listed as nullable in R4 or R5 is SQL `NULL`, the system SHALL
include that key in the run node with the JSON value `null`.

## R7
WHEN the system responds `200` on the usage route, the system SHALL render every non-null `startedAt`
and `finishedAt` value in the state-endpoint timestamp format.

## R8
WHEN the system responds `200` on the usage route, the system SHALL return every feature run exactly
once across `runs` and all nested `children` arrays.

## R9
WHEN a feature run has a parent, the system SHALL return its run node in the `children` array of its
parent's run node.

## R10
IF a feature run has no parent THEN the system SHALL return its run node in the top-level `runs`
array.

## R11
IF the feature runs contain a parent cycle (every member's parent is another member) THEN the system
SHALL return the member that comes first in run order in the top-level `runs` array, with the
remaining members nested below it according to R9.

## R12
WHEN the system responds `200` on the usage route, the system SHALL return each run node's
`spawnDepth` equal to that row's `spawn_depth`, independent of where the node is placed in the tree.

## R13
WHEN the system responds `200` on the usage route, the system SHALL order the top-level `runs` array
and every `children` array by run order.

## R14
IF an `agent_runs` row has `deleted_at` set THEN the system SHALL exclude it from `runs` and from
every value in `totals`.

## R15
IF an `agent_runs` row's `feature_id` is not the target feature's `id` (another feature, a feature of
another project, or `NULL`) THEN the system SHALL exclude it from `runs` and from every value in
`totals`.

## R16
WHEN the system responds `200` on the usage route, the system SHALL return `totals` with exactly the
keys `effortSeconds` (number), `unionSeconds` (number) and `tokens` (object).

## R17
WHEN the system responds `200` on the usage route, the system SHALL set `totals.effortSeconds` to the
sum of the non-null `duration_seconds` values of all feature runs (`0.0` when there are none).

## R18
WHEN the system responds `200` on the usage route, the system SHALL set `totals.unionSeconds` to the
length in seconds of the union of the intervals of all feature runs, counting time covered by
overlapping intervals once (`0.0` when no feature run has an interval).

## R19
WHEN the system responds `200` on the usage route, the system SHALL return `totals.tokens` with exactly
the keys `input`, `cacheRead`, `cacheWrite`, `output`, `reasoning` and `total`, each an integer equal
to the sum of the non-null values of the mapped column (R5) over all feature runs (`0` when there are
none, never `null`).

## R20
WHEN the target feature exists and has no feature run, the system SHALL respond `200` with body
exactly
`{"runs":[],"totals":{"effortSeconds":0.0,"unionSeconds":0.0,"tokens":{"input":0,"cacheRead":0,"cacheWrite":0,"output":0,"reasoning":0,"total":0}}}`.

## R21
IF no target project exists for `{slug}` (unknown slug, or only soft-deleted projects with that slug)
THEN the system SHALL respond `404` on the usage route with body exactly `{"error":"not found"}`.

## R22
IF the target project exists and no target feature exists for `{name}` (unknown name, or only
soft-deleted features with that name) THEN the system SHALL respond `404` on the usage route with body
exactly `{"error":"not found"}`.

## R23
IF a feature named `{name}` exists only in a project other than the target project THEN the system
SHALL respond `404` on the usage route with body exactly `{"error":"not found"}`.

## R24
The system SHALL read the agent usage data using only `SELECT` statements, so that the reader succeeds
on a connection whose transactions default to read-only.

## R25
The system's test-only mirror schema reproduction (`migrations/`) SHALL define the `agent_runs` table
(columns, types, nullability, defaults, primary key, foreign keys, check constraint), its four indexes
and the `active_agent_runs` view exactly as the toolkit's `db/migrations/0004_agent_runs.sql` does.

## R26
WHILE feature runs exist for a feature, the system SHALL return the log-route `200` response for that
feature with only the keys `feature` and `sessions`, and with the same `feature` and `sessions` values
as when no feature run exists.
