---
session_id: 4
feature: upgrade_angular_latest
agent: leader -> spec_author (claude-sonnet-5)
started_at: 2026-08-27T06:14:33.000Z
closed_at: 2026-08-27T06:21:46.000Z
---

## Plan
- Read AGENTS.md/docs/specs.md/docs/architecture.md/docs/conventions.md and feature 1 reference spec
- Verify current frontend/package.json Angular pin (18.2.0) and research Angular 19/20/21/22 breaking changes via web research
- Write specs/upgrade_angular_latest/requirements.md in EARS format
- Write specs/upgrade_angular_latest/design.md with file-by-file upgrade plan, discarded alternatives
- Write specs/upgrade_angular_latest/tasks.md with ordered T<n> tasks tagged to R<n>
- Run mark-spec-ready

## Log
- Read AGENTS.md, docs/specs.md, docs/architecture.md, docs/conventions.md, docs/verification.md, and specs/scaffold_frontend_stack/* as style reference. Confirmed frontend/package.json currently pins Angular ~18.2.0 (core/common/forms/platform-browser/platform-browser-dynamic/router/cli/compiler/compiler-cli) with angular-eslint ^18.3.0, typescript ~5.4.5, zone.js ~0.14.10, eslint ^8.57.0 (flat-config-incompatible old major). Starting research on Angular 19/20/21/22 breaking changes.
- Researched Angular 19/20/21/22 breaking changes via angular/angular's raw CHANGELOG.md and angular.dev/reference/versions compatibility table (fetched directly via curl, not guessed). Also fetched angular-eslint's CHANGELOG.md confirming v22 drops ESLint v8 / legacy .eslintrc.json support. Grepped frontend/src for risky APIs (ComponentFactory, moduleId, provideRoutes, withFetch, HttpXhrBackend, afterRender, TestBed.flushEffects, TestBed.get(, | async) -- none found, confirming low collateral risk. Verified app.config.ts already imports ApplicationConfig from @angular/core and already calls provideZoneChangeDetection explicitly (both already-compliant with v21 breaking changes). Wrote requirements.md (R1-R11, EARS format), design.md (per-major breaking-change research, files touched, prerequisites/risks, 3 discarded alternatives: direct 18->22 jump, control-flow template migration, zoneless CD), tasks.md (T1-T13, ordered, each R<n> covered by at least one task).

## Next Step

## Verification


## Closure

