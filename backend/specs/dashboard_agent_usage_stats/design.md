# Design — dashboard_agent_usage_stats

Conventions are not re-derived here. Layers, the dependency allowlist, the `{"error": ...}` envelope
and the read-only rule come from `docs/architecture.md` (§ "Principles", § "Data Flow", § "Data source:
the toolkit's Postgres mirror"); naming, file structure, test layout and `sqlx::test` isolation come
from `docs/conventions.md`. This design only records choices made inside those boundaries. It extends
`specs/dashboard_stats_api/` (route, `read_dashboard`, ranking style) and reuses the token vocabulary
of `specs/feature_agent_usage_api/` (`TokenTotals`, `effortSeconds`, stored `total_tokens`).

No new route, no new dependency, no new layer, no migration change (`migrations/0002_agent_runs.sql`
from feature 9 already reproduces `agent_runs`), no CORS change, no new `ApiError` variant, no UI (so
no `## Visual direction` section; the visual side belongs to the frontend's
`dashboard_agent_usage_cards`).

## Route

Unchanged: `GET /api/harness/dashboard`, `get_dashboard` handler, `AuthUser` extractor, both auth
modes. Only the `200` body grows by one key. `get_dashboard` and `src/app.rs` need no edit, because
the handler already serializes whatever `read_dashboard` returns.

## Response contract (200)

Example for the fixture of `dashboard_agent_usage_aggregates_runs_across_projects` (§ "Test plan"):

```json
{
  "overall": { "...": "unchanged, see specs/dashboard_stats_api/design.md" },
  "topProjects": [ "...unchanged..." ],
  "agentUsage": {
    "runs": 5,
    "effortSeconds": 144.75,
    "tokens": { "input": 416, "cacheRead": 1500, "cacheWrite": 300, "output": 171, "reasoning": 20, "total": 2387 },
    "byRuntime": {
      "claude": { "runs": 3, "effortSeconds": 130.5, "tokens": { "input": 16, "cacheRead": 1500, "cacheWrite": 300, "output": 71, "reasoning": 0, "total": 1887 } },
      "codex":  { "runs": 2, "effortSeconds": 14.25, "tokens": { "input": 400, "cacheRead": 0, "cacheWrite": 0, "output": 100, "reasoning": 20, "total": 500 } }
    },
    "byModel": [
      { "model": "claude-opus-5-5", "runs": 2, "effortSeconds": 130.5, "tokens": { "input": 15, "cacheRead": 1500, "cacheWrite": 300, "output": 70, "reasoning": 0, "total": 1885 } },
      { "model": "gpt-5-codex",     "runs": 2, "effortSeconds": 14.25, "tokens": { "input": 400, "cacheRead": 0, "cacheWrite": 0, "output": 100, "reasoning": 20, "total": 500 } },
      { "model": null,              "runs": 1, "effortSeconds": 0.0,   "tokens": { "input": 1, "cacheRead": 0, "cacheWrite": 0, "output": 1, "reasoning": 0, "total": 2 } }
    ],
    "byRole": [
      { "role": "leader",      "runs": 1, "effortSeconds": 100.0, "tokens": { "input": 10, "cacheRead": 1000, "cacheWrite": 200, "output": 50, "reasoning": 0, "total": 1260 } },
      { "role": "implementer", "runs": 2, "effortSeconds": 42.75, "tokens": { "input": 105, "cacheRead": 500, "cacheWrite": 100, "output": 60, "reasoning": 8, "total": 765 } },
      { "role": "reviewer",    "runs": 1, "effortSeconds": 2.0,   "tokens": { "input": 300, "cacheRead": 0, "cacheWrite": 0, "output": 60, "reasoning": 12, "total": 360 } },
      { "role": null,          "runs": 1, "effortSeconds": 0.0,   "tokens": { "input": 1, "cacheRead": 0, "cacheWrite": 0, "output": 1, "reasoning": 0, "total": 2 } }
    ],
    "topProjects": [
      { "slug": "alpha", "runs": 3, "effortSeconds": 142.75, "tokens": { "input": 115, "cacheRead": 1500, "cacheWrite": 300, "output": 110, "reasoning": 8, "total": 2025 } },
      { "slug": "beta",  "runs": 2, "effortSeconds": 2.0,    "tokens": { "input": 301, "cacheRead": 0, "cacheWrite": 0, "output": 61, "reasoning": 12, "total": 362 } }
    ]
  }
}
```

Field decisions (requirement ids in brackets):

- camelCase keys, like every existing endpoint. `role` is `agent_role` renamed, exactly as the
  feature-9 run node does [R11].
- `agentUsage` is nested under its own key instead of adding seven siblings to `overall` /
  `topProjects`, so the feature-8 keys stay byte-identical and the consumer card reads one subtree
  [R1, R2, R3]. The nested `agentUsage.topProjects` reuses the name `topProjects` deliberately: same
  meaning (a top-10 project ranking), different metric.
- Every aggregate is a **usage bucket** `{runs, effortSeconds, tokens}`: the totals, each runtime,
  each model, each role and each ranked project all have the same three keys, so the frontend renders
  every card from one type [R4, R8, R9, R11, R13].
- `tokens` is the feature-9 `TokenTotals` shape (`input`, `cacheRead`, `cacheWrite`, `output`,
  `reasoning`, `total`), integers, never `null`, `0` when nothing is summable. `total` is the sum of
  the stored `total_tokens` column, not a recomputation [R4].
- `effortSeconds` is a JSON float (`f64`): integer-valued sums serialize as `100.0`, and tests compare
  against float literals (`json!(100.0)`) because `serde_json` treats `Number(100.0)` and `Number(100)`
  as unequal [R4, R18].
- `byRuntime` is an object with both keys always present (zero bucket when a runtime has no run),
  like `byStatus` on `overall`. The mirror's `CHECK (runtime IN ('claude','codex'))` guarantees no third
  value can appear [R8, R18].
- `byModel` / `byRole` are arrays, because their key sets are open-ended. A `NULL` column value is its
  own group, rendered with `"model": null` / `"role": null` (key always present, no
  `skip_serializing_if`), so the bucket sums of each breakdown add up to the totals [R9, R11].
- `byModel` / `byRole` are not truncated: their cardinality is the number of distinct models / roles
  ever recorded (a handful). Only the project ranking is capped at 10, as the feature description asks
  [R9, R11, R16, R17].
- Every `agentUsage.topProjects[].slug` is `projects.slug` unchanged. The run query and
  `GET /api/harness/projects/{slug}/state` share the `p.deleted_at IS NULL` filter, so a slug returned
  here never 404s there [R6, R13].
- No union-of-intervals figure: across independent projects a "wall time" union mixes unrelated
  sessions and needs every row in memory; the feature asks only for summed effort.

## Counted runs

A run counts when the run row and its project are not soft-deleted [R5, R6]. Feature attribution is
deliberately ignored [R7]: runs with `feature_id IS NULL` (e.g. a leader run outside any claim), runs
on a soft-deleted feature and runs on a `superseded` feature still consumed tokens, and dropping them
would make the dashboard total disagree with the toolkit's own per-project `stats`. This is the one
place where the dashboard's agent block and its progress block (which excludes deleted and
superseded features) use different inclusion rules; see open question 2.

