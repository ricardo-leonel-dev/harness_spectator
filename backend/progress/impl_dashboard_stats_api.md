# Handoff — dashboard_stats_api

## Outcome

Implemented the protected read-only `GET /api/harness/dashboard` route in the Rust/Axum backend,
returning the aggregate progress shape defined by `specs/dashboard_stats_api/{requirements,design,tasks}.md`.
All 16 tasks (`T1`–`T16`) in `specs/dashboard_stats_api/tasks.md` are checked off, every
`R1`–`R19` requirement has at least one mapped test, and `./init.sh` passes (cargo fmt, clippy,
build, test, snapshot, mirror sync — no `[WARN]` lines).

## Scope

- `src/harness/reader.rs` — `DashboardResponse`, `OverallProgress`, `StatusBreakdown`,
  `ProjectProgress`, private `ProjectStatusCountsDbRow`, `completion_hundredths(done, total)`,
  `TOP_PROJECTS_LIMIT`, `read_dashboard(pool)`, and a `#[cfg(test)] mod tests` block containing
  `completion_hundredths_rounds_half_up` (with the exact cases from `design.md` plus the
  `serde_json` `33.33`/`100.0` serialization checks).
- `src/harness/router.rs` — `get_dashboard(State, AuthUser)` handler calling `read_dashboard`.
- `src/app.rs` — registered `/api/harness/dashboard` in the router for both auth modes
  (unconditional registration, the `AuthUser` extractor enforces the mode separation).
- `tests/harness.rs` — `DASHBOARD_PATH`, `seed_features_with_statuses`, `dashboard_with_empty_mirror_returns_zeroes`,
  `dashboard_aggregates_counts_across_projects`, `dashboard_excludes_deleted_and_superseded_features`,
  `dashboard_excludes_deleted_projects`, `dashboard_percentage_is_zero_when_nothing_is_countable`,
  `dashboard_orders_projects_by_done_then_percentage_then_slug`,
  `dashboard_limits_top_projects_to_ten`. Extended `harness_endpoints_return_401_without_a_valid_token`
  to iterate over `DASHBOARD_PATH` and extended `reader_performs_only_select_queries` to call
  `read_dashboard` on the read-only pool.
- `tests/auth.rs` — `local_mode_rejects_supabase_token_on_dashboard` and
  `local_mode_rejects_missing_token_on_dashboard` (lazy pool, 401 happens before any query).
- `docs/architecture.md` — `src/harness/` layer description and the data-flow route list both
  mention the new route; the new entry in the route list documents the response contract
  (`overall` shape, zero-filled `byStatus`, 2-decimal percentage with frontend-side
  `toFixed(2)`, top-10 ordering rules, and `slug` → `/state` drill-down guarantee).
- `docs/verification.md` — Level 2 and Level 3 mention the new route and the `topProjects`
  ordering/resolve check.

No new dependency, no new layer, no migration, no CORS change, no new `ApiError` variant.

## Verification

Ran `./init.sh` (T16). Summary:

```
── 4. Running verification command ─────────────────────
[OK]    Verification command passed
── 5. Regenerating markdown snapshot ───────────────────
[OK]    snapshot regenerated at state
── 6. Syncing Postgres/Supabase mirror (best-effort) ───
[OK]    mirror sync complete
── 7. Summary ───────────────────────────────────────────
[OK]    Environment ready. You can start working.
```

No `[WARN]` lines. The verify command runs
`cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo build && cargo test`
with `DATABASE_URL=postgres://harness_test:harness_test@localhost/harness_test_base?host=/tmp`.

Full test counts:
- `tests/harness.rs` — 24 passed, 0 failed (17 pre-existing + 7 new dashboard tests).
- `tests/auth.rs` — 18 passed, 0 failed (16 pre-existing + 2 new local-mode dashboard tests).
- `tests/binaries.rs` — 4 passed, 0 failed.
- `tests/cors.rs` — 4 passed, 0 failed.
- `tests/toolchain.rs` — 2 passed, 0 failed.
- Doc-tests — 0 passed.
- `src/harness/reader.rs` unit tests — `completion_hundredths_rounds_half_up` passed (executed
  by `cargo test --lib`, included in the same `cargo test` run).

Lint: `scripts/lint_test_fingerprints.sh` reported no byte-level fingerprints in `tests/`.

## Traceability

Every `R<n>` from `specs/dashboard_stats_api/requirements.md` maps to at least one concrete test
by file + test-name, satisfying `docs/specs.md`'s traceability rule.

