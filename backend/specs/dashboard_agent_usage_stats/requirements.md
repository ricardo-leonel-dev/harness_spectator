# Requirements — dashboard_agent_usage_stats

Format: `docs/specs.md` (EARS, one `SHALL` clause per `R<n>`, every `R<n>` verifiable by a concrete
test). "The system" below is this backend (`spectator_backend`).

Scope: extend the existing `GET /api/harness/dashboard` response (feature 8, `dashboard_stats_api`)
with one new top-level key, `agentUsage`, aggregated across every non-deleted project from the
toolkit's Postgres mirror table `agent_runs` (the same table feature 9, `feature_agent_usage_api`,
reads per feature). `agentUsage` carries total tokens by category, summed agent effort, breakdowns by
runtime, by model and by agent role, and a top-10 project ranking by total tokens. Consumer: the
frontend feature `dashboard_agent_usage_cards` (sibling `spectator_frontend` project).

This spec amends exactly one requirement of `specs/dashboard_stats_api/requirements.md`: its R3
("only keys are `overall` and `topProjects`") is replaced by R1 below. Every other requirement of
that spec keeps applying unchanged (R2 below pins this). Authentication is unchanged: the route keeps
the `401` behaviour of `dashboard_stats_api` R1/R2, and the `agentUsage` key only exists in `200`
bodies, so this spec adds no auth requirement.

Out of scope: a union-of-intervals ("wall time") figure across projects, per-feature or per-session
breakdowns (already served by the feature-9 route), time series or history, filtering by date,
runtime or project, caching, and applying the toolkit's `agent_runs` DDL / `upsert_agent_run` RPC to
the deployed mirror (see `design.md` § "Mirror dependency"). Documentation updates
(`docs/architecture.md`, `docs/verification.md`) are delivered by a task in `tasks.md`, not
behaviour, so they carry no `R<n>`.

Terms used by the requirements:

- **dashboard route**: `GET /api/harness/dashboard`.
- **valid token**: a bearer token the existing `AuthUser` extractor accepts in the configured auth mode,
  exactly as on the existing harness routes.
- **counted run**: an `agent_runs` row with `deleted_at IS NULL` whose `projects` row (`project_id`)
  has `deleted_at IS NULL`. Whether the row has a `feature_id`, and the state of that feature
  (soft-deleted, `superseded`, any status), does not matter.
- **token object of a set S of counted runs**: a JSON object with exactly the keys `input`,
  `cacheRead`, `cacheWrite`, `output`, `reasoning` and `total`, each an integer equal to the sum over
  S of the non-null values of `input_tokens`, `cache_read_tokens`, `cache_write_tokens`,
  `output_tokens`, `reasoning_tokens` and `total_tokens` respectively (`0` when there are none, never
  `null`). `total` is the sum of the stored `total_tokens` column, not a recomputation from the
  other categories.
- **usage bucket of a set S of counted runs**: the three key/value pairs `runs` (integer, the number
  of runs in S), `effortSeconds` (number, the sum of the non-null `duration_seconds` values over S,
  `0.0` when there are none) and `tokens` (the token object of S).
- **zero bucket**: `{"runs":0,"effortSeconds":0.0,"tokens":{"input":0,"cacheRead":0,"cacheWrite":0,"output":0,"reasoning":0,"total":0}}`.
- **byte-wise order**: comparison of the UTF-8 bytes of two strings, independent of the database
  collation.

## R1
WHEN a dashboard-route request carries a valid token, the system SHALL respond `200` with a JSON
object whose only keys are `overall`, `topProjects` and `agentUsage`.

## R2
WHEN the system responds `200` on the dashboard route, the system SHALL return `overall` and
`topProjects` with the values `specs/dashboard_stats_api/requirements.md` R4–R18 define, independent
of the content of `agent_runs`.

## R3
WHEN the system responds `200` on the dashboard route, the system SHALL return an `agentUsage` object
whose only keys are `runs`, `effortSeconds`, `tokens`, `byRuntime`, `byModel`, `byRole` and
`topProjects`.

## R4
WHEN the system responds `200` on the dashboard route, the system SHALL set `agentUsage.runs`,
`agentUsage.effortSeconds` and `agentUsage.tokens` to the usage bucket of all counted runs across
all projects.

## R5
IF an `agent_runs` row has `deleted_at` set THEN the system SHALL exclude it from every value in
`agentUsage`.

## R6
IF a `projects` row has `deleted_at` set THEN the system SHALL exclude all of that project's
`agent_runs` rows, and its slug, from every value in `agentUsage`.

## R7
The system SHALL include every counted run in `agentUsage` whether its `feature_id` is `NULL`,
references a soft-deleted feature, or references a feature in any status.

## R8
WHEN the system responds `200` on the dashboard route, the system SHALL return `agentUsage.byRuntime`
with exactly the keys `claude` and `codex`, each an object equal to the usage bucket of the counted
runs with that `runtime` (the zero bucket when there are none).

## R9
WHEN the system responds `200` on the dashboard route, the system SHALL return in
`agentUsage.byModel` exactly one element per distinct `model` value among the counted runs (SQL
`NULL` counting as one value), each with exactly the keys `model` (string, or `null` for the `NULL`
group) plus the usage bucket keys of the counted runs with that `model`.

## R10
WHEN the system responds `200` on the dashboard route, the system SHALL order `agentUsage.byModel` by
`tokens.total` descending, then by `model` ascending in byte-wise order, with the `null` model after
every non-null model of equal `tokens.total`.

## R11
WHEN the system responds `200` on the dashboard route, the system SHALL return in `agentUsage.byRole`
exactly one element per distinct `agent_role` value among the counted runs (SQL `NULL` counting as
one value), each with exactly the keys `role` (string, or `null` for the `NULL` group) plus the usage
bucket keys of the counted runs with that `agent_role`.

## R12
WHEN the system responds `200` on the dashboard route, the system SHALL order `agentUsage.byRole` by
`tokens.total` descending, then by `role` ascending in byte-wise order, with the `null` role after
every non-null role of equal `tokens.total`.

## R13
WHEN the system responds `200` on the dashboard route, the system SHALL return each
`agentUsage.topProjects` element with exactly the keys `slug` (string, that project's
`projects.slug` value unchanged) plus the usage bucket keys of that project's counted runs.

## R14
IF a non-deleted project has no counted run THEN the system SHALL omit that project from
`agentUsage.topProjects`.

## R15
WHEN the system responds `200` on the dashboard route, the system SHALL order
`agentUsage.topProjects` by `tokens.total` descending, then by `slug` ascending in byte-wise order.

## R16
WHEN 10 or fewer projects have at least one counted run, the system SHALL return every such project
in `agentUsage.topProjects`.

## R17
WHEN more than 10 projects have at least one counted run, the system SHALL return in
`agentUsage.topProjects` exactly the 10 such projects that rank first under the ordering of R15.

## R18
WHEN no counted run exists, the system SHALL respond `200` with `agentUsage` equal to
`{"runs":0,"effortSeconds":0.0,"tokens":{"input":0,"cacheRead":0,"cacheWrite":0,"output":0,"reasoning":0,"total":0},"byRuntime":{"claude":<zero bucket>,"codex":<zero bucket>},"byModel":[],"byRole":[],"topProjects":[]}`.

## R19
The system SHALL read the agent usage aggregate using only `SELECT` statements, so that the reader
succeeds on a connection whose transactions default to read-only.
