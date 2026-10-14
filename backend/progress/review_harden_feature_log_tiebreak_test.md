# Review — feature 7 harden_feature_log_tiebreak_test

**Verdict:** APPROVED

## Acceptance criteria

1. Tied seeds: [x]. tie-a and tie-b use `started_at_override: Some(tied_started_at)` (2100-01-01T00:00:00Z). tie, tie2 and tie3 use `insert_entry_at(..., tied_created_at)` (2100-01-01T00:05:00Z). See tests/harness.rs:747-900.
2. Equality asserted before order: [x]. `COUNT(DISTINCT started_at) = 1` and `COUNT(DISTINCT created_at) = 1` both run before the HTTP call, and so does `assert!(tie_a < tie_b && tie1 < tie2 && tie2 < tie3)`.
3. Mutation kill: [x]. I re-ran this myself against a backup of src/harness/reader.rs, restoring it after each mutation, 3 runs per mutation:
   - sessions `ORDER BY started_at ASC` (id ASC removed): FAIL 3/3, left `["old","mid","new","tie-b","tie-a"]`
   - entries `ORDER BY session_id ASC, created_at ASC` (id ASC removed): FAIL 3/3, left `["tie3","tie","tie2"]`
   - original src: PASS 3/3
   - Afterwards, `git diff src/` is byte-identical (`cmp`) to the snapshot I took before the check.
4. No src/ changes, init green: [x]. src/ diff is unchanged by this session. `./init.sh` exit 0, no [WARN]. tests/harness.rs: 17 passed. All suites green. No PostgreSQL baseline is in use, so these are ordinary green tests.

## Soundness of the relocation and local_id swap

- Deterministic under correct src. The passing state depends only on the explicit `ORDER BY ... id ASC`, which Postgres guarantees. Heap or index order cannot make the test fail while the query is correct, so there is no flake risk on the green path.
- Residual caveat (non-blocking). The mutation's *kill power* depends on physical order: non-HOT updates on indexed `closed_at`/`created_at`, and the local_id swap that defeats a `(project_id, local_id)` index scan. If the planner or storage behaviour changes in a future Postgres version, the mutated query could happen to return id order and the test would stop discriminating. It would not fail falsely. This is the best a black-box test can do, and the comments on `relocate_session`/`relocate_entry` document the intent.
- The `local_id` swap (tie-a=5, tie-b=4) is harmless. The endpoint orders by `started_at, id`, never `local_id`, and the test asserts nothing about local_id.
- Other callers are unaffected. Every other `LogSessionSeed` literal passes `started_at_override: None` (grep: lines 681, 777, 797, 817, 947, 978, 1035, 1056, 1077, 1134, 1157, 1219). `COALESCE(NULL, now() - interval)` keeps their prior behaviour. `insert_entry_with_offset` is untouched. `insert_entry_at`, `relocate_session` and `relocate_entry` are used only by this test.

## Checkpoints

- C1: [x] `./init.sh` exits 0.
- C2: [x] One in_progress feature (7). The open session 16 is current work. Tests pass (run myself).
- C3: [x] No src/ changes. No debug prints or contextless TODOs in the test delta.
- C4: [x] The changed file is the test itself. It exercises the real HTTP endpoint against a real `sqlx::test` Postgres, and the mutation check proves it discriminates.
- C5: [ ] pending. log-out is the implementer's step after this approval. progress/impl_*.md and review_*.md are intentional artifacts.
- C6: N/A (sdd=0)

## Note for the caller

- Running the test with the `.env` `DATABASE_URL` fails (read-only DB, `25006`). Tests must use the `.harness.json` default `postgres://harness_test:harness_test@localhost/harness_test_base?host=/tmp`, which `./init.sh` exports. This is an environment detail, not a defect in this feature.