| Requirement | Test (file::test_name) |
|---|---|
| R1 | `tests/harness.rs::harness_endpoints_return_401_without_a_valid_token` (DASHBOARD_PATH iterations) |
| R2 | `tests/auth.rs::local_mode_rejects_supabase_token_on_dashboard`, `tests/auth.rs::local_mode_rejects_missing_token_on_dashboard` |
| R3 | `tests/harness.rs::dashboard_with_empty_mirror_returns_zeroes`, `tests/harness.rs::dashboard_aggregates_counts_across_projects`, `tests/harness.rs::dashboard_excludes_deleted_and_superseded_features`, `tests/harness.rs::dashboard_excludes_deleted_projects`, `tests/harness.rs::dashboard_percentage_is_zero_when_nothing_is_countable` |
| R4 | `tests/harness.rs::dashboard_with_empty_mirror_returns_zeroes`, `tests/harness.rs::dashboard_aggregates_counts_across_projects` |
| R5 | `tests/harness.rs::dashboard_aggregates_counts_across_projects`, `tests/harness.rs::dashboard_limits_top_projects_to_ten` |
| R6 | `tests/harness.rs::dashboard_aggregates_counts_across_projects`, `tests/harness.rs::dashboard_excludes_deleted_and_superseded_features` |
| R7 | `tests/harness.rs::dashboard_with_empty_mirror_returns_zeroes`, `tests/harness.rs::dashboard_aggregates_counts_across_projects`, `tests/harness.rs::dashboard_excludes_deleted_and_superseded_features`, `tests/harness.rs::dashboard_excludes_deleted_projects`, `tests/harness.rs::dashboard_percentage_is_zero_when_nothing_is_countable` |
| R8 | `tests/harness.rs::dashboard_excludes_deleted_and_superseded_features` |
| R9 | `tests/harness.rs::dashboard_excludes_deleted_and_superseded_features`, `tests/harness.rs::dashboard_percentage_is_zero_when_nothing_is_countable` |
| R10 | `tests/harness.rs::dashboard_excludes_deleted_projects` |
| R11 | `src/harness/reader.rs::tests::completion_hundredths_rounds_half_up`, `tests/harness.rs::dashboard_aggregates_counts_across_projects` |
| R12 | `src/harness/reader.rs::tests::completion_hundredths_rounds_half_up`, `tests/harness.rs::dashboard_with_empty_mirror_returns_zeroes`, `tests/harness.rs::dashboard_percentage_is_zero_when_nothing_is_countable` |
| R13 | `tests/harness.rs::dashboard_with_empty_mirror_returns_zeroes`, `tests/harness.rs::dashboard_percentage_is_zero_when_nothing_is_countable` |
| R14 | `src/harness/reader.rs::tests::completion_hundredths_rounds_half_up`, `tests/harness.rs::dashboard_aggregates_counts_across_projects` |
| R15 | `tests/harness.rs::dashboard_excludes_deleted_and_superseded_features`, `tests/harness.rs::dashboard_percentage_is_zero_when_nothing_is_countable` |
| R16 | `tests/harness.rs::dashboard_aggregates_counts_across_projects`, `tests/harness.rs::dashboard_orders_projects_by_done_then_percentage_then_slug` |
| R17 | `tests/harness.rs::dashboard_aggregates_counts_across_projects`, `tests/harness.rs::dashboard_limits_top_projects_to_ten` |
| R18 | `tests/harness.rs::dashboard_limits_top_projects_to_ten` |
| R19 | `tests/harness.rs::reader_performs_only_select_queries` (extended to call `read_dashboard`) |

## Notes for the reviewer

- `seed_features_with_statuses` accepts `&[&str]` so the `spec_drafting`/`spec_ready`/`in_progress`
  enum values (with underscores) match the `feature_status` column type. The integration tests
  feed them in directly.
- The 401 tests in `tests/auth.rs` use the `lazy_pool()` fixture (no Postgres connection is
  established) so the 401 happens at the `AuthUser` extractor, before any query runs — matching
  the pre-existing `local_mode_rejects_*_on_feature_log` pattern.
- The unit test `completion_hundredths_rounds_half_up` is intentionally placed in a
  `#[cfg(test)] mod tests` block inside `src/harness/reader.rs` per `docs/conventions.md`'s
  unit-tests-in-same-file rule; `cargo test --lib` picks it up automatically and the full
  `cargo test` run includes it.
- `TOP_PROJECTS_LIMIT` is `pub(super)`-visible only via `pub(crate)` use; it lives as a module
  constant in `reader.rs` and is used internally by `read_dashboard`.
- No new file outside `src/`, `tests/`, `docs/`, `specs/`, `progress/` was created; no edits to
  `src/error.rs`, `src/config.rs`, `src/auth/`, `src/bin/`, `Cargo.toml`, `init.sh`,
  `scripts/`, `migrations/`, or any harness-owned instruction.