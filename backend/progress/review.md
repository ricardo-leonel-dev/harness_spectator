# Review — feature dashboard_stats_api (#8)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, all four docs/CHECKPOINTS files in place; `./init.sh` exits 0.
- C2: [x] — Exactly one feature is `in_progress` (dashboard_stats_api), every `done` feature continues to have passing tests, the open session (#19) reflects current work for this feature.
- C3: [x] — Changes stay inside `src/harness/{reader.rs,router.rs}` and `src/app.rs`; no new top-level layer, no new dependency, no Cargo.toml/migration/init.sh/scripts/harness-owned-instruction edits, no debug `print!`/`todo!()` left in.
- C4: [x] — `src/harness/reader.rs::completion_hundredths` and `read_dashboard` are exercised by `tests/harness.rs` (7 new dashboard tests + 1 new unit test in the same file) and `tests/auth.rs` (2 new local-mode 401 tests). Every new integration test uses `#[sqlx::test]` against the existing `migrations/0001_harness_schema.sql` test schema (no Supabase or live DB touched). `./init.sh` runs `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo build && cargo test` end-to-end, all green: 33 lib unit tests (incl. `harness::reader::tests::completion_hundredths_rounds_half_up`), 24 `tests/harness.rs` (incl. 7 new dashboard tests), 18 `tests/auth.rs` (incl. 2 new local-mode dashboard tests), 4 binaries, 4 cors, 2 toolchain, 0 doc-tests; snapshot regenerated, mirror sync OK, no `[WARN]` lines.
- C5: [x] — No stray untracked files in the repo root (only `progress/impl_dashboard_stats_api.md`, `progress/spec_summary_dashboard_stats_api.md`, `specs/dashboard_stats_api/` — the first is the handoff required by §0, the second is the spec summary from §9, and the third is the spec dir required by `sdd=1`; both belong in their existing convention and are the kind of files `.harness.json`'s `.git/info/exclude` does not suppress). Session 19 still open (review gate must be recorded before `log-out`, not before the reviewer's verdict file).
- C6: [x] — `specs/dashboard_stats_api/{requirements.md,design.md,tasks.md}` all exist on disk; `requirements.md` carries R1–R19, each in strict EARS form with a single `SHALL` clause and stable id; `tasks.md` T1–T16 are all `[x]`; every `R<n>` maps to a concrete test that I independently located in the diff and read against the requirement (see R-by-R verification below).

## Requirement traceability (independent verification, not taken from the handoff)

For each `R<n>` I read the requirement, located the test(s) the handoff claims, opened the test file at those line ranges, and confirmed the test asserts exactly the behaviour the requirement describes.

- R1 (supabase mode 401) — `tests/harness.rs::harness_endpoints_return_401_without_a_valid_token` (line 599) iterates `DASHBOARD_PATH` over `unauthorized_cases()` (missing/wrong-signature/expired/wrong-audience) and asserts `401` + `{"error":"unauthorized"}` (line 612-613). The route registration in `src/app.rs:42` runs before the auth-mode `if`, so this is the supabase-mode path. PASS.
- R2 (local mode 401) — `tests/auth.rs::local_mode_rejects_supabase_token_on_dashboard` (line 334) and `local_mode_rejects_missing_token_on_dashboard` (line 341) use the `local_app()` with `lazy_pool()`, so the 401 happens at the extractor before any query, exactly matching the pre-existing `local_mode_rejects_*_on_feature_log` pattern. PASS.
- R3 (top-level keys = `{overall, topProjects}`) — `dashboard_with_empty_mirror_returns_zeroes` (harness.rs:1324) and `dashboard_aggregates_counts_across_projects` (harness.rs:1349) `assert_eq!` the full body against a `json!` with exactly those two keys. PASS.
- R4 (`overall` keys = `{done,total,percentage,byStatus}`) — Same two tests assert the exact 4-key `overall` object. PASS.
- R5 (`overall.total` = countable features) — `dashboard_aggregates_counts_across_projects` (overall total 10 = 7 alpha + 3 beta) and `dashboard_limits_top_projects_to_ten` (sum of 12..=1 = 78) both assert `overall.total`. PASS.
- R6 (`overall.done` = countable `done`) — `dashboard_aggregates_counts_across_projects` (overall done 3) and `dashboard_excludes_deleted_and_superseded_features` (overall done 1) assert it. PASS.
- R7 (byStatus carries all 6 keys zero-filled, no superseded) — `dashboard_with_empty_mirror_returns_zeroes` and `dashboard_aggregates_counts_across_projects` assert the full six-key object. The reader query (`reader.rs:418-432`) uses `COUNT(*) FILTER (WHERE f.status = '...')` for each of the 6 countable statuses, with `f.status <> 'superseded'` in the WHERE, so `superseded` is never counted. PASS.
- R8 (soft-deleted feature excluded) — `dashboard_excludes_deleted_and_superseded_features` (harness.rs:1409): alpha has 1 deleted `done`, asserted missing from the counts. Reader SQL has `f.deleted_at IS NULL`. PASS.
- R9 (superseded feature excluded) — Same test: alpha has 1 superseded, beta has 1 superseded + 1 deleted; both correctly absent. PASS.
- R10 (soft-deleted project's features excluded) — `dashboard_excludes_deleted_projects` (harness.rs:1476): `ghost` is soft-deleted with 3 `done` features; `alive` has 1 `pending`. Asserts `overall.done == 0`, `overall.total == 1`, `topProjects == ["alive"]` only. Reader SQL has `p.deleted_at IS NULL`. PASS.
- R11 (`overall.percentage` = `percentage(done,total)`) — `completion_hundredths_rounds_half_up` (reader.rs:572) unit-tests the formula with the exact cases from `design.md`; `dashboard_aggregates_counts_across_projects` asserts 30.0 for 3/10 (and 28.57/33.33 for the per-project elements). PASS.
- R12 (no countable feature → exact R12 zeroed body) — `dashboard_with_empty_mirror_returns_zeroes` (truly empty mirror) and `dashboard_percentage_is_zero_when_nothing_is_countable` (only superseded/deleted features). Both assert the full body matches the R12 shape with `percentage: 0.0` (f64, not int). PASS.
- R13 (no counted project → `topProjects == []`) — Same two tests assert `topProjects == []`. PASS.
- R14 (per-project keys = `{slug, done, total, percentage}`; slug round-trip on `/state`) — `dashboard_aggregates_counts_across_projects` asserts the full body and then iterates each returned slug, calling `state_path(slug)` and asserting `200` (lines 1396-1405). PASS.
- R15 (project with no countable feature omitted) — `dashboard_excludes_deleted_and_superseded_features` (beta has only superseded/deleted, omitted) and `dashboard_percentage_is_zero_when_nothing_is_countable` (only project has no countable feature, omitted). PASS.
- R16 (topProjects ordering: done desc, percentage desc, slug asc) — `dashboard_aggregates_counts_across_projects` (alpha 2/7=28.57 ahead of beta 1/3=33.33 because `done` desc wins) and `dashboard_orders_projects_by_done_then_percentage_then_slug` (c-proj 2/2, a-proj 1/1, b-proj 1/1, d-proj 1/4, e-proj 0/3 → c,a,b,d,e with the 1/1 tie breaking by slug byte-wise). The reader sort at `reader.rs:466-475` uses `b.done.cmp(&a.done)`, then `completion_hundredths(b.done,b.total).cmp(&completion_hundredths(a.done,a.total))`, then `a.slug.cmp(&b.slug)` — exact match to R16. PASS.
- R17 (≤10 counted projects: return all) — `dashboard_aggregates_counts_across_projects` (2 projects, both returned). PASS.
- R18 (>10 counted projects: return top 10 by R16) — `dashboard_limits_top_projects_to_ten` (12 projects p01..p12 where pNN has 13-N done; expected slugs p01..p10 in order, `overall.done`/`overall.total` still sum all 12). PASS.
- R19 (SELECT-only) — `reader_performs_only_select_queries` (harness.rs:621) extended to call `read_dashboard` on the read-only pool; also asserts a write attempt fails. The reader SQL is a single `SELECT`. PASS.

## Architecture / conventions / scope check

- `src/harness/reader.rs` matches the design signatures exactly (`DashboardResponse`, `OverallProgress`, `StatusBreakdown` with camelCase `#[serde(rename = ...)]`, `ProjectProgress`, private `ProjectStatusCountsDbRow`, `completion_hundredths`, `TOP_PROJECTS_LIMIT = 10`, `read_dashboard(pool)`).
- `src/harness/router.rs::get_dashboard` has signature `State<AppState>, _user: AuthUser -> Result<Json<DashboardResponse>, ApiError>` — matches design.
- `src/app.rs:42` registers `/api/harness/dashboard` for both auth modes (it sits before the `if config.auth.mode() == AuthMode::Local` block, just like the other harness routes). The `AuthUser` extractor dispatches on the active mode, so the existing 401 tests cover both.
- No new `ApiError` variant, no CORS change, no migration change, no Cargo.toml change.
- `docs/architecture.md` data-flow entry documents the route (overall shape, zero-filled byStatus, 2-decimal percentage with `toFixed(2)` display, top-10 ordering, `slug` → `/state` round-trip guarantee) and the `src/harness/` layer description lists the new route. `docs/verification.md` Level 2 and Level 3 mention the new route. Both edits stay inside the project's house style.
- Comments in new code are limited to the one doc comment on `completion_hundredths` and the `seed_features_with_statuses` doc comment, which is the existing style in this file and consistent with `docs/conventions.md`'s "no comments unless they explain a non-obvious why" rule.

## Verification command

Ran `./init.sh` myself (cargo fmt --check, cargo clippy --all-targets -- -D warnings, cargo build, cargo test, snapshot, mirror sync). No `[WARN]` lines, all 7 init steps green, 24/24 harness tests, 18/18 auth tests, 4/4 binaries, 4/4 cors, 2/2 toolchain, 33/33 lib unit tests, 0 doc-tests. There is no accepted PostgreSQL baseline on this project (no `postgres_schemas` array in `.harness.json` — confirmed by step 4a's "test_helpers disabled in .harness.json (skipping)" line), so ordinary green tests are the required bar, and the project meets it.

## Notes for the implementer (not blocking)

None. The session can be closed by the leader with `scripts/harness.sh log-out` now that the review verdict is recorded.