## Query (`src/harness/reader.rs`)

One `SELECT`, no parameters, grouped to the finest key any breakdown needs [R5, R6, R7, R19]:

```sql
SELECT p.slug,
       r.runtime,
       r.model,
       r.agent_role,
       COUNT(*)                                          AS runs,
       COALESCE(SUM(r.duration_seconds), 0)::float8      AS effort_seconds,
       COALESCE(SUM(r.input_tokens), 0)::bigint          AS input_tokens,
       COALESCE(SUM(r.cache_read_tokens), 0)::bigint     AS cache_read_tokens,
       COALESCE(SUM(r.cache_write_tokens), 0)::bigint    AS cache_write_tokens,
       COALESCE(SUM(r.output_tokens), 0)::bigint         AS output_tokens,
       COALESCE(SUM(r.reasoning_tokens), 0)::bigint      AS reasoning_tokens,
       COALESCE(SUM(r.total_tokens), 0)::bigint          AS total_tokens
FROM agent_runs r
JOIN projects p ON p.id = r.project_id
WHERE p.deleted_at IS NULL
  AND r.deleted_at IS NULL
GROUP BY p.id, p.slug, r.runtime, r.model, r.agent_role
ORDER BY p.slug, r.runtime, r.model NULLS LAST, r.agent_role NULLS LAST
```

