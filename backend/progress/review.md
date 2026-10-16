# Review — feature feature_agent_usage_api (#9)

**Verdict:** APPROVED

## Checkpoints

- C1: [x] `.harness.json` and `harness.db` are present, the docs and CHECKPOINTS.md have no template placeholders, and `./init.sh` exited 0 when I ran it.
- C2: [x] Only feature 9 is `in_progress`. Open session 21 belongs to this work. Every test in the suite passes, so the `done` features still pass too.
- C3: [x] Changes are limited to `src/harness/{reader.rs,router.rs}`, `src/app.rs`, the tests, the docs and the test-only `migrations/`. There is no new dependency, layer, `ApiError` variant or CORS change. I found no `println!`, `dbg!` or TODO in the changed source. `read_feature_log` is byte-for-byte unchanged.
- C4: [x] I checked that the new tests import and exercise the new code. `tests/harness.rs` covers it through `build_app` and calls `read_feature_agent_usage` directly. The `reader.rs` unit tests call `build_run_tree` and `union_seconds`. Integration tests use `#[sqlx::test]` against the real migrations, not mocks. I ran `./init.sh` myself and the verify command was green: fmt, clippy `-D warnings`, build, and tests (lib 35, auth 20, harness 35, binaries 4, cors 4, toolchain 2, all passing). My log is at `/private/tmp/claude-501/-Users-ricardoaguilar-Documents-Development-personal-harness-spectator-back-backend/76e2d2b3-04fa-4b56-b845-e3099524919e/scratchpad/review_init.log`. This project has no accepted PostgreSQL baseline and no `postgres_schemas`, so ordinary green tests are the bar, and the suite meets it.
- C5: [x] (pre-logout). The new untracked files are all expected deliverables: `progress/impl_feature_agent_usage_api.md`, `progress/spec_summary_feature_agent_usage_api.md` and `specs/feature_agent_usage_api/`. Two other untracked files were already there before this session: `progress/spec_summary_dashboard_stats_api.md` (from feature 8, dated Oct 14) and `../.DS_Store`. I did not count either against this feature. Session 21 is still open, which is correct: `log-out` comes after this verdict.
- C6: [x] All three spec files exist. R1–R26 are written in EARS form. T1–T20 are `[x]`, and each one has a matching diff or test. I checked every R<n> against the actual test (see below).

## Deviation 1: `migrations/` delivery (R25). Not blocking, owner decision needed

What I found:
- `backend/migrations` in this worktree is a symlink to `/Users/ricardoaguilar/Documents/Development/personal_harness_spectator/backend/migrations` (the main checkout).
- `git check-ignore -v --no-index migrations` reports `.git/info/exclude:42:backend/migrations`. Lines 30 and 42 exclude both the directory and the symlink. These lines are in the owner's manual section, not in the `install.sh` harness-managed block.
- Commit b512367 (Ricardo Aguilar, "chore: stop tracking harness scaffolding") deleted `backend/migrations/0001_harness_schema.sql` from git on purpose. It is described as "the backend's harness Postgres mirror migration ... local tooling, not project content". `git ls-files migrations` is empty on this branch and on main.
- There is no CI (`.github/` does not exist).

Conclusion: `0002_agent_runs.sql` and the `0001` header edit will **not** be committed or delivered with the branch. That matches the delivery policy the owner set in b512367. `0001` has been delivered the same way, untracked, for features 4–8. So this is consistent with the current policy, and I am not blocking on it. The implementer was right to leave the exclusion alone. Three consequences the owner should know about:
1. The committed tests in `tests/harness.rs` need `agent_runs`, and `sqlx::test` embeds `./migrations` at compile time. A clean clone of the branch cannot build or run the test suite. This was already true for `0001`; this feature makes the dependency larger.
2. Because of the symlink, the file was written straight into the main checkout's working tree. Every worktree on this machine now applies `0002`. That is additive and harmless, but it is not scoped to the branch.
3. `docs/architecture.md` and `docs/conventions.md` describe `migrations/` as part of the project's test design, which conflicts with treating it as local tooling. If the owner wants R25 to travel with the code, the fix is to track `backend/migrations/` (remove lines 30 and 42 from `.git/info/exclude` and commit both files). That is a policy change the owner has to make, not a reviewer fix.

Content check: `diff` of everything from `create table` onward, between `migrations/0002_agent_runs.sql` and toolkit `git show 237fabe:db/migrations/0004_agent_runs.sql`, shows no differences. The toolkit's HEAD copy is also identical to 237fabe.

