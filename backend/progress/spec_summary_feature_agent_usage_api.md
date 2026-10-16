# Spec summary — feature_agent_usage_api (feature 9)

Status: `spec_ready` (R=26, T=20), awaiting human approval. Notion card pushed to "Spec Ready".
Files: `specs/feature_agent_usage_api/{requirements,design,tasks}.md`.

## Scope

`GET /api/harness/projects/{slug}/features/{name}/agent-usage`. It is protected in both auth modes and
read-only, and returns `{runs, totals}` for one feature from the mirror's `agent_runs` table. The
log route is unchanged (R26 has a before/after equality test for it).

- `runs` is a **nested tree**. Each node has `externalId, parentExternalId, runtime, role, label,
  model, spawnDepth, startedAt, finishedAt, durationSeconds, tokens{input, cacheRead, cacheWrite,
  output, reasoning, total}, children`. Nullable keys are always present.
- `totals` is `{effortSeconds, unionSeconds, tokens{...6 categories}}`. With no runs it is all zeros,
  and the response is still 200.

## Key decisions

- Parent match is on `(runtime, parent_external_id)` within the feature's non-deleted runs, the same
  as the toolkit's `tree_order`. A run with an unknown, deleted, other-feature, other-runtime or self
  parent goes to the root and keeps its `spawn_depth`. In a parent cycle, the earliest member is
  promoted to the root, so every run appears exactly once.
- Ordering is `started_at` ascending with NULLs last, then `id`, at every level.
- The union of intervals and the sums are computed in Rust: the same merge as `agent_usage.py`, at
  microsecond resolution. A run only gets an interval when it has both timestamps and
  `finished >= started`.
- The test schema adds a new `migrations/0002_agent_runs.sql`, copied verbatim from toolkit
  `db/migrations/0004_agent_runs.sql` (commit 237fabe). A catalog test checks it: columns,
  constraints, indexes and the view (R25).
- No feature header in the response, no new dependency, no new `ApiError` variant, no UI.

## Mirror dependency

The route reads `agent_runs` directly over `DATABASE_URL` and does not use the `upsert_agent_run` RPC.
Implementation and tests do not depend on the deployed mirror. Production data needs both toolkit
files applied to the mirror:

- `0004_agent_runs.sql` creates the table. If it is missing, the route returns 500.
- `db/rpc/upsert_agent_run.sql` fills it. The current PGRST202 means it is missing, so the table is
  empty and every feature shows zero runs.

I did not check whether the table exists, because no Supabase credentials were available. No Notion
card was created and nothing is blocked.

## Open questions for the human

1. Who applies 0004 + `upsert_agent_run.sql` to the mirror, and should feature 9 wait? My
   recommendation is not to block, but the leader may propose a cross-project card (§8).
2. If the table is missing, return 500 (current design) or an empty 200?
3. Nested tree or flat list? The frontend `feature_agent_usage_panel` card isn't in the frontend
   harness yet, so this shape has not been confirmed by the consumer.
4. Are the key names `effortSeconds` / `unionSeconds` / `role` OK?
