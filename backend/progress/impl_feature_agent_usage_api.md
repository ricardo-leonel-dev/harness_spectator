# Implementation — feature 9 `feature_agent_usage_api` (session 21)

## Outcome

`GET /api/harness/projects/{slug}/features/{name}/agent-usage` is implemented as
`specs/feature_agent_usage_api/` describes. It returns a nested run tree and totals
(`effortSeconds`, `unionSeconds`, `tokens`), uses the same 404 and 401 behaviour as the log route,
and reads with `SELECT` only. All tasks T1–T20 are checked `[x]` in `specs/feature_agent_usage_api/tasks.md`.
The log route and `read_feature_log` were not changed.

## Files changed

- `migrations/0002_agent_runs.sql` (new). Its statements are copied verbatim from
  `personal_harness/db/migrations/0004_agent_runs.sql` (commit 237fabe). `diff` of the bodies
  from `create table` onward shows no differences.
- `migrations/0001_harness_schema.sql`: only the header comment changed (it now names 0004 and
  points to 0002).
- `src/harness/reader.rs`: the response structs, the private `AgentRunDbRow`, `build_run_tree`,
  `union_seconds`, `agent_usage_totals`, `read_feature_agent_usage`, plus unit tests.
- `src/harness/router.rs`: `get_feature_agent_usage`.
- `src/app.rs`: the route is registered for both auth modes.
- `tests/harness.rs`: the helpers `agent_usage_path`, `AgentRunSeed`, `run_seed`, `base_plus`,
  `seed_agent_run` and `get_text`, the new tests, and extensions to the 401 test and the read-only test.
- `tests/auth.rs`: two local-mode 401 tests.
- `docs/architecture.md`, `docs/verification.md` (T19).
- `specs/feature_agent_usage_api/tasks.md`: every task checked.

### Delivery note (git)

`migrations/` is a symlink to the main checkout's `backend/migrations`. Its contents are excluded
from git through `.git/info/exclude`, which commit b512367 set up deliberately. The new
`0002_agent_runs.sql` and the `0001` header edit are therefore on disk but **do not show in
`git status`**. I left the exclusion as it is. The test suite picks the migration up through the symlink.

## Deviations from design (all logged)

1. The private `AgentRunDbRow` has no `id` field. The code never reads it, and under
   `-D warnings` it would fail as `dead_code`. The query still selects `id` and still uses
   `ORDER BY started_at ASC NULLS LAST, id ASC` as written.
2. **The design's `effortSeconds` code had a bug.** `filter_map(..).sum::<f64>()` over no rows
   gives `-0.0`, because Rust's f64 `Sum` starts from `-0.0`. That would serialize as
   `"effortSeconds":-0.0` and break R20. The reader now uses `fold(0.0, ..)`. `serde_json::Value`
   equality treats `-0.0 == 0.0`, which hides the problem, so the R20 test compares the **raw
   response text** using the new `get_text` helper.
3. `tests/harness.rs` now starts with `#![recursion_limit = "256"]`. The full-body `json!` literal
   in the main tree test needs it.
4. The catalog renderings from the design matched exactly on Postgres 16.11. Index definitions are
   built with the actual `current_schema()` value instead of a hard-coded `public.`, so the
   comparison is still against full strings.

## Traceability (R → test)

