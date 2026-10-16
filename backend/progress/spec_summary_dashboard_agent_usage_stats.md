# Spec summary — dashboard_agent_usage_stats (feature 10)

Status: `spec_ready` (R=19, T=11). It is waiting for human approval. Files: `specs/dashboard_agent_usage_stats/{requirements,design,tasks}.md`.

## Scope

- `GET /api/harness/dashboard` gets one new top-level key, `agentUsage`. There is no new route, no migration and no router/app change. `overall` and `topProjects` stay byte-identical (R2).
- `agentUsage = {runs, effortSeconds, tokens, byRuntime, byModel, byRole, topProjects}`. Every aggregate uses the same "usage bucket" shape, `{runs, effortSeconds, tokens}`. `tokens` reuses feature 9's `TokenTotals`: `input/cacheRead/cacheWrite/output/reasoning/total`, integers that are never null.
- `byRuntime` is a fixed object `{claude, codex}` that is zero-filled when a runtime has no runs.
- `byModel` and `byRole` are arrays with no cap. A `NULL` value is its own `null` entry. They are ordered by `tokens.total` desc, then key byte-wise, with null last.
- `agentUsage.topProjects` holds at most 10 entries `{slug, ...bucket}`, ordered by `tokens.total` desc and then slug byte-wise. Projects with no runs are omitted, and every slug resolves on `/projects/{slug}/state`.
- If no run is counted, `agentUsage` is an exact empty value (R18).
- The existing out-of-scope list still holds: no cross-project union/wall time, no filters, no time series.

## Key decisions

- **Counted run:** the `agent_runs` row and its project are both not soft-deleted. Feature state is ignored, so runs with a `NULL` feature or on a deleted or superseded feature still count, because those tokens were really spent.
- **Query:** one grouped `SELECT` over `(slug, runtime, model, agent_role)`, then a pure `fold_agent_usage` in Rust. This follows the same pattern as feature 8. `SUM(bigint)` returns `numeric`, so the query needs explicit `::bigint` casts: there is no bigdecimal feature.
- **Existing tests:** only 2 of the 7 feature-8 dashboard tests assert the full body. Each one gains the `"agentUsage": empty_agent_usage()` line and nothing else. The other 5 stay untouched.
- **Supersedes feature 8 R3:** "only keys are `overall` and `topProjects`" is replaced by R1 here.

## Open questions

1. **This is the most important one.** If `agent_runs` is missing on the deployed mirror, the WHOLE dashboard returns `500`, including the progress cards that work today. The spec keeps `500` for consistency with feature 9. The alternatives are to degrade `agentUsage` to empty, or to move it to a separate route. My recommendation is to keep `500` and confirm that the toolkit's `0004_agent_runs.sql` is applied to the mirror before this ships.
2. Please confirm the inclusion rule above, or align it with the progress block, which excludes deleted and superseded features.
3. Is having no cap on `byModel`/`byRole` acceptable?
4. The frontend consumer `dashboard_agent_usage_cards` has not confirmed the key names or the bucket shape.
