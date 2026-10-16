# Design — dashboard_stats_api

Conventions are not re-derived here. Layers, the dependency allowlist, the `{"error": ...}` envelope
and the read-only rule come from `docs/architecture.md` (§ "Principles", § "Data Flow", § "Data source:
the toolkit's Postgres mirror"); naming, file structure, test layout and `sqlx::test` isolation come
from `docs/conventions.md`. This design only records choices made inside those boundaries.

No new dependency, no new layer, no migration change, no CORS change, no new `ApiError` variant, no UI
(so no `## Visual direction` section; the visual side belongs to the frontend's
`progress_dashboard_view`).

## Route

`GET /api/harness/dashboard`, registered in `src/app.rs` next to the existing harness routes,
unconditionally (both auth modes). Protected by the existing `AuthUser` extractor, which rejects before
the handler runs (R1, R2). No path or query parameters. It does not collide with
`/api/harness/projects/...`.

## Response contract (200)

```json
{
  "overall": {
    "done": 31,
    "total": 52,
    "percentage": 59.62,
    "byStatus": {
      "pending": 12,
      "specDrafting": 1,
      "specReady": 2,
      "inProgress": 3,
      "blocked": 3,
      "done": 31
    }
  },
  "topProjects": [
    { "slug": "spectator_backend", "done": 7, "total": 8, "percentage": 87.5 },
    { "slug": "rushr-web-display-db", "done": 7, "total": 12, "percentage": 58.33 }
  ]
}
```

Field decisions (requirement ids in brackets):

- Key casing is camelCase, like every existing endpoint (`inProgress` on `/projects`, `featureNumber`
  on `/log`), so `byStatus` keys are `specDrafting`/`specReady`/`inProgress`, not the raw enum text
  [R4, R7].
- `byStatus` always carries all six keys, zero-filled, so the frontend never has to default missing
  keys [R7, R12]. `superseded` has no key: superseded features are not countable [R9].
- `overall.total` equals the sum of the six `byStatus` values by construction (the six statuses are
  every `feature_status` value except `superseded`) [R5, R7].
- `percentage` is a JSON **float** at 2-decimal precision in every case, including `0.0` and `100.0`.
  Integer tests must compare with float literals (`json!(0.0)`, not `json!(0)`): `serde_json` treats
  `Number(0.0)` and `Number(0)` as unequal [R11, R12, R14].
- JSON numbers cannot carry trailing zeros: `100.00` serializes as `100.0`, `87.50` as `87.5`. The
  backend does not send the percentage as a string to preserve them. The frontend formats every
  `percentage` with exactly 2 decimals for display (e.g. `toFixed(2)` → `"100.00"`, `"87.50"`).
- Every `topProjects[].slug` is `projects.slug` unchanged, so the frontend can make each chart entry
  clickable and navigate to the existing project detail, which reads
  `GET /api/harness/projects/{slug}/state`. That route and this one share the `p.deleted_at IS NULL`
  filter, so a slug returned here never 404s there. No new field or route is needed [R14].
- Features of a soft-deleted project are excluded even if the feature row itself is not deleted,
  consistent with `list_projects` never surfacing a deleted project [R10].

## Percentage and rounding

Computed in Rust from integer counts, never in SQL and never via float division:

```rust
fn completion_hundredths(done: i64, total: i64) -> i64 {
    if total == 0 { 0 } else { (done * 20000 + total) / (2 * total) }
}
```

This is `round_half_up(done * 10000 / total)` in exact integer arithmetic (counts are non-negative,
and `done * 20000` cannot overflow `i64` for any realistic count), i.e. the percentage in hundredths.
Serialized value: `completion_hundredths(..) as f64 / 100.0`. Examples: `1/32` → `313` → `3.13` (tie
3.125 rounded up); `3/32` → `938` → `9.38` (tie 9.375 rounded up); `1/16` → `625` → `6.25`; `1/8` →
`1250` → `12.5`; `1/3` → `3333` → `33.33`; `2/3` → `6667` → `66.67`; `2/7` → `2857` → `28.57`; `0/0` →
`0` → `0.0`; `5/5` → `10000` → `100.0`. IEEE division is correctly rounded, so `3333 as f64 / 100.0` is
the double nearest to 33.33, and `serde_json` prints the shortest round-trip form, `33.33`.

The ranking sorts on the hundredths integer, which is exactly the returned `percentage` value scaled by
100, so R16's "returned value" ordering holds with no float comparison. Two projects with equal `done`
whose percentages round to the same hundredth fall through to slug order.

## Ranking

1. Per-project rows come from one query (below); the `JOIN` drops projects with no countable feature
   [R15].
2. In Rust: build a `ProjectProgress` per row with its hundredths, sort by
   `(done desc, hundredths desc, slug asc)` using `str::cmp` for the slug (byte-wise, independent of the
   database collation), then `truncate(TOP_PROJECTS_LIMIT)` [R16, R17, R18].
3. `overall` is the sum of all per-project rows **before** truncation [R5, R6, R7].

## Query (`src/harness/reader.rs`)

`SELECT`-only, no parameters [R19]:

```sql
SELECT p.slug,
       COUNT(*) FILTER (WHERE f.status = 'pending')       AS pending,
       COUNT(*) FILTER (WHERE f.status = 'spec_drafting') AS spec_drafting,
       COUNT(*) FILTER (WHERE f.status = 'spec_ready')    AS spec_ready,
       COUNT(*) FILTER (WHERE f.status = 'in_progress')   AS in_progress,
       COUNT(*) FILTER (WHERE f.status = 'blocked')       AS blocked,
       COUNT(*) FILTER (WHERE f.status = 'done')          AS done
FROM projects p
JOIN features f ON f.project_id = p.id
WHERE p.deleted_at IS NULL
  AND f.deleted_at IS NULL
  AND f.status <> 'superseded'
GROUP BY p.id, p.slug
```

[R8, R9, R10, R15]. One round trip; the result has one row per counted project, which is small (tens of
projects), so sorting and summing in Rust is cheaper to reason about than a second aggregate query.

## Error paths

| Condition | Response | Req |
|---|---|---|
| No / invalid token for the configured auth mode | `401 {"error":"unauthorized"}`, from the extractor, before the handler | R1, R2 |
| Empty mirror / no countable feature | `200` with zeroed `overall` and `topProjects: []` — never `404`, never a division error | R12, R13 |
| Any `sqlx::Error` | `500 {"error":"internal error"}` via the existing `From<sqlx::Error>` | existing behaviour, no new `R<n>` |

## Files to touch

- `src/harness/reader.rs`: response structs, private `ProjectStatusCountsDbRow`, `completion_hundredths`,
  `TOP_PROJECTS_LIMIT`, `read_dashboard`, and a `#[cfg(test)] mod tests` for `completion_hundredths`.
- `src/harness/router.rs`: handler `get_dashboard`.
- `src/app.rs`: register the route.
- `tests/harness.rs`: seeding helper, `DASHBOARD_PATH`, integration tests (supabase mode).
- `tests/auth.rs`: local-mode 401 tests for the new route.
- `docs/architecture.md`: data-flow route list, `src/harness/` layer description, response contract.
- `docs/verification.md`: Level 2 and Level 3 mention of the new route.

## New signatures

```rust
// src/harness/reader.rs
const TOP_PROJECTS_LIMIT: usize = 10;

#[derive(Debug, Serialize)]
pub struct DashboardResponse {
    pub overall: OverallProgress,
    #[serde(rename = "topProjects")] pub top_projects: Vec<ProjectProgress>,
}

#[derive(Debug, Serialize)]
pub struct OverallProgress {
    pub done: i64,
    pub total: i64,
    pub percentage: f64,
    #[serde(rename = "byStatus")] pub by_status: StatusBreakdown,
}

#[derive(Debug, Default, Serialize)]
pub struct StatusBreakdown {
    pub pending: i64,
    #[serde(rename = "specDrafting")] pub spec_drafting: i64,
    #[serde(rename = "specReady")] pub spec_ready: i64,
    #[serde(rename = "inProgress")] pub in_progress: i64,
    pub blocked: i64,
    pub done: i64,
}

#[derive(Debug, Serialize)]
pub struct ProjectProgress {
    pub slug: String,
    pub done: i64,
    pub total: i64,
    pub percentage: f64,
}

// private
#[derive(Debug, FromRow)]
struct ProjectStatusCountsDbRow {
    slug: String,
    pending: i64,
    spec_drafting: i64,
    spec_ready: i64,
    in_progress: i64,
    blocked: i64,
    done: i64,
}

fn completion_hundredths(done: i64, total: i64) -> i64;

pub async fn read_dashboard(pool: &PgPool) -> Result<DashboardResponse, ApiError>;
```

```rust
// src/harness/router.rs
pub async fn get_dashboard(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Result<Json<DashboardResponse>, ApiError>;
```

```rust
// src/app.rs
.route("/api/harness/dashboard", get(get_dashboard))
```

## Test plan and requirement coverage

Integration tests live in `tests/harness.rs`, use `#[sqlx::test]` and the supabase-mode app from
`build_test_app`, except the two local-mode tests in `tests/auth.rs`. New helper, leaving the existing
`seed_*` helpers untouched:

```rust
const DASHBOARD_PATH: &str = "/api/harness/dashboard";

// Seeds one non-deleted feature per status, numbered from `first_number`, named `f<number>`.
async fn seed_features_with_statuses(pool: &PgPool, project_id: Uuid, first_number: i32, statuses: &[&str]);
```

Soft-deleted features use the existing `seed_feature(..., deleted: true)`; soft-deleted projects use
`seed_project(..., deleted: true)`.

**Coverage grouping** (`docs/specs.md` § "Coverage granularity"): rows covering several requirements
assert the complete JSON body with `assert_eq!` against a `json!` value, so each listed requirement is
exercised. Every `R1`–`R19` appears in at least one row.

| Test | Covers |
|---|---|
| `dashboard_with_empty_mirror_returns_zeroes`: no rows at all; asserts the full body `{"overall": <R12 value>, "topProjects": []}` | R3, R4, R7, R12, R13 |
| `dashboard_aggregates_counts_across_projects`: project `alpha` with one feature in each of the six countable statuses plus one extra `done`, project `beta` with 1 `done` + 2 `pending`; asserts the full body (overall `done` 3, `total` 10, `percentage` 30.0, every `byStatus` value, `topProjects` = `[{alpha,2,7,28.57},{beta,1,3,33.33}]`); then, for each returned `slug`, `GET /api/harness/projects/{slug}/state` with the same token returns `200` | R3, R4, R5, R6, R7, R11, R14, R16, R17 |
| `dashboard_excludes_deleted_and_superseded_features`: `alpha` has 1 `done`, 1 `pending`, 1 soft-deleted `done`, 1 `superseded`; `beta` has only a `superseded` and a soft-deleted `pending`; `gamma` has no features; asserts overall `{done:1,total:2,percentage:50.0}` and `topProjects` = `[alpha]` only | R8, R9, R15 |
| `dashboard_excludes_deleted_projects`: a soft-deleted project with 3 non-deleted `done` features and a live one with 1 `pending`; asserts overall counts only the live project and the deleted slug is absent from `topProjects` | R10 |
| `dashboard_percentage_is_zero_when_nothing_is_countable`: one project whose only features are `superseded` / soft-deleted; asserts `overall` equals the R12 value and `topProjects` is `[]` | R9, R12, R13, R15 |
| `dashboard_orders_projects_by_done_then_percentage_then_slug`: `c-proj` 2/2, `a-proj` 1/1, `b-proj` 1/1, `d-proj` 1/4, `e-proj` 0/3; expects `c-proj, a-proj, b-proj, d-proj, e-proj` | R16 |
| `dashboard_limits_top_projects_to_ten`: 12 projects `p01`…`p12` where `pNN` has `13 - NN` done features of `13 - NN` total; asserts exactly `p01`…`p10` in order and that `overall.total` still counts all 12 projects | R5, R17, R18 |
| `completion_hundredths_rounds_half_up` (unit, `src/harness/reader.rs`): `(0,0)→0`, `(0,3)→0`, `(1,32)→313`, `(3,32)→938`, `(1,16)→625`, `(1,8)→1250`, `(1,3)→3333`, `(2,3)→6667`, `(2,7)→2857`, `(5,5)→10000`; plus `serde_json::to_string(&(3333 as f64 / 100.0)) == "33.33"` and `serde_json::to_string(&(10000 as f64 / 100.0)) == "100.0"` | R11, R14 |
| `harness_endpoints_return_401_without_a_valid_token` (extended): also iterates `DASHBOARD_PATH` over every `unauthorized_cases()` entry | R1 |
| `tests/auth.rs`: `local_mode_rejects_supabase_token_on_dashboard` and `local_mode_rejects_missing_token_on_dashboard` (lazy pool; the 401 happens before any query) | R2 |
| `reader_performs_only_select_queries` (extended): also calls `read_dashboard` on the read-only pool and asserts `overall.total` equals the seeded count | R19 |

## Discarded alternatives

1. **Compute percentages, ordering and `LIMIT 10` in SQL** (`round(done * 100.0 / NULLIF(total, 0), 2)`,
   `ORDER BY ... LIMIT 10`). Fewer lines of Rust, but `overall` would then need a second aggregate query
   (it must include projects beyond the top 10), Postgres `numeric` would have to be decoded through a
   type outside the current `sqlx` feature set (`bigdecimal`/`rust_decimal` are not in the allowlist) or
   cast to `float8`, and `ORDER BY slug` would follow the database collation instead of a fixed byte
   order. Rejected: a dependency or a float round-trip for a calculation that is exact in integers.
2. **Float percentage via `(done as f64 / total as f64 * 10000.0).round() / 100.0`.** Simpler, but
   relies on `f64` representation for the tie cases (`x.xx5`) that R11/R14 pin down, and needs an
   explicit `total == 0` guard anyway to avoid `NaN`. Rejected for the integer `completion_hundredths`,
   which is exact and makes the R16 sort key an integer.
3. **Extend `GET /api/harness/projects` with per-project `percentage`/`byStatus` and let the frontend
   aggregate.** No new route, but it changes an existing contract, pushes the superseded/deleted
   exclusion rules into the client, and its `total` currently includes `superseded`, so the two would
   disagree. Rejected: the acceptance criteria ask for a dedicated endpoint, and the counting rules
   belong on the server.
4. **Return `404` or `percentage: null` for an empty mirror.** Rejected: an empty dashboard is a valid
   state, and the acceptance criteria require `0`.
5. **Serialize `percentage` as a fixed 2-decimal string (`"100.00"`) to keep trailing zeros.** Would
   spare the frontend one format call, but changes the type of a field R4/R14 define as a number,
   forces string parsing for any chart scale, and breaks consistency with the other numeric fields.
   Rejected: display formatting belongs to the frontend.
