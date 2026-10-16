# Tasks — dashboard_agent_usage_stats

Ordered; the `implementer` checks each off (`[x]`) as it completes it. Signatures, the query, the
fixtures and test names come from `design.md`; the `R<n>` → test mapping goes in
`progress/impl_dashboard_agent_usage_stats.md` under `## Traceability` (`docs/specs.md` §
"Traceability").

- [x] T1 (R3, R4, R8, R9, R11, R13) In `src/harness/reader.rs` add `UsageBucket` (with `add`), `DashboardAgentUsage`, `RuntimeBreakdown`, `ModelUsage`, `RoleUsage`, `ProjectUsage` and the private `AgentUsageGroupDbRow`; camelCase via `#[serde(rename = ...)]`, reuse the existing `TokenTotals`, no `skip_serializing_if`.
- [x] T2 (R4, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18) Add `fold_agent_usage(rows)` per `design.md` § "Fold" (overall bucket summed before truncation, `BTreeMap` grouping, `null`-last byte-wise key order, `TOP_PROJECTS_LIMIT` truncation, `effortSeconds` accumulated from `0.0`) and the unit test `fold_agent_usage_groups_and_sorts` in the existing `#[cfg(test)] mod tests`.
- [x] T3 (R1, R2, R5, R6, R7, R19) Add the `agent_usage` field (`agentUsage`) to `DashboardResponse` and, in `read_dashboard`, run the grouped `SELECT` from `design.md` § "Query" (with the `::bigint` / `::float8` casts) after the unchanged feature-count query, then `fold_agent_usage`. Do not modify the existing feature-count query, fold or sort.
- [x] T4 (R1, R2, R3, R18) In `tests/harness.rs` add `empty_agent_usage()` and add `"agentUsage": empty_agent_usage()` to the full-body asserts of `dashboard_with_empty_mirror_returns_zeroes` and `dashboard_aggregates_counts_across_projects`, without editing their `overall` / `topProjects` literals; leave the other five dashboard tests untouched.
- [x] T5 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R11, R13, R14, R16) Add `dashboard_agent_usage_aggregates_runs_across_projects` with the fixture and expected body from `design.md`, including the `GET /api/harness/projects/{slug}/state` → `200` check for every `agentUsage.topProjects[].slug`.
- [x] T6 (R10, R12, R14, R15) Add `dashboard_agent_usage_orders_breakdowns_and_ranking`.
- [x] T7 (R4, R16, R17) Add `dashboard_agent_usage_limits_top_projects_to_ten`.
- [x] T8 (R2, R5, R6, R14, R18) Add `dashboard_agent_usage_is_empty_when_only_deleted_runs_exist`.
- [x] T9 (R19) Extend `reader_performs_only_select_queries` to assert `dashboard.agent_usage.totals.runs == 1` on the read-only pool.
- [x] T10 (R1, R3, R8, R13) Document `agentUsage` in `docs/architecture.md` (dashboard entry in the data-flow route list: keys, usage-bucket shape, counted-run rule, breakdown and ranking order, `slug` → `/state` drill-down; mirror-dependency paragraph: the dashboard now also needs `agent_runs` and answers `500` without it) and `docs/verification.md` (Level 2 and Level 3).
- [x] T11 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19) Run `./init.sh` (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo build`, `cargo test`), confirm every test above and every pre-existing dashboard test passes, and record the result with `scripts/harness.sh append-log`.
