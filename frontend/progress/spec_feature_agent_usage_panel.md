# Spec summary — feature_agent_usage_panel (feature 9)

Spec: `specs/feature_agent_usage_panel/{requirements,design,tasks}.md` — 45 requirements (R1–R45),
18 tasks (T1–T18). Every R<n> is mapped to a test in design.md's test plan and to at least one task.

## Shape

- New `getFeatureAgentUsage(slug, name)` + types mirroring the backend structs.
- New presentational `app-agent-usage-section`, rendered inside `app-process-log-card` between the
  feature header and the sessions, only when the log state is `ok`.
- Dashboard: a second `switchMap` on the same (slug, feature) target stream (`shareReplay`), so log
  and usage requests are independent (a usage failure never hides the sessions).
- Formatters in a new `usage-format.ts` (reusable by F10): `1.2M` style compact tokens with exact
  values in `<data value>` + `title`; `4m 05s` durations with raw-seconds `title`.
- Visual direction written after loading `frontend-design:frontend-design`; memorable element is
  an "overlap strip" plus per-run interval tracks that make agent effort vs wall time visible.
  T2 makes the implementer load and follow that skill before writing UI code (per the human's request).

## Backend contract (verified in ../backend/src/harness/reader.rs and src/error.rs)

- `200 { runs: AgentRunNode[], totals }`; all keys always present. Per-run nullables: parentExternalId,
  role, label, model, spawnDepth, startedAt, finishedAt, durationSeconds, every tokens.* field.
  Totals are never null (0 / 0.0 when empty).
- Tree built server-side: runtime-keyed parent lookup, self-parent ignored, orphans at top level,
  cycles broken at the earliest run, every list in run order (`started_at NULLS LAST, id`).
- `spawnDepth` is the recorded depth, not tree position (an orphan at the root keeps depth > 0), so
  the UI indents by nesting and tags top-level runs with a non-null parent as `detached`.
- Errors: 401 `unauthorized`, 404 `not found` (project or feature, indistinguishable),
  500 `internal error` (also when the mirror lacks the `agent_runs` table).

## Deviations between backend spec and code

- `AgentRunDbRow` in the code has no `id` field (spec listed `id: i64`); the query still selects and
  orders by `id`. Internal only, no wire impact.
- `effortSeconds` uses `fold(0.0, ..)` instead of the spec's `.sum()`, to avoid serializing `-0.0`
  on empty input. Code is the correct one; consistent with backend R20.
- No other deviations found in keys, nullability, ordering or error codes.

## Open questions for the human

1. Indent by nesting + `detached` tag (chosen) vs. showing `spawnDepth` per row.
2. Per-run tokens show only `total`; the category breakdown is shown for totals only.
3. Run list capped at `lg:max-h-[40vh]` next to the sessions' `60vh`, both scrolling independently.
4. Backend open question still relevant: on a mirror without the `upsert_agent_run` RPC the panel
   will show "No agent runs recorded" for every feature (indistinguishable server-side).

## Implementer notes

- `dashboard-page.component.spec.ts` uses `httpTesting.verify()`; existing feature-selecting tests
  need an added `expectOne(usageUrl(...))` only (design.md § "Test preservation").
