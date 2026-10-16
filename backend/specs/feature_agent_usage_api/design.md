# Design — feature_agent_usage_api

Conventions are not re-derived here. Layers, the dependency allowlist, the `{"error": ...}` envelope
and the read-only rule come from `docs/architecture.md` (§ "Principles", § "Data Flow", § "Data source:
the toolkit's Postgres mirror"); naming, file structure, test layout and `sqlx::test` isolation come
from `docs/conventions.md`. This design only records choices made inside those boundaries. The
project/feature resolution and 404 rules deliberately copy `specs/feature_process_log/` so the two
per-feature routes behave identically.

No new dependency, no new layer, no CORS change, no new `ApiError` variant, no UI (so no
`## Visual direction` section; the visual side belongs to the frontend's `feature_agent_usage_panel`).
One new test-only migration file reproduces the toolkit's `agent_runs` DDL (R25).

## Route

`GET /api/harness/projects/{slug}/features/{name}/agent-usage`, registered in `src/app.rs` next to the
log route, unconditionally (both auth modes). Protected by the existing `AuthUser` extractor, which
rejects before the handler runs (R1, R2). No query parameters. The log route and its reader are not
touched, so its response stays exactly as feature 6 defined it (R26).

## Response contract (200)

Example for the fixture of `agent_usage_returns_run_tree_and_totals` (base time
`B = 2026-01-01T00:00:00Z`):

```json
{
  "runs": [
    {
      "externalId": "lead",
      "parentExternalId": null,
      "runtime": "claude",
      "role": "leader",
      "label": null,
      "model": "claude-opus-5-5",
      "spawnDepth": 0,
      "startedAt": "2026-01-01T00:00:00+00:00",
      "finishedAt": "2026-01-01T00:01:40+00:00",
      "durationSeconds": 100.0,
      "tokens": { "input": 10, "cacheRead": 1000, "cacheWrite": 200, "output": 50, "reasoning": null, "total": 1260 },
      "children": [
        {
          "externalId": "impl", "parentExternalId": "lead", "runtime": "claude", "role": "implementer",
          "label": "implement feature", "model": "claude-opus-5-5", "spawnDepth": 1,
          "startedAt": "2026-01-01T00:00:10+00:00", "finishedAt": "2026-01-01T00:00:40+00:00",
          "durationSeconds": 30.0,
          "tokens": { "input": 5, "cacheRead": 500, "cacheWrite": 100, "output": 20, "reasoning": null, "total": 625 },
          "children": [
            { "externalId": "explore", "parentExternalId": "impl", "spawnDepth": 2, "...": "...", "children": [] }
          ]
        },
        { "externalId": "rev", "parentExternalId": "lead", "spawnDepth": 1, "...": "...", "children": [] }
      ]
    },
    { "externalId": "thread-x", "parentExternalId": "outside-thread", "runtime": "codex", "spawnDepth": 1, "...": "...", "children": [] }
  ],
  "totals": {
    "effortSeconds": 170.0,
    "unionSeconds": 110.0,
    "tokens": { "input": 22, "cacheRead": 2000, "cacheWrite": 390, "output": 99, "reasoning": 3, "total": 2511 }
  }
}
```

(`"...": "..."` is elision in this document only; every node carries all R4 keys.)

Field decisions (requirement ids in brackets):

- camelCase keys like every existing endpoint. `role` is `agent_role` renamed, because the frontend
  card and the feature description call it "role" [R4].
- Every nullable key is always present (`null`, never omitted): no `skip_serializing_if`, same rule as
  the log route [R6].
- `durationSeconds`, `effortSeconds` and `unionSeconds` are JSON floats (`f64`). Integer-valued
  durations serialize as `100.0`; tests compare against float literals (`json!(100.0)`), because
  `serde_json` treats `Number(100.0)` and `Number(100)` as unequal [R4, R17, R18, R20].
- Per-run token values are `Option<i64>` (the column is nullable; `reasoning_tokens` is `NULL` for most
  Claude runs). Totals are plain `i64`, `0` when nothing is summable [R5, R19].
- `totals.tokens.total` is the sum of the `total_tokens` column, not a recomputation from the other
  categories: the toolkit defines `total = input + cache_read + cache_write + output` at record time,
  and this route reports what was recorded [R19].
- Timestamps use `DateTime<Utc>::to_rfc3339()`, identical to the state and log routes [R7].
- No feature header: the consumer panel sits on the feature page, which already has the header from
  the log route. Adding one later is additive.

## Tree construction (`build_run_tree`)

Input: the feature runs already in run order (the query's `ORDER BY`). All work is in Rust over the
fetched rows (one feature's runs, tens of rows).

1. Index rows by `(runtime, external_id)`. The mirror's unique index
   `agent_runs_external_active (project_id, runtime, external_id) WHERE deleted_at IS NULL` guarantees
   at most one non-deleted row per key in a project, so the map is unambiguous.
2. For each row, `parent = index.get((runtime, parent_external_id))`, ignored when it points at the row
   itself. Keying on `runtime` too matches the toolkit's `tree_order` (a Claude id never parents a Codex
   thread) [R9, R10].
3. `child_lists[parent].push(row)` in run order, so every child list is already in run order [R13].
4. Roots are the rows with no parent. Walk depth-first from each root in run order, marking visited
   rows. Then, for every still-unvisited row in run order (only possible inside a parent cycle), make it
   an extra root and walk from it [R8, R11].
5. Sort the root list by run-order position (the extra roots from step 4 must interleave by time, not
   trail at the end) [R13].
6. Materialize `AgentRunNode`s recursively, following only the edges actually taken by the walk (a
   visited-set check stops a cycle from re-emitting its first member under its last) [R8, R11].

`spawnDepth` is copied from the row and never recomputed from tree position, so an orphan whose parent
lives on another feature, is deleted, or was never mirrored keeps its real depth [R12]. Unlike the
toolkit's CLI `tree_order`, there is no indentation level to derive: the frontend draws depth from
nesting and may show `spawnDepth` as data.

## Totals

- `effortSeconds`: `rows.iter().filter_map(|r| r.duration_seconds).sum()` → `0.0` when empty [R17].
- `tokens`: per category, `filter_map(..).sum::<i64>()` [R19].
- `unionSeconds`: collect `(started_at, finished_at)` for rows where both are `Some` and
  `finished_at >= started_at` (the "interval" term), then `union_seconds(&mut intervals)` [R18]:

  ```rust
  fn union_seconds(intervals: &mut [(DateTime<Utc>, DateTime<Utc>)]) -> f64 {
      intervals.sort();
      let mut total = TimeDelta::zero();
      let mut current: Option<(DateTime<Utc>, DateTime<Utc>)> = None;
      for &(start, end) in intervals.iter() {
          match current {
              Some((s, e)) if start <= e => current = Some((s, e.max(end))),
              Some((s, e)) => { total += e - s; current = Some((start, end)); }
              None => current = Some((start, end)),
          }
      }
      if let Some((s, e)) = current { total += e - s; }
      total.num_microseconds().unwrap_or(i64::MAX) as f64 / 1_000_000.0
  }
  ```

  Same merge as the toolkit's `agent_usage.py::union_seconds` (touching intervals merge, which does
  not change the length). Microsecond resolution matches `timestamptz`. `TimeDelta` is chrono 0.4's
  `Duration` (already a dependency via `chrono`).

## Query (`src/harness/reader.rs`)

Project and feature are resolved with the same two `SELECT`s as `read_feature_log` (unknown/deleted →
`ApiError::NotFound`) [R21, R22, R23]. Then one `SELECT`-only query [R14, R15, R24]:

```sql
SELECT id, runtime, agent_role, label, external_id, parent_external_id, spawn_depth, model,
       started_at, finished_at, duration_seconds,
       input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens,
       total_tokens
FROM agent_runs
WHERE project_id = $1
  AND feature_id = $2
  AND deleted_at IS NULL
ORDER BY started_at ASC NULLS LAST, id ASC
```

`project_id = $1` is redundant with `feature_id` (feature ids are a global `bigserial`) but keeps the
query self-evidently scoped to the target project, like the log route's session query. The table is
read directly rather than through the `active_agent_runs` view; see discarded alternative 3.

`read_feature_log` is not refactored to share the lookup: duplicating two short `SELECT`s keeps feature
6's reader byte-for-byte unchanged (R26) at the cost of ~15 lines.

## Test-only schema: `migrations/0002_agent_runs.sql`

A new file, not an edit to `0001_harness_schema.sql`, so the mapping "one toolkit migration → one test
migration" stays visible. Body: every statement of the toolkit's `db/migrations/0004_agent_runs.sql`
verbatim (`create table if not exists agent_runs (...)`, the four `create ... index if not exists`
statements, `create or replace view active_agent_runs ...`, `notify pgrst, 'reload schema';`), with a
header comment naming the source file (toolkit path
`personal_harness/db/migrations/0004_agent_runs.sql`, commit `237fabe`). `notify` is harmless in a
`sqlx::test` database (no listener) and is kept so a `diff` of the statement bodies shows no change.
`0001_harness_schema.sql`'s header comment gains `0004_agent_runs.sql` in its source list.

`test_schema_reproduces_toolkit_agent_runs` checks the catalog, not the file text [R25]:

- `information_schema.columns` for `agent_runs`, ordered by `ordinal_position`, equals the 24-row list
  `(column_name, data_type, is_nullable, column_default)`:
  `id bigint NO nextval('agent_runs_id_seq'::regclass)`, `project_id uuid NO`, `local_id bigint NO`,
  `session_id bigint YES`, `feature_id bigint YES`, `runtime text NO`, `agent_role text YES`,
  `label text YES`, `external_id text NO`, `parent_external_id text YES`, `spawn_depth integer YES`,
  `model text YES`, `started_at timestamp with time zone YES`, `finished_at timestamp with time zone YES`,
  `duration_seconds double precision YES`, `input_tokens`/`cache_read_tokens`/`cache_write_tokens`/
  `output_tokens`/`reasoning_tokens`/`total_tokens bigint YES`, `created_at timestamp with time zone NO
  now()`, `updated_at timestamp with time zone NO now()`, `deleted_at timestamp with time zone YES`
  (defaults `NULL` unless stated).
- `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'agent_runs'::regclass
  ORDER BY 1` equals the sorted set `PRIMARY KEY (id)`,
  `FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`,
  `FOREIGN KEY (session_id) REFERENCES session_log(id) ON DELETE SET NULL`,
  `FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE SET NULL`,
  `CHECK ((runtime = ANY (ARRAY['claude'::text, 'codex'::text])))`.
- `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'agent_runs' ORDER BY indexname`
  contains `agent_runs_external_active` (`... USING btree (project_id, runtime, external_id) WHERE
  (deleted_at IS NULL)`, unique), `agent_runs_local_id` (`(project_id, local_id)`, unique),
  `agent_runs_pkey`, `idx_agent_runs_feature` (`(feature_id, started_at)`),
  `idx_agent_runs_session` (`(session_id)`). Compare full `indexdef` strings; they carry the
  `public.` qualifier Postgres renders.
- `active_agent_runs`: its `information_schema.columns` names equal the table's, and with one live
  and one soft-deleted row seeded, `SELECT count(*) FROM active_agent_runs` is `1`.

The literal renderings above are what Postgres 13+ produces for the toolkit DDL; if the local test
Postgres renders one differently, the implementer records the observed string in
`progress/impl_feature_agent_usage_api.md` after confirming it by applying the toolkit file itself to a
scratch database, and does not change the migration to match.

## Mirror dependency

This route reads `agent_runs` **directly over `DATABASE_URL`** (sqlx), like every other route. It does
**not** call PostgREST or the `upsert_agent_run` RPC. Consequences:

- **Implementation and tests do not depend on the deployed mirror.** Tests run against
  `migrations/0002_agent_runs.sql` in a throwaway `sqlx::test` database.
- **Serving data in production depends on two toolkit-owned artifacts being applied to the target
  mirror:** `db/migrations/0004_agent_runs.sql` (the table — required for the route to answer at all)
  and `db/rpc/upsert_agent_run.sql` (the RPC `sync_postgres.sh` uses to fill it — required for the
  table to contain anything). The current `./init.sh` warning (`PGRST202`, `public.upsert_agent_run`
  not found) shows the RPC is missing on the mirror today; whether the table exists is unverified (no
  Supabase credentials were available while drafting).
  - Table missing → every usage-route request fails with `500 {"error":"internal error"}` (sqlx
    "relation does not exist", logged via `tracing`). Every other route is unaffected.
  - Table present but RPC missing → the route answers `200` with `runs: []` and zero totals for every
    feature, indistinguishable from "no runs recorded".
- The read-only role behind `DATABASE_URL` needs `SELECT` on `agent_runs`
  (`docs/architecture.md` § "State/mutability").
- Owner of the fix: the DDL lives in the toolkit (`personal_harness/db/`). Applying it to the Supabase
  mirror is either a manual step there or a feature in whichever sibling project owns the mirror schema
  — see open question 1. No Notion card was created and nothing is blocked by this spec.

## Error paths

| Condition | Response | Req |
|---|---|---|
| No / invalid token for the configured auth mode | `401 {"error":"unauthorized"}`, from the extractor, before the handler | R1, R2 |
| Unknown or soft-deleted project | `404 {"error":"not found"}` | R21 |
| Unknown or soft-deleted feature, or feature only in another project | `404 {"error":"not found"}` | R22, R23 |
| Feature exists, no feature run | `200` with the R20 body | R20 |
| Any `sqlx::Error` (including a mirror without `agent_runs`) | `500 {"error":"internal error"}` via the existing `From<sqlx::Error>` | existing behaviour, no new `R<n>` |

## Files to touch

- `migrations/0002_agent_runs.sql` (new) and the header comment of `migrations/0001_harness_schema.sql`.
- `src/harness/reader.rs`: response structs, private `AgentRunDbRow`, `build_run_tree`,
  `union_seconds`, `read_feature_agent_usage`, and unit tests in the existing `#[cfg(test)] mod tests`.
- `src/harness/router.rs`: handler `get_feature_agent_usage`.
- `src/app.rs`: register the route.
- `tests/harness.rs`: `agent_usage_path`, `AgentRunSeed`/`seed_agent_run`, integration tests.
- `tests/auth.rs`: local-mode 401 tests for the new route.
- `docs/architecture.md`: data-flow route list and contract, `src/harness/` layer description, the
  mirror DDL list (add `0004_agent_runs.sql`), and the `migrations/` reproduction note.
- `docs/verification.md`: Level 2 and Level 3 mention of the new route.

## New signatures

```rust
// src/harness/reader.rs
#[derive(Debug, Serialize)]
pub struct AgentUsageResponse {
    pub runs: Vec<AgentRunNode>,
    pub totals: AgentUsageTotals,
}

#[derive(Debug, Serialize)]
pub struct AgentRunNode {
    #[serde(rename = "externalId")] pub external_id: String,
    #[serde(rename = "parentExternalId")] pub parent_external_id: Option<String>,
    pub runtime: String,
    pub role: Option<String>,
    pub label: Option<String>,
    pub model: Option<String>,
    #[serde(rename = "spawnDepth")] pub spawn_depth: Option<i32>,
    #[serde(rename = "startedAt")] pub started_at: Option<String>,
    #[serde(rename = "finishedAt")] pub finished_at: Option<String>,
    #[serde(rename = "durationSeconds")] pub duration_seconds: Option<f64>,
    pub tokens: AgentRunTokens,
    pub children: Vec<AgentRunNode>,
}

#[derive(Debug, Serialize)]
pub struct AgentRunTokens {
    pub input: Option<i64>,
    #[serde(rename = "cacheRead")] pub cache_read: Option<i64>,
    #[serde(rename = "cacheWrite")] pub cache_write: Option<i64>,
    pub output: Option<i64>,
    pub reasoning: Option<i64>,
    pub total: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AgentUsageTotals {
    #[serde(rename = "effortSeconds")] pub effort_seconds: f64,
    #[serde(rename = "unionSeconds")] pub union_seconds: f64,
    pub tokens: TokenTotals,
}

#[derive(Debug, Default, Serialize)]
pub struct TokenTotals {
    pub input: i64,
    #[serde(rename = "cacheRead")] pub cache_read: i64,
    #[serde(rename = "cacheWrite")] pub cache_write: i64,
    pub output: i64,
    pub reasoning: i64,
    pub total: i64,
}

// private
#[derive(Debug, FromRow)]
struct AgentRunDbRow {
    id: i64,
    runtime: String,
    agent_role: Option<String>,
    label: Option<String>,
    external_id: String,
    parent_external_id: Option<String>,
    spawn_depth: Option<i32>,
    model: Option<String>,
    started_at: Option<DateTime<Utc>>,
    finished_at: Option<DateTime<Utc>>,
    duration_seconds: Option<f64>,
    input_tokens: Option<i64>,
    cache_read_tokens: Option<i64>,
    cache_write_tokens: Option<i64>,
    output_tokens: Option<i64>,
    reasoning_tokens: Option<i64>,
    total_tokens: Option<i64>,
}

fn build_run_tree(rows: &[AgentRunDbRow]) -> Vec<AgentRunNode>;
fn union_seconds(intervals: &mut [(DateTime<Utc>, DateTime<Utc>)]) -> f64;

pub async fn read_feature_agent_usage(
    pool: &PgPool,
    project_slug: &str,
    feature_name: &str,
) -> Result<AgentUsageResponse, ApiError>;
```

`TokenTotals` is `pub` and free of per-feature naming so feature 10 (`dashboard_agent_usage_stats`) can
reuse it for its cross-project block.

```rust
// src/harness/router.rs
pub async fn get_feature_agent_usage(
    State(state): State<AppState>,
    _user: AuthUser,
    Path((slug, name)): Path<(String, String)>,
) -> Result<Json<AgentUsageResponse>, ApiError>;
```

```rust
// src/app.rs
.route(
    "/api/harness/projects/{slug}/features/{name}/agent-usage",
    get(get_feature_agent_usage),
)
```

## Test plan and requirement coverage

Integration tests live in `tests/harness.rs`, use `#[sqlx::test]` and the supabase-mode app from
`build_test_app`, except the two local-mode tests in `tests/auth.rs`. New helpers, leaving existing
ones untouched:

```rust
fn agent_usage_path(slug: &str, name: &str) -> String;

struct AgentRunSeed<'a> {
    local_id: i64,
    feature_id: Option<i64>,
    runtime: &'a str,
    external_id: &'a str,
    parent_external_id: Option<&'a str>,
    spawn_depth: Option<i32>,
    agent_role: Option<&'a str>,
    label: Option<&'a str>,
    model: Option<&'a str>,
    started_offset_secs: Option<i64>,   // seconds after B = 2026-01-01T00:00:00Z
    finished_offset_secs: Option<i64>,
    duration_seconds: Option<f64>,
    tokens: [Option<i64>; 6],           // input, cache_read, cache_write, output, reasoning, total
    deleted: bool,
}

async fn seed_agent_run(pool: &PgPool, project_id: Uuid, s: AgentRunSeed<'_>) -> i64;
```

A fixed base time (not `now()`) makes every `startedAt`/`finishedAt` string assertable literally.

**Coverage grouping** (`docs/specs.md` § "Coverage granularity"): rows covering several requirements
assert the complete JSON body with `assert_eq!` against a `json!` value, so each listed requirement is
exercised. Every `R1`–`R26` appears in at least one row.

| Test | Covers |
|---|---|
| `agent_usage_returns_run_tree_and_totals`: the five runs of the example above (`lead`, `impl`, `rev`, `explore`, codex `thread-x` whose parent `outside-thread` does not exist), inserted in the order `rev`, `thread-x`, `explore`, `lead`, `impl` so `id` order differs from run order; asserts the full body, including `unionSeconds` `110.0` (`[0,100] ∪ [10,40] ∪ [20,30] ∪ [50,70] ∪ [200,210]`) and `effortSeconds` `170.0` | R3, R4, R5, R7, R8, R9, R10, R12, R13, R16, R17, R18, R19 |
| `agent_usage_renders_nulls_and_orders_by_start_then_id`: `n1` with every nullable column `NULL` (no start); `n2` start 0, no finish, duration 5.0; `n3` start 10, finish 5 (inverted); `n5` start 20, finish 30; `n4` start 20, finish 30, input 7, other tokens `NULL` (`n3`, `n4`, `n5` have `NULL` duration) — inserted `n1, n2, n3, n5, n4`; asserts runs order `n2, n3, n5, n4, n1`, every nullable key present as `null` on `n1`, `unionSeconds` `10.0`, `effortSeconds` `5.0`, `totals.tokens` `{input:7, others 0}` | R4, R5, R6, R13, R17, R18, R19 |
| `agent_usage_places_runs_without_a_parent_at_root`: on the target feature, `self` (parent `self`, depth 1), claude `cross` (parent `codex-lead`, depth 2) next to a codex run `codex-lead`, `child-of-gone` (parent `gone`, a soft-deleted run of this feature, depth 1), `elsewhere` (parent `other-lead`, a live run of another feature of the same project, depth 1); asserts all four plus `codex-lead` are top-level in run order with their seeded `spawnDepth` and empty `children` | R10, R12, R13 |
| `agent_usage_breaks_parent_cycles_at_the_earliest_run`: `a` (start 0, parent `b`), `c` (start 5, parent `a`), `b` (start 10, parent `a`); asserts `runs` = `[a{children:[c, b]}]`, and each external id occurs once in the body | R8, R9, R11, R13 |
| `agent_usage_excludes_deleted_runs_and_other_features`: target feature with one live run and one soft-deleted run; a run on another feature of the same project; a run with `feature_id NULL`; a run on a same-named feature of another project; asserts `runs` holds only the live run and every `totals` value equals that run's values | R14, R15 |
| `agent_usage_with_no_runs_returns_empty_tree_and_zero_totals`: feature with sessions but no `agent_runs` row; asserts the exact R20 body | R3, R16, R19, R20 |
| `agent_usage_for_unknown_or_deleted_project_returns_404` | R21 |
| `agent_usage_for_unknown_or_deleted_feature_returns_404` | R22 |
| `agent_usage_does_not_cross_projects`: feature exists only in project `b`, requested under project `a` | R23 |
| `test_schema_reproduces_toolkit_agent_runs`: catalog checks from § "Test-only schema" | R25 |
| `feature_log_is_unchanged_when_agent_runs_exist`: GET the log route for a feature, seed two runs on it, GET again; asserts both bodies are equal and the top-level keys are exactly `feature`, `sessions` | R26 |
| `union_seconds_counts_overlaps_once` (unit, `src/harness/reader.rs`): `[]→0.0`; `[0,10],[5,15]→15.0`; `[0,10],[20,30]→20.0`; `[0,30],[5,10]→30.0`; `[0,10],[10,20]→20.0`; unsorted `[20,30],[0,10]→20.0`; `[0,0.5s]→0.5` | R18 |
| `build_run_tree_handles_orphans_and_cycles` (unit): in-memory rows for a chain, an orphan, a self-parent and a two-node cycle; asserts the nested `external_id` structure | R8, R9, R10, R11 |
| `harness_endpoints_return_401_without_a_valid_token` (extended): also iterates `agent_usage_path("test-project", "first_feat")` over every `unauthorized_cases()` entry | R1 |
| `tests/auth.rs`: `local_mode_rejects_supabase_token_on_agent_usage` and `local_mode_rejects_missing_token_on_agent_usage` (lazy pool; the 401 happens before any query) | R2 |
| `reader_performs_only_select_queries` (extended): seeds one run on `blocked_feat`, then calls `read_feature_agent_usage` on the read-only pool and asserts `runs.len() == 1` | R24 |

## Discarded alternatives

1. **Flat `runs` list with `parentExternalId` and let the frontend build the tree.** Smaller backend
   change, but every consumer would re-implement orphan, cross-runtime and cycle handling, and "runs
   whose parent is not found are returned at the root" (acceptance) would be a client convention instead
   of a tested server contract. Rejected: the tree rules are the hard part and belong next to the
   tests that pin them.
2. **Add the usage data to the log route (`sessions[].agentRuns`).** One request for the feature page,
   but it changes feature 6's contract, and runs are attributed to features by time overlap, not
   strictly nested in one session, so a per-session placement would misrepresent leader runs that span
   a claim. Rejected: the feature description requires the log response to stay unchanged.
3. **Read from the `active_agent_runs` view.** Encodes the `deleted_at` filter once, but every other
   reader query filters `deleted_at IS NULL` explicitly on base tables, the read-only role's grants are
   table-level today, and a view adds a second schema object the route depends on. Rejected for
   consistency; the view is still reproduced in the test schema because R25 requires the full 0004 DDL.
4. **Compute the union and sums in SQL** (window functions / `range_agg` over `tstzrange`).
   `range_agg` needs Postgres 14+, and the tree must be built in Rust anyway, so the rows are already
   in memory. Rejected: no gain, plus a Postgres-version constraint the Supabase-portability rule would
   have to document.
5. **Return `200` with an empty result when `agent_runs` does not exist** (check
   `to_regclass('agent_runs')` first). Keeps the panel quiet on an un-migrated mirror, but masks a
   deployment error as "no runs recorded" and adds a branch no other route has. Rejected for now; see
   open question 2.

## Open questions for the human

1. **Who applies `0004_agent_runs.sql` and `upsert_agent_run.sql` to the Supabase mirror, and should
   feature 9 wait for it?** The spec does not need it to implement or test. If a sibling project owns
   the mirror schema, the leader can propose a cross-project card (`AGENTS.md` §8); otherwise it is a
   manual toolkit step. Recommendation: do not block feature 9 on it.
2. **Missing-table behaviour:** `500` (current design) or empty `200` (discarded alternative 5)?
3. **Nested tree vs flat list:** the frontend's `feature_agent_usage_panel` card is not in the frontend
   harness yet, so the shape has not been confirmed from the consumer side.
4. **Key names** `effortSeconds` / `unionSeconds` / `role`: acceptable, or should they mirror the
   toolkit CLI wording (e.g. `agentEffortSeconds`, `activeWallSeconds`)?
