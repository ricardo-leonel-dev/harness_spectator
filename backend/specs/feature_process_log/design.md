# Design — feature_process_log

Conventions are not re-derived here. Layers, the dependency allowlist, the `{"error": ...}` envelope
and the read-only rule come from `docs/architecture.md` (§ "Principles", § "Data Flow", § "Data source:
the toolkit's Postgres mirror"); naming, file structure, test layout and `sqlx::test` isolation come
from `docs/conventions.md`. This design only records choices made inside those boundaries.

No new dependency, no new layer, no migration change, no CORS change, no UI (so no
`## Visual direction` section).

## Route

`GET /api/harness/projects/{slug}/features/{name}/log`, registered in `src/app.rs` next to the two
existing harness routes, unconditionally (both auth modes). Protected by the existing `AuthUser`
extractor, which rejects before the handler runs (R1, R2); nothing about auth changes. CORS already
allows `GET` with `authorization`.

Path parameters are taken as-is (`Path<(String, String)>`). `{name}` matches `features.name` exactly
and case-sensitively, the same way `{slug}` matches `projects.slug` on the state endpoint.

## Response contract (200)

```json
{
  "feature": {
    "featureNumber": 6,
    "name": "feature_process_log",
    "title": "Expose a feature's process log over the API",
    "status": "in_progress",
    "sdd": true,
    "description": "Add a protected endpoint ...",
    "acceptance": ["GET ... requires the same Bearer auth ...", "..."]
  },
  "sessions": [
    {
      "localId": 13,
      "agent": "leader -> spec_author (claude-opus-5-5)",
      "startedAt": "2026-10-14T05:51:13+00:00",
      "closedAt": "2026-10-14T06:20:02+00:00",
      "pausedAt": null,
      "plan": ["Ground design", "Write requirements.md"],
      "nextStep": null,
      "changes": null,
      "verification": null,
      "closure": null,
      "entries": [
        { "entry": "Grounding: ...", "createdAt": "2026-10-14T05:53:40+00:00" }
      ]
    }
  ]
}
```

Field decisions (requirement ids in brackets):

- Key casing follows the existing endpoints: camelCase via `#[serde(rename = ...)]` [R4, R7, R10].
- `status` is `features.status::text`, so any `feature_status` value appears, including `superseded`
  [R4].
- `description` is `features.description` as stored, **not** `COALESCE`d to `""` [R4, R15]. This
  deliberately differs from `project.description` on the state endpoint, which predates the "nullable
  fields are explicit nulls" acceptance item; that endpoint is unchanged.
- `acceptance` is `features.acceptance` (`text[] NOT NULL`), therefore always an array [R4].
- `plan`, `nextStep`, `changes` are **arrays**, not the `" | "`-joined string the state endpoint uses
  for `openSession.nextStep`: a process log shows each step separately and the frontend can join if
  it wants. The columns are nullable (`plan`/`next_step` default to `'{}'` but are not `NOT NULL`;
  `changes` has no default), so each is `Option<Vec<String>>`: SQL `NULL` becomes JSON `null`, an
  empty array stays `[]` [R7, R15].
- Sessions are identified by `localId` = `session_log.local_id`: the session number the harness itself
  shows (`status`, `state/sessions/`), stable across mirror re-syncs, unlike the mirror's surrogate
  `id`. Not exposed: the mirror's `id`, `project_id`, `feature_id`, `deleted_at` [R7].
- Timestamps are `DateTime<Utc>` read from `timestamptz` and rendered with `.to_rfc3339()`, the same
  call `OpenSessionInfo::from` uses for `startedAt` today; nullable ones are `Option<DateTime<Utc>>`
  mapped with `.map(|t| t.to_rfc3339())` [R14].
- Paused sessions (`paused_at` set) are included like any other non-deleted session and expose the
  pause through `pausedAt`; closed sessions are included with `closedAt` [R5, R7].
- No `#[serde(skip_serializing_if)]` on any of the new structs: `None` must serialize as `null` [R15].

## Feature-level notes and review verdicts

The feature's acceptance asks for feature-level notes "if the mirror carries them". It does not:

- The toolkit's `db/migrations/0002_superseded.sql` states that the `feature_notes` table stays local
  to `harness.db`, and `scripts/sync_postgres.sh` only pushes projects, features, specs, sessions and
  session entries (RPCs `bootstrap_project`, `upsert_feature`, `upsert_spec`, `upsert_session`,
  `upsert_session_entry`).
- This repository's test-only `migrations/0001_harness_schema.sql` reproduces that mirror and has no
  `feature_notes` table and no review columns on `session_log`.

The response therefore has **no** `notes` key, rather than an always-empty one, which would tell the
frontend "there are no notes" when the truth is "notes are not available here". The same applies to
`review_status`/`reviewed_by`/`reviewed_at`, which exist only in SQLite. When the toolkit starts
mirroring either, a follow-up feature adds the key (additive, non-breaking).

## Error paths

| Condition | Response | Req |
|---|---|---|
| No / invalid token for the configured auth mode | `401 {"error":"unauthorized"}`, from the extractor, before the handler | R1, R2 |
| No non-deleted project with `{slug}` | `404 {"error":"not found"}` via `ApiError::NotFound` | R16 |
| Project exists, no non-deleted feature `{name}` in it | `404 {"error":"not found"}` via `ApiError::NotFound` | R17, R18 |
| Any `sqlx::Error` | `500 {"error":"internal error"}` via the existing `From<sqlx::Error>` | existing behaviour, no new `R<n>` |

The project and feature 404s are intentionally indistinguishable: same envelope as the state
endpoint, and the frontend has no use for telling them apart.

## Queries (`src/harness/reader.rs`)

All `SELECT`-only with bound parameters [R19].

1. Project: identical to `read_project_state`'s first query; `None` → `ApiError::NotFound` [R16].
2. Feature [R4, R17, R18]:
   ```sql
   SELECT id, feature_number, name, title, status::text AS status, sdd, description, acceptance
   FROM features
   WHERE project_id = $1 AND name = $2 AND deleted_at IS NULL
   ```
   `fetch_optional`; `None` → `ApiError::NotFound`. The `features_name_active` unique index
   guarantees at most one row.
3. Sessions [R5, R6, R11, R13]:
   ```sql
   SELECT id, local_id, agent, started_at, closed_at, paused_at,
          plan, next_step, changes, verification, closure
   FROM session_log
   WHERE project_id = $1 AND feature_id = $2 AND deleted_at IS NULL
   ORDER BY started_at ASC, id ASC
   ```
4. Entries, one query for all sessions, skipped when query 3 returns no rows [R8, R9, R12]:
   ```sql
   SELECT session_id, entry, created_at
   FROM session_log_entries
   WHERE session_id = ANY($1) AND deleted_at IS NULL
   ORDER BY session_id ASC, created_at ASC, id ASC
   ```
   `$1` is the `id`s returned by query 3, so entries of deleted sessions are never fetched [R11].
   Rows are grouped in Rust into a `HashMap<i64, Vec<ProcessLogEntry>>` keyed by `session_id`, then
   attached to each session in query-3 order; a session with no entries gets `[]`. Per-group order is
   preserved from the `ORDER BY` [R9].

Four round trips in the worst case, constant in the number of sessions (no N+1).

## Files to touch

- `src/harness/reader.rs`: new response structs, private `*DbRow` structs, `read_feature_log`.
- `src/harness/router.rs`: new handler `get_feature_log`.
- `src/app.rs`: register the route.
- `tests/harness.rs`: new seeding helper and integration tests (supabase mode).
- `tests/auth.rs`: local-mode 401 tests for the new route.
- `docs/architecture.md`: data-flow route list, `src/harness/` layer description, response contract,
  the feature-notes/review-verdict limitation.
- `docs/verification.md`: Level 2 and Level 3 mention of the new route.

## New signatures

```rust
// src/harness/reader.rs
#[derive(Debug, Serialize)]
pub struct FeatureLogResponse {
    pub feature: FeatureHeader,
    pub sessions: Vec<ProcessLogSession>,
}

#[derive(Debug, Serialize)]
pub struct FeatureHeader {
    #[serde(rename = "featureNumber")] pub feature_number: i32,
    pub name: String,
    pub title: String,
    pub status: String,
    pub sdd: bool,
    pub description: Option<String>,
    pub acceptance: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ProcessLogSession {
    #[serde(rename = "localId")] pub local_id: i64,
    pub agent: String,
    #[serde(rename = "startedAt")] pub started_at: String,
    #[serde(rename = "closedAt")] pub closed_at: Option<String>,
    #[serde(rename = "pausedAt")] pub paused_at: Option<String>,
    pub plan: Option<Vec<String>>,
    #[serde(rename = "nextStep")] pub next_step: Option<Vec<String>>,
    pub changes: Option<Vec<String>>,
    pub verification: Option<String>,
    pub closure: Option<String>,
    pub entries: Vec<ProcessLogEntry>,
}

#[derive(Debug, Serialize)]
pub struct ProcessLogEntry {
    pub entry: String,
    #[serde(rename = "createdAt")] pub created_at: String,
}

pub async fn read_feature_log(
    pool: &PgPool,
    project_slug: &str,
    feature_name: &str,
) -> Result<FeatureLogResponse, ApiError>;

// private, following the existing *DbRow + From pattern:
// FeatureHeaderDbRow      (FeatureHeader fields + `id: i64`)
// ProcessLogSessionDbRow  (`id: i64`, `local_id: i64`, timestamps as DateTime<Utc> / Option<DateTime<Utc>>, ...)
// ProcessLogEntryDbRow    { session_id: i64, entry: String, created_at: DateTime<Utc> }
```

```rust
// src/harness/router.rs
pub async fn get_feature_log(
    State(state): State<AppState>,
    _user: AuthUser,
    Path((slug, name)): Path<(String, String)>,
) -> Result<Json<FeatureLogResponse>, ApiError>;
```

```rust
// src/app.rs
.route("/api/harness/projects/{slug}/features/{name}/log", get(get_feature_log))
```

## Test plan and requirement coverage

All tests in `tests/harness.rs` use `#[sqlx::test]` and the supabase-mode app from `build_test_app`,
except the two local-mode tests in `tests/auth.rs`.

New helpers in `tests/harness.rs`, leaving the existing `seed_*` helpers untouched:

```rust
struct LogSessionSeed<'a> {
    local_id: i64,
    feature_id: Option<i64>,
    agent: &'a str,
    started_minutes_ago: i32,
    plan: Option<&'a [&'a str]>,
    next_step: Option<&'a [&'a str]>,
    changes: Option<&'a [&'a str]>,
    verification: Option<&'a str>,
    closure: Option<&'a str>,
    closed: bool,
    paused: bool,
    deleted: bool,
}
async fn seed_log_session(pool: &PgPool, project_id: Uuid, s: LogSessionSeed<'_>) -> i64;
fn log_path(slug: &str, name: &str) -> String;
```

Tests that need `description`/`acceptance` set them with an explicit `UPDATE features SET ...`
(`seed_feature` is not widened). Expected timestamps are read back from the database and formatted
with `to_rfc3339()` before comparing.

**Coverage grouping** (`docs/specs.md` § "Coverage granularity"): several rows below cover more than
one requirement because the named test asserts the complete JSON body, or every element of it, and
therefore exercises each listed requirement. Every requirement id is listed explicitly; every
`R1`–`R19` appears in at least one row.

| Test | Covers |
|---|---|
| `feature_log_returns_header_and_sessions`: feature with a description and 2 acceptance items, one closed session with plan/changes/verification/closure and 2 entries; asserts the full body with `assert_eq!` against a `json!` value | R3, R4, R5, R7, R8, R10, R14 |
| `feature_log_orders_sessions_and_entries_ascending`: 3 sessions inserted out of order (started 10/30/20 minutes ago) with entries inserted out of order; plus two sessions with identical `started_at` and two entries with identical `created_at` to check the `id` tie-break | R6, R9 |
| `feature_log_excludes_soft_deleted_sessions_and_entries`: one deleted session holding a non-deleted entry, and one live session with one deleted and one live entry | R11, R12 |
| `feature_log_excludes_sessions_of_other_features`: a sibling feature in the same project with its own session, and a session with `feature_id` NULL | R5 |
| `feature_log_with_no_sessions_returns_empty_list` | R13 |
| `feature_log_renders_nulls_explicitly`: `description` NULL, a session with plan/next_step/changes/verification/closure/closed_at/paused_at NULL asserting each key is present with `Value::Null`; plus a paused session asserting `pausedAt` is a string in the state-endpoint format | R7, R14, R15 |
| `feature_log_for_unknown_or_deleted_project_returns_404` | R16 |
| `feature_log_for_unknown_or_deleted_feature_returns_404` | R17 |
| `feature_log_does_not_cross_projects`: `other-project` has `shared_name`, request targets `test-project` | R18 |
| `harness_endpoints_return_401_without_a_valid_token`: the existing `both_endpoints_return_401_without_a_valid_token`, renamed and extended to iterate over the log path with every `unauthorized_cases()` entry | R1 |
| `reader_performs_only_select_queries` (extended): also calls `read_feature_log` on the read-only pool and asserts one session with one entry | R19 |
| `tests/auth.rs`: `local_mode_rejects_supabase_token_on_feature_log` and `local_mode_rejects_missing_token_on_feature_log` (lazy pool; the 401 happens before any query) | R2 |

## Discarded alternatives

1. **Build the whole document in SQL with `json_agg`/`json_build_object`.** One round trip, but
   Postgres would render the timestamps (`2026-10-14T05:51:13.123456+00:00`) instead of
   `chrono::to_rfc3339()`, breaking R14, and the response shape would live in SQL strings instead of
   the typed `Serialize` structs the rest of the reader uses. Rejected for format drift and for
   splitting the contract across two languages.
2. **One entries query per session (N+1).** Simplest code, but round trips grow with the number of
   sessions, and long-lived features accumulate many. Rejected in favour of a single `= ANY($1)` query
   grouped in Rust.
3. **Add the log to the existing `/state` response.** Avoids a route, but the state endpoint is polled
   for the dashboard overview and would then carry every session of every feature. Rejected: the panel
   needs one feature's log, on demand.
4. **Always return `"notes": []`.** Rejected: an empty list asserts something false (see "Feature-level
   notes and review verdicts").