## Deviations 2 and 3: accepted

- `effortSeconds` uses `fold(0.0, ..)` (`reader.rs`, `agent_usage_totals`), and a comment explains why. f64 `Sum` would give `-0.0` over an empty set, and `serde_json::Value` equality would hide that. `agent_usage_with_no_runs_returns_empty_tree_and_zero_totals` compares the raw body text from `get_text` against the exact R20 string, so the test does catch the bug it is meant to catch.
- `AgentRunDbRow` has no `id` field. The SQL still selects `id` and orders by `started_at ASC NULLS LAST, id ASC`, and sqlx `FromRow` ignores extra columns. Removing the unused field is the right way to satisfy `-D warnings`. It does not change behaviour.
- `#![recursion_limit = "256"]` in `tests/harness.rs` is only there for the `json!` literal in the full-body test. That is acceptable.

## Requirement traceability (checked against the test code)

- R1: `harness_endpoints_return_401_without_a_valid_token` now includes `agent_usage_path("test-project","first_feat")`, run over every `unauthorized_cases()` entry. PASS.
- R2: `tests/auth.rs::local_mode_rejects_{supabase,missing}_token_on_agent_usage` use `local_app()` and assert 401 with the exact body. PASS.
- R3, R4, R5, R7, R9, R12, R16–R19: `agent_usage_returns_run_tree_and_totals` asserts the full body with `assert_eq!` against `json!`. It checks every R4/R5 key, the literal `+00:00` timestamps, the nesting lead→impl→explore with rev beside impl, and `spawnDepth` as seeded. The totals are 170.0 / 110.0 / token sums 22/2000/390/99/3/2511, and I recomputed them from the seeds. Rows are inserted in the order rev, thread-x, explore, lead, impl, so id order differs from run order. PASS.
- R6, R13, R17, R18, R19: `agent_usage_renders_nulls_and_orders_by_start_then_id` checks the `n1` node with every key `null`, the order n2, n3, n5, n4, n1 (ties broken by id, and the test asserts `n5 < n4`), `unionSeconds` 10.0 (the inverted n3 is excluded and the identical n4/n5 are counted once), `effortSeconds` 5.0, and tokens {7, 0, ...}. PASS.
- R8, R11: `agent_usage_breaks_parent_cycles_at_the_earliest_run` asserts `[a{children:[c,b]}]` and that each externalId appears exactly once in the serialized body. The unit test `build_run_tree_handles_orphans_and_cycles` checks the shape `x[y],root[mid[leaf],late],self,orphan,codex-child`. PASS.
- R10: in the main test, `thread-x` has a missing parent and `lead` has a NULL parent. `agent_usage_places_runs_without_a_parent_at_root` covers a self-parent, a cross-runtime parent, a parent that is a deleted run, and a parent on another feature. All are top-level with their seeded `spawnDepth`. PASS.
- R14, R15: `agent_usage_excludes_deleted_runs_and_other_features` seeds noisy runs that are deleted, on a sibling feature, unattributed, or on a same-named feature in a foreign project. Both the runs list and the totals equal the single live run. PASS.
- R20: covered by the exact raw-text body test above. PASS.
- R21: `agent_usage_for_unknown_or_deleted_project_returns_404` covers a missing slug and a deleted one. PASS.
- R22: `agent_usage_for_unknown_or_deleted_feature_returns_404` covers missing, deleted and `Alive_feat` (case-sensitive). PASS.
- R23: `agent_usage_does_not_cross_projects` returns 404 under project-a and 200 under project-b. PASS.
- R24: `reader_performs_only_select_queries` calls `read_feature_agent_usage` on the read-only pool and asserts `runs.len() == 1`. PASS.
- R25: `test_schema_reproduces_toolkit_agent_runs` checks the 24 columns (types, nullability, defaults), the 5 constraint definitions, the 5 full index definitions (built from `current_schema()`), that the view's columns equal the table's, and that the view filters out the soft-deleted row. PASS. The delivery caveat is under Deviation 1.
- R26: `feature_log_is_unchanged_when_agent_runs_exist` compares the log body before and after seeding two runs, and checks the keys are exactly `feature` and `sessions`. PASS.

## Required changes

None for the code.

## Owner decision (not blocking)

Choose whether `backend/migrations/` should stay local-only (current policy, b512367) or be tracked so the test schema, including R25's `0002_agent_runs.sql`, ships with the branch and a clean clone can run the tests. Until it is tracked, the PR for this branch will not contain `0002_agent_runs.sql`.
