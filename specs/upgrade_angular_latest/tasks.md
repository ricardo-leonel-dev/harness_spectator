# Tasks — upgrade_angular_latest

Ordered; check off `[x]` as completed. Do not skip a stage's verify-green task to save time — see
`design.md`'s "Discarded alternatives" for why the incremental path is required. See `design.md` for
the file list, per-major breaking-change research, and prerequisites/risks (Node.js floors) each
task below refers to.

## Baseline

- [x] T1 Confirm the pre-upgrade baseline is green: run `.harness.json`'s frontend verify-command
      slice (`npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix
      frontend run test -- --watch=false --browsers=ChromeHeadless`, with `CHROME_BIN` set) against
      the current Angular 18 state and confirm exit 0, so any later failure is attributable to the
      upgrade, not pre-existing breakage.

## Stage 1: Angular 18 → 19

- [x] T2 (R1) Check the local Node.js version against v19's floor (`^18.19.1 || ^20.11.1 ||
      ^22.0.0`, per `design.md`'s "Prerequisites / risks"); then run `npx ng update
      @angular/core@19 @angular/cli@19 angular-eslint@19` from `frontend/`, letting its automated
      migration schematics run (standalone-by-default cleanup, TypeScript floor bump to `~5.5.x`).
      Confirm `frontend/package.json`'s `@angular/*`/`angular-eslint` entries are all `^19.x`.
- [x] T3 (R2) Run the frontend verify-command slice (as in T1) against the resulting `frontend/`
      state; if it fails, fix the regression before proceeding to Stage 2 (do not carry a red build
      into the next `ng update`).

## Stage 2: Angular 19 → 20

- [x] T4 (R3) Check the local Node.js version against v20's floor (`^20.11.1`, and note Node
      22.0-22.10 are explicitly unsupported at this stage per `design.md`); then run `npx ng update
      @angular/core@20 @angular/cli@20 angular-eslint@20` from `frontend/`, letting its migration
      schematics run (TypeScript floor bump to `~5.8.x`). Confirm `frontend/package.json`'s
      `@angular/*`/`angular-eslint` entries are all `^20.x`.
- [x] T5 (R4) Run the frontend verify-command slice against the resulting `frontend/` state; if it
      fails, fix the regression before proceeding to Stage 3.

## Stage 3: Angular 20 → 21

- [x] T6 (R5) Check the local Node.js version against v21's floor (`^20.19.0 || ^22.12.0 ||
      ^24.0.0`); then run `npx ng update @angular/core@21 @angular/cli@21 angular-eslint@21` from
      `frontend/`, letting its migration schematics run (TypeScript floor bump to `~5.9.x`,
      `provideZoneChangeDetection` insertion if it were ever missing). Confirm
      `frontend/package.json`'s `@angular/*`/`angular-eslint` entries are all `^21.x`.
- [x] T7 (R6) Run the frontend verify-command slice against the resulting `frontend/` state; if it
      fails, fix the regression before proceeding to Stage 4.
- [x] T8 (R10) Confirm `frontend/src/app/app.config.ts` still calls
      `provideZoneChangeDetection({ eventCoalescing: true })` explicitly after this stage's
      migration schematics ran (grep the file); if a schematic removed it, restore it.

## Stage 4: Angular 21 → 22 (final)

- [x] T9 (R7) Check the local Node.js version against v22's actively-supported floor (`^22.22.3 ||
      ^24.15.0 || ^26.0.0`, per `design.md`); then run `npx ng update @angular/core@22
      @angular/cli@22 angular-eslint@22` from `frontend/`, letting its migration schematics run
      (TypeScript floor bump to `>=6.0.0 <6.1.0`, `ChangeDetectionStrategy.Eager` insertion where
      the schematic determines it's needed). Confirm `frontend/package.json`'s
      `@angular/*`/`angular-eslint` entries are all `^22.x`.
- [x] T10 (R11) Confirm `frontend/package.json`'s `typescript` devDependency satisfies `>=6.0.0`
      after T9's `ng update` (it updates the pin itself; this task is the explicit check).
- [x] T11 (R9) Delete `frontend/.eslintrc.json` and create `frontend/eslint.config.js` (flat
      config) using `angular-eslint`'s recommended flat-config setup, re-adding the existing custom
      rules: `@angular-eslint/directive-selector`/`@angular-eslint/component-selector` (prefix
      `app`, `camelCase`/`kebab-case` as before), `@typescript-eslint/no-unused-vars` with
      `argsIgnorePattern: "^_"`, and the `*.spec.ts`-scoped `@typescript-eslint/no-explicit-any:
      "off"` override. Run `npm --prefix frontend run lint` and confirm exit 0.
- [x] T12 (R8) Run `.harness.json`'s full `verify_command` (frontend **and** backend portions) and
      confirm exit 0 — this is the feature's final acceptance check, run via `./init.sh`.

## Closing

- [x] T13 Run `./init.sh` one more time end-to-end and confirm `[OK] Environment ready`; if
      anything is red, do not close the session as `done` — follow `AGENTS.md` §6/§8 (record the
      blocker via `append-log`/`set-next-step`, or `block` the feature if it depends on an
      environment change outside this feature's scope, e.g. an unmet Node.js floor).