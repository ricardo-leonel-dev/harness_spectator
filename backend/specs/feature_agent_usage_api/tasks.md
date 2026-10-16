# Tasks — feature_agent_usage_api

Ordered; the `implementer` checks each off (`[x]`) as it completes it. Signatures, the query, the
fixtures and test names come from `design.md`; the `R<n>` → test mapping goes in
`progress/impl_feature_agent_usage_api.md` under `## Traceability` (`docs/specs.md` § "Traceability").

- [x] T1 (R25) Add `migrations/0002_agent_runs.sql` with the statements of the toolkit's `db/migrations/0004_agent_runs.sql` verbatim (header comment naming the source), and add `0004_agent_runs.sql` to the source list in `migrations/0001_harness_schema.sql`'s header comment.
- [x] T2 (R25) In `tests/harness.rs` add `test_schema_reproduces_toolkit_agent_runs` (columns, constraints, indexes and view checks from `design.md` § "Test-only schema").
- [x] T3 (R4, R5, R6, R7, R16, R19) In `src/harness/reader.rs` add `AgentUsageResponse`, `AgentRunNode`, `AgentRunTokens`, `AgentUsageTotals`, `TokenTotals` and the private `AgentRunDbRow`; camelCase via `#[serde(rename = ...)]`, no `skip_serializing_if`, timestamps via `to_rfc3339()`.
- [x] T4 (R18) Add `union_seconds` and the unit test `union_seconds_counts_overlaps_once` in the existing `#[cfg(test)] mod tests` block.
- [x] T5 (R8, R9, R10, R11, R12, R13) Add `build_run_tree` (runtime-keyed parent lookup, self-parent ignored, depth-first walk with visited set, cycle members promoted in run order, roots sorted by run order, `spawnDepth` copied) and the unit test `build_run_tree_handles_orphans_and_cycles`.
- [x] T6 (R3, R14, R15, R17, R18, R19, R20, R21, R22, R23, R24) Add `read_feature_agent_usage(pool, slug, name)`: project and feature lookup as in `read_feature_log` (without modifying it), the single `agent_runs` `SELECT` from `design.md` § "Query", then tree and totals.
- [x] T7 (R1, R2, R3) Add `get_feature_agent_usage` to `src/harness/router.rs` (`AuthUser` extractor) and register `/api/harness/projects/{slug}/features/{name}/agent-usage` in `src/app.rs` for both auth modes.
- [x] T8 (R3, R4, R5, R7, R8, R9, R10, R12, R13, R16, R17, R18, R19) In `tests/harness.rs` add `agent_usage_path`, `AgentRunSeed`, `seed_agent_run` and `agent_usage_returns_run_tree_and_totals`.
- [x] T9 (R4, R5, R6, R13, R17, R18, R19) Add `agent_usage_renders_nulls_and_orders_by_start_then_id`.
- [x] T10 (R10, R12, R13) Add `agent_usage_places_runs_without_a_parent_at_root`.
- [x] T11 (R8, R9, R11, R13) Add `agent_usage_breaks_parent_cycles_at_the_earliest_run`.
- [x] T12 (R14, R15) Add `agent_usage_excludes_deleted_runs_and_other_features`.
- [x] T13 (R3, R16, R19, R20) Add `agent_usage_with_no_runs_returns_empty_tree_and_zero_totals`.
- [x] T14 (R21, R22, R23) Add `agent_usage_for_unknown_or_deleted_project_returns_404`, `agent_usage_for_unknown_or_deleted_feature_returns_404` and `agent_usage_does_not_cross_projects`.
- [x] T15 (R26) Add `feature_log_is_unchanged_when_agent_runs_exist`.
- [x] T16 (R1) Extend `harness_endpoints_return_401_without_a_valid_token` to iterate over `agent_usage_path("test-project", "first_feat")`.
- [x] T17 (R24) Extend `reader_performs_only_select_queries` to seed one run and call `read_feature_agent_usage` on the read-only pool.
- [x] T18 (R2) In `tests/auth.rs` add `local_mode_rejects_supabase_token_on_agent_usage` and `local_mode_rejects_missing_token_on_agent_usage`.
- [x] T19 (R3, R4, R16, R25) Document the route in `docs/architecture.md` (data-flow route list and response contract, tree and totals rules, `src/harness/` layer description, `0004_agent_runs.sql` in the mirror DDL list, `migrations/0002_agent_runs.sql` in the test-schema note, and the mirror dependency from `design.md` § "Mirror dependency") and `docs/verification.md` (Level 2 and Level 3).
- [x] T20 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26) Run `./init.sh` (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo build`, `cargo test`), confirm every test above passes, and record the result with `scripts/harness.sh append-log`.
