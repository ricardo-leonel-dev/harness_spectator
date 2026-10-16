# Review — feature 10 `dashboard_agent_usage_stats` (sdd=1, session 23)

**Verdict:** APPROVED

Reviewed against `specs/dashboard_agent_usage_stats/{requirements,design,tasks}.md` (R1–R19, T1–T11),
`docs/architecture.md`, `docs/conventions.md`, `CHECKPOINTS.md`. Human-approved decisions applied:
keep `500` when `agent_runs` is missing (OQ1), count runs whatever their feature (OQ2), no cap on
`byModel` / `byRole` (OQ3).

## Independent verification

- `./init.sh` exit 0, `[OK] Environment ready`. Its `verify_command` is
  `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo build && cargo test`
  (DATABASE_URL default `harness_test_base`). Results: lib 36 passed (includes
  `fold_agent_usage_groups_and_sorts`), `tests/harness.rs` 39 passed, auth 20, cors 4 + 4, bins 2;
  0 failed. All 11 dashboard tests ran and passed in that run (7 feature-8 + 4 new). No separate
  `cargo test` rerun: init's run covers the same inputs/environment.
- No PostgreSQL baseline in use, so these are ordinary green tests. Mock-data workflow N/A (no
  `postgres_schemas`).
- `git diff -U0 tests/harness.rs | grep '^-'` shows only the file header: the two feature-8 full-body
  tests gain only `"agentUsage": empty_agent_usage()`; the other five dashboard tests are untouched.
- `git check-ignore` on deliverables exits 1 (none excluded).

## Code review

- `src/harness/reader.rs`: types match design signatures; query matches design § "Query" exactly
  (`::float8` / `::bigint` casts, no `features` join, `p.deleted_at IS NULL AND r.deleted_at IS NULL`,
  `SELECT` only). It runs after the unchanged feature-count query/fold/sort (diff shows no edits to
  them). `fold_agent_usage` sums totals before `truncate(TOP_PROJECTS_LIMIT)`, accumulates effort with
  `+=` from `0.0`, sorts by `tokens.total` desc then byte-wise `str::cmp` with `None` last
  (`cmp_nullable_key`). No new dependency, no debug prints, no TODOs. `router.rs`, `app.rs`,
  `migrations/`, `Cargo.toml` untouched, as the design says.
- Unknown `runtime` is silently skipped in `byRuntime` (`_ => {}`); unreachable given the mirror
  `CHECK` constraint. Acceptable.
- Docs: `architecture.md` documents the `agentUsage` contract and the widened `500` blast radius;
  `verification.md` Level 2/3 updated (T10).

## Traceability (verified by reading each test)

| Req | Test | Verified |
|---|---|---|
| R1, R2, R3 | `dashboard_with_empty_mirror_returns_zeroes`, `dashboard_aggregates_counts_across_projects`, `dashboard_agent_usage_aggregates_runs_across_projects`, `dashboard_agent_usage_is_empty_when_only_deleted_runs_exist` (full-body `assert_eq!`, exactly 3 top-level keys, exact `agentUsage` key set); 5 untouched feature-8 tests pass | yes |
| R4, R8, R9, R11, R13 | `dashboard_agent_usage_aggregates_runs_across_projects`: full expected body matches design fixture values (5 runs, 144.75, total 2387; per runtime/model/role/project buckets incl. `null` groups) | yes |
| R5 | same test, r4 (`deleted: true`, total 99999) excluded; `..._only_deleted_runs_exist` | yes |
| R6 | same test, `gone` project (r7, 5000) excluded; `..._only_deleted_runs_exist` | yes |
| R7 | r2/r6 `feature_id NULL`, r3 on `superseded` a2, r5 on soft-deleted b1 (`seed_feature(..., deleted=true)`) all counted | yes |
| R10, R12, R15 | `dashboard_agent_usage_orders_breakdowns_and_ranking` (ties broken by key, `null` last); unit `fold_agent_usage_groups_and_sorts` (`"B"` before `"a"`, `None` after equal-total `Some`) | yes |
| R14 | `gamma` (no runs) omitted; `p-d` with total 0 present; deleted-only case yields `[]` | yes |
| R16 | aggregates test (2 projects, both returned); limits test | yes |
| R17 | `dashboard_agent_usage_limits_top_projects_to_ten`: `u01`..`u10`, totals still 12 runs / 780 | yes |
| R18 | `empty_agent_usage()` full-body asserts; unit test asserts `effortSeconds` serializes `0.0` | yes |
| R19 | `reader_performs_only_select_queries` on `default_transaction_read_only=on` pool asserts `agent_usage.totals.runs == 1` | yes |

T1–T11 are all `[x]` and each has a matching diff.

## Checkpoints

- C1: [x] `.harness.json`, `harness.db`, docs present; `./init.sh` exit 0.
- C2: [x] one feature `in_progress`; tests pass; session 23 reflects current work.
- C3: [x] changes confined to the reader layer; no new dependency; no debug output/TODOs.
- C4: [x] new unit + 4 integration tests against real Postgres via `sqlx::test`; verify command green (run by me).
- C5: [x] for the reviewable scope: no stray temp files from this feature (`progress/spec_summary_*.md`
  and `../.DS_Store` predate the session and are outside the change set). Log-out is pending this
  approval and is the implementer's next step.
- C6: [x] spec files exist; EARS `R1`–`R19`; all tasks `[x]`; every `R<n>` maps to a passing test,
  verified directly.

## Required Changes

None.

## Non-blocking notes

1. OQ4 (frontend consumer shape not confirmed) is still open; that belongs to
   `dashboard_agent_usage_cards`, not this feature.
2. Before deploying, confirm `agent_runs` exists on the target mirror, otherwise the whole dashboard
   returns `500` (accepted by the human, documented in `docs/architecture.md`).