| R | Test(s) |
|---|---|
| R1 | `tests/harness.rs::harness_endpoints_return_401_without_a_valid_token` (now also covers `agent_usage_path`) |
| R2 | `tests/auth.rs::local_mode_rejects_supabase_token_on_agent_usage`, `local_mode_rejects_missing_token_on_agent_usage` |
| R3 | `agent_usage_returns_run_tree_and_totals`, `agent_usage_with_no_runs_returns_empty_tree_and_zero_totals` |
| R4 | `agent_usage_returns_run_tree_and_totals` (full body), `agent_usage_renders_nulls_and_orders_by_start_then_id` |
| R5 | `agent_usage_returns_run_tree_and_totals`, `agent_usage_renders_nulls_and_orders_by_start_then_id` |
| R6 | `agent_usage_renders_nulls_and_orders_by_start_then_id` (full `n1` node, all nulls) |
| R7 | `agent_usage_returns_run_tree_and_totals` (literal `+00:00` timestamps) |
| R8 | `agent_usage_returns_run_tree_and_totals`, `agent_usage_breaks_parent_cycles_at_the_earliest_run` (each id once), `src/harness/reader.rs::tests::build_run_tree_handles_orphans_and_cycles` |
| R9 | `agent_usage_returns_run_tree_and_totals`, `agent_usage_breaks_parent_cycles_at_the_earliest_run`, `build_run_tree_handles_orphans_and_cycles` |
| R10 | `agent_usage_returns_run_tree_and_totals` (`thread-x`), `agent_usage_places_runs_without_a_parent_at_root`, `build_run_tree_handles_orphans_and_cycles` |
| R11 | `agent_usage_breaks_parent_cycles_at_the_earliest_run`, `build_run_tree_handles_orphans_and_cycles` |
| R12 | `agent_usage_returns_run_tree_and_totals`, `agent_usage_places_runs_without_a_parent_at_root` |
| R13 | `agent_usage_returns_run_tree_and_totals` (insert order ≠ run order), `agent_usage_renders_nulls_and_orders_by_start_then_id`, `agent_usage_places_runs_without_a_parent_at_root`, `agent_usage_breaks_parent_cycles_at_the_earliest_run` |
| R14 | `agent_usage_excludes_deleted_runs_and_other_features` |
| R15 | `agent_usage_excludes_deleted_runs_and_other_features` |
| R16 | `agent_usage_returns_run_tree_and_totals`, `agent_usage_with_no_runs_returns_empty_tree_and_zero_totals` |
| R17 | `agent_usage_returns_run_tree_and_totals` (170.0), `agent_usage_renders_nulls_and_orders_by_start_then_id` (5.0) |
| R18 | `agent_usage_returns_run_tree_and_totals` (110.0), `agent_usage_renders_nulls_and_orders_by_start_then_id` (10.0), `src/harness/reader.rs::tests::union_seconds_counts_overlaps_once` |
| R19 | `agent_usage_returns_run_tree_and_totals`, `agent_usage_renders_nulls_and_orders_by_start_then_id`, `agent_usage_with_no_runs_returns_empty_tree_and_zero_totals` |
| R20 | `agent_usage_with_no_runs_returns_empty_tree_and_zero_totals` (exact raw-text body) |
| R21 | `agent_usage_for_unknown_or_deleted_project_returns_404` |
| R22 | `agent_usage_for_unknown_or_deleted_feature_returns_404` (also covers case-sensitive `Alive_feat`) |
| R23 | `agent_usage_does_not_cross_projects` |
| R24 | `reader_performs_only_select_queries` (extended: `read_feature_agent_usage` on the read-only pool, `runs.len() == 1`) |
| R25 | `test_schema_reproduces_toolkit_agent_runs` |
| R26 | `feature_log_is_unchanged_when_agent_runs_exist` |

## Verification

- Environment: HEAD `b18d91a` with uncommitted changes, branch `feature/dashboard-stats-api-staging`,
  local Postgres 16.11 at
  `DATABASE_URL=postgres://harness_test:harness_test@localhost/harness_test_base?host=/tmp`.
  Tests ran in throwaway `sqlx::test` databases and never touched the mirror. There is no accepted
  baseline; every test passes.
- `./init.sh` exited 0. It runs `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
  `cargo build` and `cargo test` (lib 35, auth 20, harness 35, binaries 4, cors 4, toolchain 2, all
  passed), then the fingerprint lint, agent-usage recording, snapshot and mirror sync, all `[OK]`.
  **It printed no `[WARN]` lines.**
- The full log is at
  `/private/tmp/claude-501/-Users-ricardoaguilar-Documents-Development-personal-harness-spectator-back-backend/76e2d2b3-04fa-4b56-b845-e3099524919e/scratchpad/init.log`.
- No mock-data workflow applies: `harness/instructions/mock-data.md` is not configured for this
  project, and `.harness.json` has no `postgres_schemas`.
