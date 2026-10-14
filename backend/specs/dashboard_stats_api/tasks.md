# Tasks — dashboard_stats_api

Ordered; the `implementer` checks each off (`[x]`) as it completes it. Signatures, the query and test
names come from `design.md`; the `R<n>` → test mapping goes in `progress/impl_dashboard_stats_api.md`
under `## Traceability` (`docs/specs.md` § "Traceability").

- [x] T1 (R4, R7, R14) In `src/harness/reader.rs` add `DashboardResponse`, `OverallProgress`, `StatusBreakdown`, `ProjectProgress` and the private `ProjectStatusCountsDbRow`; camelCase via `#[serde(rename = ...)]`, `percentage` as `f64`, no `skip_serializing_if`.
- [x] T2 (R11, R12, R14) Add `completion_hundredths(done, total)` (integer half-up to 2 decimals, `0` when `total == 0`; serialized as `hundredths as f64 / 100.0`) and the unit test `completion_hundredths_rounds_half_up` (cases and serialization checks from `design.md`) in a `#[cfg(test)] mod tests` block of `src/harness/reader.rs`.
- [x] T3 (R5, R6, R7, R8, R9, R10, R13, R15, R16, R17, R18, R19) Add `TOP_PROJECTS_LIMIT` and `read_dashboard(pool)` with the single `SELECT` from `design.md` § "Query"; sum all rows into `overall` before sorting by `(done desc, hundredths desc, slug asc)` and truncating to `TOP_PROJECTS_LIMIT`.
- [x] T4 (R1, R2, R3) Add `get_dashboard` to `src/harness/router.rs` (`AuthUser` extractor) and register `/api/harness/dashboard` in `src/app.rs` for both auth modes.
- [x] T5 (R3, R4, R7, R12, R13) In `tests/harness.rs` add `DASHBOARD_PATH`, `seed_features_with_statuses` and `dashboard_with_empty_mirror_returns_zeroes`.
- [x] T6 (R3, R4, R5, R6, R7, R11, R14, R16, R17) Add `dashboard_aggregates_counts_across_projects`, including the `GET /api/harness/projects/{slug}/state` → `200` check for every returned `slug`.
- [x] T7 (R8, R9, R15) Add `dashboard_excludes_deleted_and_superseded_features`.
- [x] T8 (R10) Add `dashboard_excludes_deleted_projects`.
- [x] T9 (R9, R12, R13, R15) Add `dashboard_percentage_is_zero_when_nothing_is_countable`.
- [x] T10 (R16) Add `dashboard_orders_projects_by_done_then_percentage_then_slug`.
- [x] T11 (R5, R17, R18) Add `dashboard_limits_top_projects_to_ten`.
- [x] T12 (R1) Extend `harness_endpoints_return_401_without_a_valid_token` to iterate over `DASHBOARD_PATH`.
- [x] T13 (R19) Extend `reader_performs_only_select_queries` to call `read_dashboard` on the read-only pool.
- [x] T14 (R2) In `tests/auth.rs` add `local_mode_rejects_supabase_token_on_dashboard` and `local_mode_rejects_missing_token_on_dashboard`.
- [x] T15 (R3, R4, R7, R14) Document the route in `docs/architecture.md` (data-flow route list, `src/harness/` layer description, response contract, counting rules, 2-decimal percentage with frontend-side `toFixed(2)` display, and `slug` → `/state` drill-down) and `docs/verification.md` (Level 2 and Level 3).
- [x] T16 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19) Run `./init.sh` (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo build`, `cargo test`), confirm every test above passes, and record the result with `scripts/harness.sh append-log`.
