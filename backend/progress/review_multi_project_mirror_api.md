# Review — feature 4 `multi_project_mirror_api`

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, filled-in docs and `CHECKPOINTS.md` present; `./init.sh` exit 0, ends `[OK] Environment ready`, no `[WARN]`, mirror sync complete.
- C2: [x] — Only feature 4 is `in_progress`; features 1-3 (`done`) pass (`cargo test`: lib 4/4, cors 3/3, harness 8/8, toolchain 2/2, run by me via `./init.sh`). Open session 10 is this feature's real, current work.
- C3: [x] — Changes stay in `src/harness/`, `src/app.rs`, `src/config.rs` (the documented layers); no `Cargo.toml`/`Cargo.lock` change (`sqlx::types::Uuid` comes from the allowlisted `uuid` feature); no debug prints or TODOs. The one new comment in `reader.rs` explains a non-obvious why (the mirror has no blocked-features table). Only `SELECT`s in `reader.rs`.
- C4: [x] — `tests/harness.rs` imports and exercises `list_projects`/`read_project_state` and the real router (`build_test_app` + `oneshot`), with mirror-shaped seeds; `tests/cors.rs` was repointed to `/api/harness/projects` with the assertions unchanged. `verify_command` is green (fmt, clippy `-D warnings`, build, test).
- C5: [ ] — Pending by design: the session is open and `log-out` belongs to the implementer after this approval. No stray files in `backend/`. `progress/impl_multi_project_mirror_api.md` is an intended handoff file. The untracked `.DS_Store` and `frontend/specs/local_auth_login/` at the repo root are outside this project and unrelated to this feature.
- C6: N/A — `sdd=0`.

## Acceptance (harness DB) vs. evidence

1. Mirror schema / enum as text / `text[]` / bigint / deleted_at / paused_at: met. `migrations/0001_harness_schema.sql` matches the toolkit's `db/schema.postgres.sql` + 0001..0003 for `projects`, `feature_status` (all 7 values), `features`, `session_log` (with `paused_at`), `session_log_entries` and their indexes. Specs and views are omitted because the reader doesn't use them. `pgcrypto` is omitted because `gen_random_uuid` is built in.
2. `GET /api/harness/projects`: met (`projects_returns_non_deleted_projects_with_counts_ordered_by_slug`; also checked live, see below).
3. `GET /api/harness/projects/{slug}/state` uses the same payload shape (the response structs are unchanged); an unknown or deleted slug returns 404 `{"error":"not found"}`. Met.
4. `PROJECT_SLUG` removed from `Config` and `.env.example`; the `/api/harness/state` route is removed (`old_state_route_is_gone`; a live run returns 404). Met. Your local `backend/.env` still sets `PROJECT_SLUG`, but nothing reads it now.
5. Blocked note = latest non-deleted entry of the feature's latest non-deleted session, else `""`. Met and tested, including the soft-deleted-entry and older-session cases.
6. Test migration, mirror-shaped seeds, 401 on both endpoints (missing, wrong signature, expired, wrong `aud`), CORS green: met.
7. No DML; `docs/architecture.md` documents the endpoints and the mirror. Met.

## Real mirror (read-only, localhost:54329, PostgreSQL 15.18)

- In a `BEGIN READ ONLY; ... ROLLBACK;` session, I ran the reader's 4 SQL statements verbatim for `spectator_frontend`, `v_gp5_library-frontend`, `rushr-web-display-db` and `spectator_backend`. All of them ran. `\gdesc` types match the Rust decode types: `uuid`, `text`, `bigint` counts → `i64`, `integer` feature_number → `i32`, `boolean` sdd, `timestamptz` started_at → `DateTime<Utc>`, `status::text` → `String`.
- `information_schema`: `features.status` is `feature_status`, `session_log.next_step` is `_text`, ids are `int8`, `projects.id` is `uuid`. This matches the migration.
- `rushr-web-display-db` has a paused session (id 10889, `paused_at` set) plus an active one. The reader returns the active one as `openSession`. The blocked feature `prepare_reusable_fixtures_across_database_projects` gets its note from the paused session's latest entry. That is the intended behavior.
- Live smoke: I ran the built binary with `DATABASE_URL` pointing at the mirror and `options=-c default_transaction_read_only=on`, plus a locally signed HS256 token. Results: `/api/harness/projects` → 401 without a token and 200 with one (22 projects, ordered by slug). `/projects/{spectator_frontend,rushr-web-display-db,v_gp5_library-frontend}/state` → 200 with correct payloads. `/projects/no-such-slug/state` → 404 with a token and 401 without one. `/api/harness/state` → 404. The server log shows no sqlx/decode errors.

## Deviations judged

1. **The read-only test uses a `default_transaction_read_only=on` pool instead of `pg_stat_user_tables` counters.** Accepted. The test first proves the pool rejects a `DELETE`, then runs both reader functions on it, so any DML added to the reader would make the test fail. The counter approach could not guarantee this, because Postgres reports those counters asynchronously.
2. **`blockedFeatures` is ordered by `feature_number`.** Accepted. The mirror has no `blocked_at` column, the acceptance criteria set no order, and this order is deterministic and matches `features`.
3. **401 comes before 404 for an unknown slug.** Accepted and preferred. The auth extractor runs before the lookup, so unauthenticated callers can't use the API to check whether a slug exists. Acceptance 6 requires 401 without a valid token on both endpoints.

## Required Changes

None.
