# impl: multi_project_mirror_api (feature 4, sdd=0)

## Outcome
Backend reads the toolkit Postgres mirror and serves any project by slug.
- `GET /api/harness/projects` -> `[{slug, description, counts: {total, done, inProgress, blocked}}]`, non-deleted projects, ordered by slug; counts over non-deleted features.
- `GET /api/harness/projects/{slug}/state` -> same `{project, features, openSession, blockedFeatures}` camelCase payload as the old `/api/harness/state`; unknown or soft-deleted slug -> 404 `{"error":"not found"}`.
- `/api/harness/state` and `PROJECT_SLUG` (Config, `.env.example`) removed. `backend/.env` untouched (still has PROJECT_SLUG; now ignored).

## Scope / files
- `migrations/0001_harness_schema.sql` (git-excluded, local): mirror DDL for projects, `feature_status` enum (all 7 values), features, session_log (text[] cols, paused_at), session_log_entries, plus the mirror's indexes. `create extension pgcrypto` omitted (gen_random_uuid is built in).
- `src/harness/reader.rs`: `list_projects`, `read_project_state` (replaces `read_harness_state`). `status::text`; `array_to_string(next_step, ' | ')` (NULL when empty, same as before); open session = closed_at/paused_at/deleted_at all null; blocked note = latest non-deleted entry of the feature's latest non-deleted session, else "". Blocked list ordered by feature_number (old order was blocked_at, which the mirror lacks).
- `src/harness/router.rs`, `src/app.rs`, `src/config.rs`, `.env.example`.
- `tests/harness.rs` (rewritten, 8 tests), `tests/common/mod.rs`, `tests/cors.rs` (PATH -> `/api/harness/projects`, assertions unchanged).
- `docs/architecture.md` (endpoints + "Data source: the toolkit's Postgres mirror" section), `docs/verification.md`.

## Acceptance -> evidence (tests/harness.rs)
1. Mirror schema / enum as text / text[] / bigint / deleted_at / paused_at: `project_state_returns_mirror_data_for_the_requested_slug`, `project_state_reports_no_open_session_when_only_paused_or_closed_exist`, `project_state_prefers_active_project_over_deleted_one_with_same_slug`.
2. Projects list: `projects_returns_non_deleted_projects_with_counts_ordered_by_slug`.
3. Per-slug state + 404: `project_state_returns_mirror_data_for_the_requested_slug`, `project_state_for_unknown_or_deleted_slug_returns_404`.
4. Old route/PROJECT_SLUG removed: `old_state_route_is_gone`; grep shows no PROJECT_SLUG in src/ or .env.example.
5. Blocked note rule: blocked_feat (latest session's latest non-deleted entry, older session ignored), blocked_no_log (""), and the paused/closed test (latest session deleted -> falls back to older).
6. Migration reproduces mirror; 401 on both endpoints for missing/wrong-sig/expired/wrong-aud: `both_endpoints_return_401_without_a_valid_token`; CORS: tests/cors.rs 3/3 green.
7. No DML: `reader_performs_only_select_queries` runs both reader fns on a `default_transaction_read_only=on` pool (asserts that pool rejects a DELETE first). Replaced the pg_stat_user_tables counter approach, whose counters flush asynchronously. Docs updated.

## Verification
`./init.sh` exit 0, "[OK] Environment ready", no [WARN] lines, mirror sync complete.
cargo test: lib 4/4, cors 3/3, harness 8/8, toolchain 2/2 (17 passed, 0 failed). fmt + clippy -D warnings clean.
`cargo clean -p harness_frontend_backend` run after the migration change.
