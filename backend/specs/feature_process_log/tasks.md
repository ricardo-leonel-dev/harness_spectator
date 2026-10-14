# Tasks — feature_process_log

Ordered; the `implementer` checks each off (`[x]`) as it completes it. Signatures, queries and test
names come from `design.md`; the `R<n>` → test mapping goes in `progress/impl_feature_process_log.md`
under `## Traceability` (`docs/specs.md` § "Traceability").

- [x] T1 (R4, R7, R10, R14, R15) In `src/harness/reader.rs` add `FeatureLogResponse`, `FeatureHeader`, `ProcessLogSession`, `ProcessLogEntry` and the private `*DbRow` structs with `From` impls; timestamps via `to_rfc3339()`, no `skip_serializing_if`.
- [x] T2 (R3, R5, R6, R8, R9, R11, R12, R13, R16, R17, R18, R19) In `src/harness/reader.rs` add `read_feature_log(pool, project_slug, feature_name)` with the four `SELECT` queries from `design.md` § "Queries", fetching entries once with `= ANY($1)` and grouping them by `session_id`.
- [x] T3 (R1, R2, R3) Add `get_feature_log` to `src/harness/router.rs` (`AuthUser` extractor, `Path<(String, String)>`) and register `/api/harness/projects/{slug}/features/{name}/log` in `src/app.rs` for both auth modes.
- [x] T4 (R3, R4, R5, R7, R8, R10, R14) In `tests/harness.rs` add `LogSessionSeed`, `seed_log_session`, `log_path` and `feature_log_returns_header_and_sessions`.
- [x] T5 (R6, R9) Add `feature_log_orders_sessions_and_entries_ascending`.
- [x] T6 (R11, R12) Add `feature_log_excludes_soft_deleted_sessions_and_entries`.
- [x] T7 (R5) Add `feature_log_excludes_sessions_of_other_features`.
- [x] T8 (R13) Add `feature_log_with_no_sessions_returns_empty_list`.
- [x] T9 (R7, R14, R15) Add `feature_log_renders_nulls_explicitly`.
- [x] T10 (R16) Add `feature_log_for_unknown_or_deleted_project_returns_404`.
- [x] T11 (R17) Add `feature_log_for_unknown_or_deleted_feature_returns_404`.
- [x] T12 (R18) Add `feature_log_does_not_cross_projects`.
- [x] T13 (R1) Rename `both_endpoints_return_401_without_a_valid_token` to `harness_endpoints_return_401_without_a_valid_token` and extend it to the log path.
- [x] T14 (R19) Extend `reader_performs_only_select_queries` to call `read_feature_log` on the read-only pool.
- [x] T15 (R2) In `tests/auth.rs` add `local_mode_rejects_supabase_token_on_feature_log` and `local_mode_rejects_missing_token_on_feature_log`.
- [x] T16 (R3, R4, R7, R10, R16, R17) Document the route in `docs/architecture.md` (data-flow route list, `src/harness/` layer description, response contract, feature-notes/review-verdict limitation) and `docs/verification.md` (Level 2 and Level 3); this delivers the documentation acceptance item for the contract these requirements define.
- [x] T17 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19) Run `./init.sh` (`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo build`, `cargo test`), confirm every test above passes, and record the result with `scripts/harness.sh append-log`.