- The `::bigint` casts are required: Postgres `SUM(bigint)` returns `numeric`, which the current
  `sqlx` feature set cannot decode into `i64` (`bigdecimal`/`rust_decimal` are not in the allowlist).
  `SUM(double precision)` is already `float8`; the cast documents it.
- `COALESCE` turns an all-`NULL` group into `0` / `0.0`, so the R4 "non-null values, `0` when none"
  rule holds per group.
- There is no `features` join, so feature state cannot filter anything out [R7].
- The `ORDER BY` fixes the Rust fold order, so the `f64` sums are reproducible across requests. Test
  fixtures use dyadic durations (`30.5`, `12.25`) whose sums are exact in any order.
- Row count is bounded by distinct `(project, runtime, model, role)` combinations (tens to low
  hundreds), not by the number of runs, so folding in Rust stays cheap.

`read_dashboard` runs this query after its existing feature-count query, on the same pool. The
existing feature-count query, its fold and its sort are not modified [R2].

## Fold (`fold_agent_usage`)

Pure function over the grouped rows, unit-testable without a database:

1. For each row build a `UsageBucket` from its columns, then add it into: the overall bucket; the
   `claude` or `codex` bucket by `runtime`; a `BTreeMap<Option<String>, UsageBucket>` keyed by `model`;
   one keyed by `agent_role`; a `BTreeMap<String, UsageBucket>` keyed by `slug` [R4, R8, R9, R11, R13].
2. Projects only enter the slug map through a row, so a project with no counted run never appears
   [R14].
3. Convert each model/role map to a `Vec` and sort it by `(tokens.total desc, key)` where the key
   comparator is `(Some(a), Some(b)) => a.cmp(b)` (byte-wise `str::cmp`), `Some(_) < None` — i.e.
   `null` last among equal totals [R10, R12].
4. Convert the slug map to a `Vec`, sort by `(tokens.total desc, slug asc via str::cmp)`, then
   `truncate(TOP_PROJECTS_LIMIT)` (the existing constant, `10`) [R15, R16, R17]. The overall bucket is
   summed before truncation, so it always covers every project [R4].
5. `effortSeconds` accumulates with `+=` starting from `0.0`, never `Iterator::sum::<f64>()` on a
   possibly empty iterator (which yields `-0.0`, serialized as `-0.0`; the same trap feature 9 notes
   in `agent_usage_totals`) [R18].

`UsageBucket::add(&mut self, other: &UsageBucket)` sums `runs`, `effort_seconds` and every
`TokenTotals` field. Token sums use plain `+` on `i64`; overflow would need more than 9.2 × 10^18
tokens and is not guarded.

## Mirror dependency

`read_dashboard` now reads `agent_runs`, so the dashboard route depends on the toolkit's
`db/migrations/0004_agent_runs.sql` being applied to the target mirror, exactly like the feature-9
route (`docs/architecture.md` § "Data source"):

- Table missing → the **whole** dashboard request fails with `500 {"error":"internal error"}`
  (sqlx "relation does not exist", logged via `tracing`). This is a wider blast radius than feature 9:
  the progress cards (`overall` / `topProjects`), which work today without the table, stop rendering
  too. See open question 1.
- Table present but the `upsert_agent_run` RPC missing → `200` with `agentUsage` equal to the R18 empty
  value, indistinguishable from "no runs recorded".
- The read-only role behind `DATABASE_URL` already needs `SELECT` on `agent_runs` for feature 9.

## Error paths

| Condition | Response | Req |
|---|---|---|
| No / invalid token for the configured auth mode | `401 {"error":"unauthorized"}`, unchanged from `dashboard_stats_api` R1/R2 | none new |
| No counted run (empty table, or only soft-deleted rows / projects) | `200` with the R18 `agentUsage` value, `overall` / `topProjects` unaffected | R2, R18 |
| Any `sqlx::Error` (including a mirror without `agent_runs`) | `500 {"error":"internal error"}` via the existing `From<sqlx::Error>` | existing behaviour, no new `R<n>` |

