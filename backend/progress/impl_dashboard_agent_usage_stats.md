# Implementation handoff: feature 10 `dashboard_agent_usage_stats` (sdd=1)

Session 23, claimed by `leader -> implementer (Claude Opus 5.5)`. Base revision `07710fa` plus the uncommitted working tree.

## Outcome

`GET /api/harness/dashboard` now returns a third top-level key, `agentUsage`, with the contract in
`specs/dashboard_agent_usage_stats/design.md`. The feature-8 `overall` / `topProjects` code path is
unchanged: its query, fold and sort were not touched. The new grouped `SELECT` runs after them.
All of T1–T11 are checked off in `specs/dashboard_agent_usage_stats/tasks.md`.

Human decisions carried in as approved: a missing `agent_runs` table still returns 500 for the whole
dashboard (OQ1). Runs are counted whatever their feature (OQ2). `byModel` / `byRole` have no cap (OQ3).

## Changes

- `src/harness/reader.rs`
  - New types: `UsageBucket` (with `add`), `DashboardAgentUsage`, `RuntimeBreakdown`, `ModelUsage`,
    `RoleUsage`, `ProjectUsage`, and a private `AgentUsageGroupDbRow`.
  - New helpers: `cmp_nullable_key` and `ranked_by_total`, plus `fold_agent_usage`.
  - `DashboardResponse` gains the `agentUsage` field, and `read_dashboard` runs the design's grouped
    query with the `::float8` / `::bigint` casts.
  - Layout choice: the buckets are `#[serde(flatten)]`ed, as in the design's signatures.
  - Effort is accumulated from `0.0` with `+=`.
  - Ordering: `str::cmp` is byte-wise and `null` sorts last. The overall bucket is summed before the
    `TOP_PROJECTS_LIMIT` truncate.
  - New unit test `fold_agent_usage_groups_and_sorts`.
- `tests/harness.rs`
  - New helpers: `empty_agent_usage()`, `usage_bucket()` and `with_key()`.
  - The two full-body tests gain `"agentUsage": empty_agent_usage()`, inserted as the first key so
    the diff only adds lines. `git diff -U0 tests/harness.rs | grep '^-'` shows only the file header.
  - Four new integration tests.
  - `reader_performs_only_select_queries` is extended with `dashboard.agent_usage.totals.runs == 1`.
- `docs/architecture.md`: documents `agentUsage` under the dashboard route in the data-flow list. The
  mirror-dependency paragraph now says the whole dashboard returns 500 without `agent_runs`.
- `docs/verification.md`: Level 2 paragraph on the `agentUsage` tests, and a Level 3 smoke-step
  extension.
- `specs/dashboard_agent_usage_stats/tasks.md`: T1–T11 checked.

Not touched: `src/harness/router.rs`, `src/app.rs`, `tests/auth.rs`, `migrations/`, `Cargo.toml`.
No scope beyond the tasks.

## Verification

- `./init.sh` exit 0, ending with `[OK] Environment ready`.
  - `DATABASE_URL` is the `.harness.json` default: `harness_test@localhost/harness_test_base?host=/tmp`.
  - It runs `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo build` and `cargo test`.
  - Results: lib 36 passed, `tests/harness.rs` 39 passed, and the auth, cors and binaries suites all
    passed. 0 failed.
  - No `[WARN]` lines. No PostgreSQL baseline is in use, so these are ordinary green tests.
- The first `./init.sh` run failed on clippy `type_complexity` in the new ordering test. I fixed it
  with a local `type OrderRun` alias, and the rerun was green.
- `cargo test --test harness dashboard`: all 11 dashboard tests passed. These are the 7 pre-existing
  feature-8 tests plus the 4 new ones.
- The mock-data workflow does not apply, because `.harness.json` has no `postgres_schemas`.
- `git check-ignore` exits 1 for every deliverable, so none of them is excluded.

## Traceability

| Req | Test(s) |
|---|---|
| R1 | `tests/harness.rs`: `dashboard_with_empty_mirror_returns_zeroes`, `dashboard_aggregates_counts_across_projects`, `dashboard_agent_usage_aggregates_runs_across_projects` (full-body `assert_eq!` with exactly the three keys) |
| R2 | the same three, plus `dashboard_agent_usage_is_empty_when_only_deleted_runs_exist`, plus the five untouched feature-8 dashboard tests still passing |
| R3 | `dashboard_with_empty_mirror_returns_zeroes`, `dashboard_aggregates_counts_across_projects` (via `empty_agent_usage()`), `dashboard_agent_usage_aggregates_runs_across_projects` |
| R4 | `dashboard_agent_usage_aggregates_runs_across_projects`, `dashboard_agent_usage_limits_top_projects_to_ten` (totals cover all 12 projects) |
| R5 | `dashboard_agent_usage_aggregates_runs_across_projects` (r4), `dashboard_agent_usage_is_empty_when_only_deleted_runs_exist` |
| R6 | `dashboard_agent_usage_aggregates_runs_across_projects` (`gone`/r7), `dashboard_agent_usage_is_empty_when_only_deleted_runs_exist` |
| R7 | `dashboard_agent_usage_aggregates_runs_across_projects` (r2/r6 with no feature, r3 superseded, r5 soft-deleted feature) |
| R8 | `dashboard_agent_usage_aggregates_runs_across_projects`; zero buckets in `empty_agent_usage()` tests |
| R9 | `dashboard_agent_usage_aggregates_runs_across_projects` (including the `null` model group) |
| R10 | `dashboard_agent_usage_orders_breakdowns_and_ranking`; unit `fold_agent_usage_groups_and_sorts` |
| R11 | `dashboard_agent_usage_aggregates_runs_across_projects` (including the `null` role group) |
| R12 | `dashboard_agent_usage_orders_breakdowns_and_ranking`; unit `fold_agent_usage_groups_and_sorts` |
| R13 | `dashboard_agent_usage_aggregates_runs_across_projects` (also `/state` returns 200 for each slug) |
| R14 | `dashboard_agent_usage_aggregates_runs_across_projects` (`gamma` omitted), `dashboard_agent_usage_orders_breakdowns_and_ranking` (`p-d` with total 0 present), `dashboard_agent_usage_is_empty_when_only_deleted_runs_exist` |
| R15 | `dashboard_agent_usage_orders_breakdowns_and_ranking`; unit `fold_agent_usage_groups_and_sorts` (`"B"` before `"a"`) |
| R16 | `dashboard_agent_usage_aggregates_runs_across_projects`, `dashboard_agent_usage_limits_top_projects_to_ten` |
| R17 | `dashboard_agent_usage_limits_top_projects_to_ten` |
| R18 | `dashboard_with_empty_mirror_returns_zeroes`, `dashboard_aggregates_counts_across_projects`, `dashboard_agent_usage_is_empty_when_only_deleted_runs_exist`, unit `fold_agent_usage_groups_and_sorts` (`0.0`, not `-0.0`) |
| R19 | `reader_performs_only_select_queries` (`read_dashboard` on a read-only pool, `agent_usage.totals.runs == 1`) |

## Notes for the reviewer

- `fold_agent_usage` ignores any `runtime` other than `claude`/`codex` in `byRuntime`. The value
  still goes into the totals and the other breakdowns. The mirror's `CHECK` makes that case
  unreachable.
- `progress/spec_summary_*.md` and `specs/dashboard_agent_usage_stats/{requirements,design}.md`
  were untracked before this session. Only `tasks.md` was edited (checkboxes).
