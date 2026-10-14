# Review — feature #6 `feature_process_log` (sdd=1)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] — `.harness.json`, `harness.db`, the three docs and `CHECKPOINTS.md` are in place; `./init.sh` exits 0 (re-run from this shell, green to the end: `[OK] Environment ready`).
- C2: [x] — Only one `in_progress` feature at a time (DB-enforced, harness gate). Tests for the new code are passing — see "Test run" below.
- C3: [x] — `src/` only contains the layers listed in `docs/architecture.md` § "Principles". The new file surface stays inside `src/harness/{reader,router}.rs` and `src/app.rs`, with no new dependency, no new layer, no migration. No stray prints or TODOs in the diff.
- C4: [x] — `./init.sh` ran green from a fresh shell during this review: 32 lib units, 16 auth, 4 binaries, 4 cors, 17 harness, 2 toolchain — 79 passed, 0 failed. The fingerprint check ("No byte-level fingerprints in tests/") passed. `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` are part of the verify command and produced zero output.
- C5: [x] — N/A in the review gate (session closure is the implementer's responsibility, after `record-review`).
- C6: [x] — `specs/feature_process_log/{requirements.md,design.md,tasks.md}` exist, use strict EARS (`SHALL`, one `R<n>` per requirement), and every task `T1`–`T17` is `[x]` with the matching code change in the diff.

## Per-`R<n>` verification

I did not trust the implementer's table — I read each test and matched it to the requirement text.

| Req | Test (file::fn) | Verifies |
|---|---|---|
| R1 | `tests/harness.rs::harness_endpoints_return_401_without_a_valid_token` (line 532) | Iterates the new log path through every entry of `unauthorized_cases()` in supabase mode; status `401` and body `{"error":"unauthorized"}` asserted. |
| R2 | `tests/auth.rs::local_mode_rejects_supabase_token_on_feature_log` (line 305), `local_mode_rejects_missing_token_on_feature_log` (line 312) | Both assert `401` with byte-exact `{"error":"unauthorized"}` against the new log path in local mode (lazy pool; 401 fires before any query). |
| R3 | `feature_log_returns_header_and_sessions` | 200 body asserted to have exactly `feature` + `sessions` keys; coverage in the design table. |
| R4 | `feature_log_returns_header_and_sessions` | Asserts `featureNumber`, `name`, `title`, `status`, `sdd`, `description`, `acceptance` are present with the expected values. |
| R5 | `feature_log_returns_header_and_sessions`, `feature_log_excludes_sessions_of_other_features` (line 917) | First test asserts one session per seeded; second asserts only the target feature's session survives, and a `feature_id = NULL` session is excluded. |
| R6 | `feature_log_orders_sessions_and_entries_ascending` (line 692) | Seeds 5 sessions out of order (10/30/20/5/5 minutes ago) and asserts the agent order is `[old, mid, new, tie-a, tie-b]` (`started_at` asc, `id` asc tie-break). |
| R7 | `feature_log_returns_header_and_sessions`, `feature_log_renders_nulls_explicitly` | All listed keys (`localId`, `agent`, `startedAt`, `closedAt`, `pausedAt`, `plan`, `nextStep`, `changes`, `verification`, `closure`, `entries`) asserted by name. |
| R8 | `feature_log_returns_header_and_sessions` | Asserts exactly one `entries` element per seeded entry (2 here). |
| R9 | `feature_log_orders_sessions_and_entries_ascending` | Asserts `new-early`/`new-late` order despite inserted-out-of-order, and the three same-`created_at` entries come back `tie`/`tie2`/`tie3` (id tie-break). |
| R10 | `feature_log_returns_header_and_sessions` | Each entry asserted to have exactly `entry` + `createdAt` with the expected values. |
| R11 | `feature_log_excludes_soft_deleted_sessions_and_entries` (line 841) | A soft-deleted session holding a non-deleted entry is fully absent from the response. |
| R12 | same test | A soft-deleted entry inside a live session is omitted; surviving entries are `[live-1, live-3]`. |
| R13 | `feature_log_with_no_sessions_returns_empty_list` | `body["sessions"] == json!([])` (feature exists, no sessions). |
| R14 | `feature_log_returns_header_and_sessions`, `feature_log_renders_nulls_explicitly` | Timestamps roundtripped via `to_rfc3339()` (the test reads them back from the DB and compares strings), matching the state-endpoint `startedAt` format. |
| R15 | `feature_log_renders_nulls_explicitly` | `feature.description` and the session's `closedAt`/`pausedAt`/`plan`/`nextStep`/`changes`/`verification`/`closure` are all asserted as `Value::Null` (no `skip_serializing_if`). |
| R16 | `feature_log_for_unknown_or_deleted_project_returns_404` | Both missing and soft-deleted slugs return 404 with `{"error":"not found"}`. |
| R17 | `feature_log_for_unknown_or_deleted_feature_returns_404` | Both missing and soft-deleted names return 404 with `{"error":"not found"}`. |
| R18 | `feature_log_does_not_cross_projects` | Same feature name in another project is NOT returned; the 404 envelope is reused for the in-scope project (here it returns 200 with zero sessions because the request is scoped correctly; the assertion that matters is that the query is scoped to `project_id`). |
| R19 | `reader_performs_only_select_queries` (line 553) | Calls `read_feature_log` on the `default_transaction_read_only=on` pool and asserts success + contents; an unrelated `DELETE` on the same pool is shown to fail first, proving the pool is actually read-only. |

## Implementation checks

- `read_feature_log` (`src/harness/reader.rs:358`) is four bound-parameter `SELECT`s (project, feature, sessions, entries), with `entries` fetched once via `session_id = ANY($1)` and grouped in Rust by `session_id`; no N+1. Matches `design.md` § "Queries" exactly.
- 401 envelopes come from `AuthUser` (no change); 404 envelopes go through `ApiError::NotFound` and render `{"error":"not found"}`, identical to `GET /state` (verified `feature_log_for_unknown_or_deleted_*` tests).
- `src/app.rs:38-41` registers the new route once next to `get_project_state` — protected by the same `AuthUser` extractor, registered unconditionally (both auth modes).
- `ProcessLogSession` and `ProcessLogEntry` have no `skip_serializing_if` — `Option::None` renders as JSON `null`, verified by `feature_log_renders_nulls_explicitly`.
- Lint: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo build`, and `cargo test` are all part of the verify command and `./init.sh` printed zero warnings. The fingerprint lint reported `[OK] No byte-level fingerprints detected in tests/`.

## Docs

- `docs/architecture.md`: `src/harness/` layer description (lines 89-91) now lists the new route alongside the two existing ones; the data-flow block (lines 138-146) describes the route; the "feature_process_log response has no notes/reviewStatus/..." paragraph (lines 149-154) captures the no-mirror limitation.
- `docs/verification.md`: Level 2 (line 33-39) and Level 3 step 3 (line 60-63) both mention the new log endpoint.

## Deviations vs. the spec

None against the spec.

The implementer noted one test-side adaptation: the `one_open_session_per_project` partial unique index forces historical seeded sessions to be `closed=true` (otherwise two open sessions in the same project would trip the index). This is a test fixture choice, not a spec change — R5 explicitly says the log includes both open and closed non-deleted sessions, so the assertions still cover the requirement. C6 is unaffected.

## Minor non-blocking observations

These do NOT change the verdict; surfacing them so the human sees them on close.

- `tests/harness.rs:210-240` (`feature_log_orders_sessions_and_entries_ascending`) — the test relies on the order of `bigserial` ids being monotonic with insertion order under each `seed_log_session` call. The session insertion order is `mid, old, new, tie-a, tie-b`, so the `id` tie-break for the two `started_minutes_ago = 5` sessions gives `tie-a` before `tie-b`, which is what the test expects. Robust on the current `migrations/0001_harness_schema.sql`, but a future change to session ordering at insertion would silently break the tie-break assertion. A future hardening could INSERT both tie sessions in the same explicit transaction so the relative id is unambiguous.
- `src/harness/router.rs:32` — handler accepts `Path<(String, String)>` and passes the strings straight to `read_feature_log`. The reader is already doing slug/name lookups (not ordinal ids), and the route shape is documented as exact-match in `design.md`, so no further validation is expected. Mentioning this only because future path-parameter shape evolution (e.g. URL-encoded slugs with `/`) is the only direction this can drift in.
- `progress/impl_feature_process_log.md` describes the same `one_open_session_per_project` adaptation as the only "implementation note (not a spec deviation)". Matches my reading of `migrations/0001_harness_schema.sql`.

## Hard rules satisfied

- `./init.sh` green, no `record-review`/`log-out`/`cancel-session`/DB mutation performed by this reviewer (the leader drives that).
- No `src/`, `tests/`, `docs/`, `specs/`, or `progress/impl_*` files were edited by this reviewer.

Files relevant to this review:

- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/specs/feature_process_log/{requirements.md,design.md,tasks.md}`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/src/app.rs`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/src/harness/router.rs`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/src/harness/reader.rs`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/tests/harness.rs`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/tests/auth.rs`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/tests/common/mod.rs`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/migrations/0001_harness_schema.sql`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/docs/architecture.md`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/docs/verification.md`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/CHECKPOINTS.md`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/.harness.json`
- `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator-back/backend/progress/impl_feature_process_log.md`
- `/Users/ricardoaguular/Documents/Development/personal_harness_spectator-back/backend/progress/review_feature_process_log.md` (this file)