## Files to touch

- `src/harness/reader.rs`: `agent_usage` field on `DashboardResponse`, new response structs, private
  `AgentUsageGroupDbRow`, `fold_agent_usage`, the second query inside `read_dashboard`, and a unit test
  in the existing `#[cfg(test)] mod tests`.
- `tests/harness.rs`: `empty_agent_usage()` helper, the two full-body dashboard tests updated, new
  integration tests, `reader_performs_only_select_queries` extended.
- `docs/architecture.md`: dashboard contract in the data-flow route list, and the mirror-dependency
  paragraph (the dashboard now also needs `agent_runs`).
- `docs/verification.md`: Level 2 and Level 3 mention of `agentUsage`.

Not touched: `src/harness/router.rs`, `src/app.rs`, `tests/auth.rs`, `migrations/`.

## New signatures

```rust
// src/harness/reader.rs
#[derive(Debug, Serialize)]
pub struct DashboardResponse {
    pub overall: OverallProgress,
    #[serde(rename = "topProjects")] pub top_projects: Vec<ProjectProgress>,
    #[serde(rename = "agentUsage")] pub agent_usage: DashboardAgentUsage,   // new field
}

#[derive(Debug, Default, Serialize)]
pub struct UsageBucket {
    pub runs: i64,
    #[serde(rename = "effortSeconds")] pub effort_seconds: f64,
    pub tokens: TokenTotals,            // existing feature-9 struct, gains `Clone` if needed
}

#[derive(Debug, Serialize)]
pub struct DashboardAgentUsage {
    #[serde(flatten)] pub totals: UsageBucket,
    #[serde(rename = "byRuntime")] pub by_runtime: RuntimeBreakdown,
    #[serde(rename = "byModel")] pub by_model: Vec<ModelUsage>,
    #[serde(rename = "byRole")] pub by_role: Vec<RoleUsage>,
    #[serde(rename = "topProjects")] pub top_projects: Vec<ProjectUsage>,
}

#[derive(Debug, Default, Serialize)]
pub struct RuntimeBreakdown {
    pub claude: UsageBucket,
    pub codex: UsageBucket,
}

#[derive(Debug, Serialize)]
pub struct ModelUsage {
    pub model: Option<String>,
    #[serde(flatten)] pub usage: UsageBucket,
}

#[derive(Debug, Serialize)]
pub struct RoleUsage {
    pub role: Option<String>,
    #[serde(flatten)] pub usage: UsageBucket,
}

#[derive(Debug, Serialize)]
pub struct ProjectUsage {
    pub slug: String,
    #[serde(flatten)] pub usage: UsageBucket,
}

// private
#[derive(Debug, FromRow)]
struct AgentUsageGroupDbRow {
    slug: String,
    runtime: String,
    model: Option<String>,
    agent_role: Option<String>,
    runs: i64,
    effort_seconds: f64,
    input_tokens: i64,
    cache_read_tokens: i64,
    cache_write_tokens: i64,
    output_tokens: i64,
    reasoning_tokens: i64,
    total_tokens: i64,
}

impl UsageBucket { fn add(&mut self, other: &UsageBucket); }
fn fold_agent_usage(rows: &[AgentUsageGroupDbRow]) -> DashboardAgentUsage;

// unchanged signature
pub async fn read_dashboard(pool: &PgPool) -> Result<DashboardResponse, ApiError>;
```

`#[serde(flatten)]` is serialize-only here (no `Deserialize` derive), where `serde_json` handles it
without the buffering caveats flatten has on deserialization. If the implementer prefers explicit
fields over `flatten`, the JSON contract above is what is binding, not the Rust layout.

## Test plan and requirement coverage

Integration tests live in `tests/harness.rs`, use `#[sqlx::test]` and the supabase-mode app from
`build_test_app`. They reuse the existing `seed_project`, `seed_feature`,
`seed_features_with_statuses`, `AgentRunSeed`/`run_seed`/`seed_agent_run` helpers. One new helper:

```rust
/// The R18 value: what `agentUsage` must be when no counted run exists.
fn empty_agent_usage() -> Value;
```

