# Requirements — upgrade_angular_latest

Context: `frontend/package.json` currently pins Angular `~18.2.0` across `@angular/core`, `common`,
`forms`, `platform-browser`, `platform-browser-dynamic`, `router`, `cli`, `compiler`, `compiler-cli`,
with `angular-eslint ^18.3.0`, `typescript ~5.4.5`, and a legacy `.eslintrc.json`. Angular v22 is the
current latest stable major (June 2026, active support through Dec 2026, LTS through May 2028); v21
(Nov 2025) is the prior major, LTS through May 2027. The approach is an incremental,
major-by-major upgrade (18→19→20→21→22) via `ng update`, never a direct 18→22 jump — see
`design.md` for why a direct jump is rejected. Each intermediate major is a checkpoint: the frontend
must build/lint/test green before proceeding to the next major. `angular-eslint`'s own major
releases track Angular's majors 1:1 (angular-eslint 19.x pairs with Angular 19, etc.), so every
requirement below that pins an Angular major also pins the paired `angular-eslint` major.

## R1
The system SHALL have `frontend/package.json`'s `@angular/core`, `@angular/common`,
`@angular/forms`, `@angular/platform-browser`, `@angular/platform-browser-dynamic`,
`@angular/router`, `@angular/cli`, `@angular/compiler`, `@angular/compiler-cli`, and
`angular-eslint` all at major version 19 (`^19.x`) as the first intermediate step.

## R2
WHEN `frontend/`'s dependencies satisfy R1, the system SHALL pass `.harness.json`'s frontend
verify-command slice (`npm --prefix frontend run lint && npm --prefix frontend run build && npm
--prefix frontend run test -- --watch=false --browsers=ChromeHeadless`) with exit code 0 before the
upgrade proceeds to Angular v20.

## R3
The system SHALL have `frontend/package.json`'s `@angular/core`, `@angular/common`,
`@angular/forms`, `@angular/platform-browser`, `@angular/platform-browser-dynamic`,
`@angular/router`, `@angular/cli`, `@angular/compiler`, `@angular/compiler-cli`, and
`angular-eslint` all at major version 20 (`^20.x`).

## R4
WHEN `frontend/`'s dependencies satisfy R3, the system SHALL pass `.harness.json`'s frontend
verify-command slice (as defined in R2) with exit code 0 before the upgrade proceeds to Angular v21.

## R5
The system SHALL have `frontend/package.json`'s `@angular/core`, `@angular/common`,
`@angular/forms`, `@angular/platform-browser`, `@angular/platform-browser-dynamic`,
`@angular/router`, `@angular/cli`, `@angular/compiler`, `@angular/compiler-cli`, and
`angular-eslint` all at major version 21 (`^21.x`).

## R6
WHEN `frontend/`'s dependencies satisfy R5, the system SHALL pass `.harness.json`'s frontend
verify-command slice (as defined in R2) with exit code 0 before the upgrade proceeds to Angular v22.

## R7
The system SHALL have `frontend/package.json`'s `@angular/core`, `@angular/common`,
`@angular/forms`, `@angular/platform-browser`, `@angular/platform-browser-dynamic`,
`@angular/router`, `@angular/cli`, `@angular/compiler`, `@angular/compiler-cli`, and
`angular-eslint` all at major version 22 (`^22.x`).

## R8
WHEN `frontend/`'s dependencies satisfy R7, the system SHALL pass `.harness.json`'s full
`verify_command` (both the `frontend/` and `backend/` portions) with exit code 0.

## R9
IF `angular-eslint`'s installed major version drops support for the legacy `.eslintrc.json` format
(true starting at `angular-eslint` v22, per its published breaking-change notes) THEN the system
SHALL replace `frontend/.eslintrc.json` with a flat `frontend/eslint.config.js` that preserves the
existing `@angular-eslint/directive-selector` and `@angular-eslint/component-selector` rules
(prefix `app`), the `@typescript-eslint/no-unused-vars` rule with `argsIgnorePattern: "^_"`, and the
`*.spec.ts`-scoped `@typescript-eslint/no-explicit-any: "off"` override, and `npm --prefix frontend
run lint` SHALL exit 0 against that new config.

## R10
WHILE the frontend continues to use ZoneJS-based change detection (no migration to zoneless change
detection is in scope of this feature — see `design.md`), the system SHALL retain an explicit
`provideZoneChangeDetection({ eventCoalescing: true })` call in
`frontend/src/app/app.config.ts` once the upgrade reaches Angular v21 or later (Angular v21 stops
supplying a default ZoneJS change-detection scheduler when this provider is absent).

## R11
The system SHALL have `frontend/package.json`'s `typescript` devDependency at a version satisfying
Angular v22's minimum supported TypeScript range (`>=6.0.0`) once R7/R8 are satisfied.
