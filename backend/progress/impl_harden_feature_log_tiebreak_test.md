# Implementer handoff: feature 7 harden_feature_log_tiebreak_test

## Outcome
`feature_log_orders_sessions_and_entries_ascending` (tests/harness.rs) now depends on the `id ASC`
tie-break in both `read_feature_log` queries (src/harness/reader.rs, R6/R9 of
specs/feature_process_log). Only tests changed. src/ is byte-identical to before the session
(`git diff src/` compared with `cmp` against a snapshot taken right after claim).

## Changes (tests/harness.rs only)
- `LogSessionSeed` gets a new field `started_at_override: Option<DateTime<Utc>>`. The SQL uses
  `COALESCE($14::timestamptz, now() - make_interval(mins => $10))`. Every other caller passes
  `None`, so their behavior is unchanged. `SessionSeed`, the other struct, is untouched.
- New `insert_entry_at(pool, session, local_id, entry, created_at)` inserts an entry with a literal
  `created_at`. `insert_entry_with_offset` and its callers are unchanged.
- tie-a and tie-b use literal `started_at = 2100-01-01T00:00:00Z`. Because that is later than every
  relative timestamp, the expected order old, mid, new, tie-a, tie-b still holds. tie, tie2 and
  tie3 use literal `created_at = 2100-01-01T00:05:00Z`.
- Before the HTTP call, the test asserts `COUNT(DISTINCT started_at) = 1` for tie-a/tie-b and
  `COUNT(DISTINCT created_at) = 1` for the three entries. It also asserts that the ids ascend.
- Making the tie-break observable: equal timestamps alone were not enough, because Postgres
  returned rows in insertion order, which is also id order.
  - `relocate_session(tie_a)` sets the indexed `closed_at` to `clock_timestamp()`. This is a
    non-HOT update: it writes a new heap tuple and a new `(project_id, closed_at)` index entry
    that sorts after tie-b.
  - tie-a and tie-b swap local_ids (5 and 4), so an index scan on `(project_id, local_id)` also
    returns tie-b first.
  - `relocate_entry(tie1)` and then `relocate_entry(tie2)` move `created_at` +1s and back -1s,
    two non-HOT updates on an indexed column. The scan order becomes tie3, tie, tie2.
  - With these changes the test asserts nothing about closed_at or local_id.

## Mutation verification (src reverted after each run)
| Mutation in src/harness/reader.rs | Result |
|---|---|
| sessions query `ORDER BY started_at ASC` (id ASC removed) | FAIL: left `["old","mid","new","tie-b","tie-a"]` |
| entries query `ORDER BY session_id ASC, created_at ASC` (id ASC removed) | FAIL: left `["tie3","tie","tie2"]` |
| original src | PASS (3 consecutive runs) |

The first attempt (equal timestamps plus a started_at-only relocation) did NOT catch the sessions
mutation, likely because an index scan on closed_at preserved id order. That is why the
closed_at bump and the local_id swap are needed.

## Verification
- `./init.sh`: exit 0, which covers fmt --check, clippy -D warnings, build and all tests. No
  `[WARN]` lines. tests/harness.rs: 17 passed.
- No PostgreSQL baseline is in use. Ordinary green tests.

## Notes
- tests/harness.rs already had uncommitted feature 6 changes before this session. This feature's
  delta sits on top of them.