**Updating the existing dashboard tests.** Of the seven feature-8 dashboard tests, exactly two assert
the full body and would fail once `agentUsage` exists: `dashboard_with_empty_mirror_returns_zeroes`
and `dashboard_aggregates_counts_across_projects`. Each gains exactly one key,
`"agentUsage": empty_agent_usage()`; their `overall` / `topProjects` literals are not edited, and the
diff of these two tests must show added lines only. The other five index into `body["overall"]` /
`body["topProjects"]` and are not touched; they keep passing unchanged, which is itself R2 evidence.

**Fixture of `dashboard_agent_usage_aggregates_runs_across_projects`** (tokens listed as
`[input, cacheRead, cacheWrite, output, reasoning, total]`):

| Project | Run | runtime | role | model | feature | duration | tokens | deleted |
|---|---|---|---|---|---|---|---|---|
| `alpha` | `r1` | claude | leader | `claude-opus-5-5` | `a1` (done) | 100.0 | `[10,1000,200,50,null,1260]` | no |
| `alpha` | `r2` | claude | implementer | `claude-opus-5-5` | `NULL` | 30.5 | `[5,500,100,20,null,625]` | no |
| `alpha` | `r3` | codex | implementer | `gpt-5-codex` | `a2` (superseded) | 12.25 | `[100,0,0,40,8,140]` | no |
| `alpha` | `r4` | claude | reviewer | `claude-sonnet-5` | `a1` | 1000.0 | `[1,1,1,1,1,99999]` | **yes** |
| `beta` | `r5` | claude | `NULL` | `NULL` | `b1` (soft-deleted feature) | `NULL` | `[1,0,0,1,null,2]` | no |
| `beta` | `r6` | codex | reviewer | `gpt-5-codex` | `NULL` | 2.0 | `[300,0,0,60,12,360]` | no |
| `gamma` | — | no runs; one `pending` feature | | | | | | |
| `gone` (soft-deleted project) | `r7` | claude | leader | `claude-opus-5-5` | `NULL` | 50.0 | `[1,1,1,1,1,5000]` | no |

Expected `agentUsage` is the example in § "Response contract". Expected `overall` is
`{done:1, total:2, percentage:50.0, byStatus:{pending:1, ..., done:1}}` and `topProjects` is
`[{alpha,1,1,100.0},{gamma,0,1,0.0}]` (feature-8 rules: `alpha`'s `a2` is superseded and `beta`'s only
feature is soft-deleted, so neither counts there, while their runs `r3` / `r5` do count here).

**Coverage grouping** (`docs/specs.md` § "Coverage granularity"): rows covering several requirements
assert the complete JSON body (or the complete `agentUsage` subtree) with `assert_eq!` against a
`json!` value, so each listed requirement is exercised. Every `R1`–`R19` appears in at least one row.

| Test | Covers |
|---|---|
| `dashboard_with_empty_mirror_returns_zeroes` and `dashboard_aggregates_counts_across_projects`, updated as above (full-body asserts with unchanged `overall` / `topProjects` literals plus `"agentUsage": empty_agent_usage()`); the other five feature-8 dashboard tests, unchanged and still passing | R1, R2, R3, R18 |
| `dashboard_agent_usage_aggregates_runs_across_projects`: fixture above; asserts the full body (all three top-level keys), then `GET /api/harness/projects/{slug}/state` → `200` for every `agentUsage.topProjects[].slug` | R1, R2, R3, R4, R5, R6, R7, R8, R9, R11, R13, R14, R16 |
| `dashboard_agent_usage_orders_breakdowns_and_ranking`: projects `p-a` (run model `m-b`, role `implementer`, total 100), `p-b` (model `m-a`, role `explorer`, total 100), `p-c` (model `m-z`, role `reviewer`, total 300), `p-d` (two runs, all token columns `NULL`: one model `m-c` role `leader`, one model `NULL` role `NULL`); asserts `topProjects` slugs `[p-c, p-a, p-b, p-d]`, `byModel` models `[m-z, m-a, m-b, m-c, null]`, `byRole` roles `[reviewer, explorer, implementer, leader, null]`, and that `p-d` is present with `tokens.total` `0` | R10, R12, R14, R15 |
| `dashboard_agent_usage_limits_top_projects_to_ten`: 12 projects `u01`…`u12`, each with one run of `total_tokens = (13 - n) * 10`; asserts `topProjects` slugs are exactly `u01`…`u10` in order, while `agentUsage.runs` is `12` and `agentUsage.tokens.total` is `780` (all 12 projects) | R4, R16, R17 |
| `dashboard_agent_usage_is_empty_when_only_deleted_runs_exist`: live project with one soft-deleted run and one feature; soft-deleted project with one live run; asserts `agentUsage == empty_agent_usage()` and `overall` / `topProjects` equal the feature-8 values for that data | R2, R5, R6, R14, R18 |
| `fold_agent_usage_groups_and_sorts` (unit, `src/harness/reader.rs`): in-memory rows; asserts `fold_agent_usage(&[])` serializes to the R18 value (including `effortSeconds` `0.0`, not `-0.0`), a `null` model/role sorts after an equal-total non-null one, and slug order is byte-wise (`"B"` before `"a"`) | R10, R12, R15, R18 |
| `reader_performs_only_select_queries` (extended): the run it already seeds is counted; call `read_dashboard` on the read-only pool and assert `agent_usage.totals.runs == 1` | R19 |

## Discarded alternatives

1. **A separate route `GET /api/harness/dashboard/agent-usage`.** Keeps feature 8's body untouched and
   isolates the mirror dependency (a missing `agent_runs` table would only break the new cards).
   Rejected because the feature description and its acceptance explicitly ask to extend
   `/api/harness/dashboard` with an `agentUsage` block; it also costs the dashboard a second request.
   It is the natural fallback if open question 1 is answered "isolate the failure".
2. **Aggregate each breakdown in its own SQL query** (one `GROUP BY runtime`, one `GROUP BY model`, one
   `GROUP BY agent_role`, one `GROUP BY slug ... ORDER BY ... LIMIT 10`, one for totals). Simpler Rust,
   but five round trips per dashboard load, `ORDER BY slug` / `model` would follow the database
   collation instead of byte order, and `NULLS LAST` semantics would have to be re-asserted in four
   places. Rejected for one grouped query folded in Rust, the same shape feature 8 uses.
3. **Fetch raw `agent_runs` rows and aggregate everything in Rust** (reusing feature 9's
   `AgentRunDbRow`). No new SQL aggregate, but transfers every run across every project on each
   dashboard load; that grows without bound, unlike the grouped rows. Rejected.
4. **Apply the progress block's inclusion rules to runs** (exclude runs whose feature is soft-deleted
   or `superseded`, or whose `feature_id` is `NULL`). Would make the two dashboard blocks consistent
   with each other, but the excluded tokens were really spent, and the totals would then disagree with
   the toolkit's per-project `harness.sh stats`. Rejected; see open question 2.
5. **Degrade `agentUsage` to the empty value when `agent_runs` does not exist** (`to_regclass` check).
   Protects the progress cards on an un-migrated mirror, but masks a deployment error as "no runs
   recorded" and diverges from feature 9, which returns `500` in the same situation. Rejected for
   consistency; see open question 1.
6. **Return `byRuntime` as an array like `byModel`.** Uniform with the other breakdowns, but the
   runtime set is closed (`CHECK` constraint), and a fixed zero-filled object spares the frontend a
   lookup-with-default, exactly as `byStatus` does. Rejected.

## Open questions for the human

1. **Missing `agent_runs` on the deployed mirror.** With this design the whole dashboard (including
   the progress cards that work today) answers `500` until the table exists. Keep `500` (consistent
   with feature 9), degrade `agentUsage` to empty (alternative 5), or split the route (alternative 1)?
   Recommendation: keep `500`, and confirm the table is applied to the mirror before this ships.
2. **Inclusion rule:** runs with no feature, or on soft-deleted / `superseded` features, are counted.
   Confirm, or align with the progress block (alternative 4).
3. **No cap on `byModel` / `byRole`.** Fine for today's handful of models and roles; say so if the
   cards need a top-N.
4. **Consumer shape:** `dashboard_agent_usage_cards` is not in the frontend harness yet, so key names
   (`agentUsage`, the nested `topProjects`, the usage-bucket shape) have not been confirmed from the
   consumer side.
