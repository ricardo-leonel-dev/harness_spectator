# Design — upgrade_angular_latest

Stack/layer decisions (Angular frontend, standalone components, Angular CLI toolchain) are recorded
in `docs/architecture.md` and unchanged by this feature — this is a dependency-version upgrade, not
a re-architecture. Naming/testing conventions are in `docs/conventions.md`, likewise unchanged. This
file only covers what's specific to moving `frontend/` from Angular 18 to Angular 22.

## Current state (verified against the live repo, not assumed)

- `frontend/package.json`: `@angular/{core,common,forms,platform-browser,platform-browser-dynamic,
  router,compiler,compiler-cli}` and `@angular/cli` all `^18.2.0`; `angular-eslint ^18.3.0`;
  `typescript ~5.4.5`; `eslint ^8.57.0`; `zone.js ~0.14.10`.
- `frontend/.eslintrc.json`: legacy (non-flat) ESLint config — `eslint:recommended` +
  `plugin:@typescript-eslint/recommended` + `plugin:@angular-eslint/recommended` +
  `plugin:@angular-eslint/template/process-inline-templates`/`recommended`, with custom
  `directive-selector`/`component-selector` (prefix `app`), `no-unused-vars` (`^_` ignore), and a
  `*.spec.ts` override disabling `no-explicit-any`.
- `frontend/angular.json`: already uses the modern esbuild-based `@angular-devkit/build-angular:
  application` builder and the `@angular-devkit/build-angular:karma` test builder — no builder
  migration needed (this was the main breaking change historically forced by `ng update` around
  Angular 17-18; this project already scaffolded past it in feature 1).
- All components are standalone (`standalone: true`) already, matching `docs/architecture.md`'s "no
  `NgModule`-based feature modules" rule — Angular 19's "standalone by default" change is a no-op
  for this codebase (the redundant `standalone: true` flags may be stripped by `ng update`'s
  migration schematic; that's cosmetic, not a functional change).
- All reactive component state is signal-based (`signal`/`computed` in `AuthService` and
  `DashboardPageComponent`; templates read via signal calls, e.g. `features()`, `loadError()`).
  This is exactly the pattern that keeps working correctly once Angular v22 flips the default
  `Component.changeDetection` to `OnPush` for components that don't specify it (signal reads inside
  a template register as reactive dependencies regardless of `OnPush`) — verified no component in
  this codebase relies on `Default` change detection's "any leaf mutation triggers a full check"
  behavior (no unguarded plain-field mutation feeding a template outside a signal).
- `app.config.ts` already imports `ApplicationConfig` from `@angular/core` (not
  `@angular/platform-browser`) and already calls `provideZoneChangeDetection({ eventCoalescing:
  true })` explicitly — both are already-compliant with Angular v21's breaking changes (the
  `@angular/platform-browser` `ApplicationConfig` re-export was removed in v21; the default ZoneJS
  scheduler provider was removed in v21), so no code change is needed there, only R10's regression
  guard that a future edit doesn't quietly drop the explicit provider call.
- No `main.server.ts`/SSR entry point exists in this project (browser-only SPA per
  `docs/architecture.md`), so Angular v21's `BootstrapContext` server-bootstrap breaking change does
  not apply.
- Grepped the entire `frontend/src` tree for other APIs that appear in the v19-v22 breaking-change
  lists (`ComponentFactory`/`ComponentFactoryResolver`, `moduleId`, `provideRoutes`, `withFetch`,
  `HttpXhrBackend`, `afterRender`, `TestBed.flushEffects`, `TestBed.get(`, `| async`) — none are
  used, so none of those specific remediations apply to this codebase.

## Per-major breaking-change research (from `angular/angular`'s `CHANGELOG.md` on GitHub and
`angular.dev/reference/versions`' compatibility table, both fetched directly, not guessed)

### 18 → 19 (`ng update @angular/core@19 @angular/cli@19 angular-eslint@19`)
- Directives/components/pipes are standalone by default (no-op here, see above).
- TypeScript < 5.5 no longer supported — current `~5.4.5` must bump to `~5.5.x` (or later, subject
  to the next major's ceiling) as part of this step's `ng update`, which updates the pin itself.
- `effect()` timing changes (developer preview at the time) — this app does not use `effect()`
  (only `signal`/`computed`), so not a concern.
- `ExperimentalPendingTasks` renamed `PendingTasks` — not used here.
- `TestBed`-driven tests now rethrow errors from `ApplicationRef.tick` instead of silently
  swallowing them — a latent bug in a spec that currently passes only because an error was
  swallowed would start failing here; R2's "verify slice green" check is exactly what would catch
  that.

### 19 → 20 (`ng update @angular/core@20 @angular/cli@20 angular-eslint@20`)
- TypeScript < 5.8 no longer supported — bump again.
- Node.js 18 and Node.js 22.0-22.10 are no longer supported (floor: Node ^20.11.1). Not a code
  change, but a real environment prerequisite — see "Prerequisites / risks" below.
- `ngIf`/`ngFor`/`ngSwitch` structural directives are deprecated (not removed) in favor of the
  `@if`/`@for`/`@switch` control-flow blocks. This codebase's remaining components still use
  `*ngIf`/`*ngFor` in a few templates (feature 1's scaffold predates this deprecation). Migrating
  them to the new block syntax is explicitly **out of scope** for this feature — see "Discarded
  alternatives" below.
- `AsyncPipe` now routes subscription/promise errors through `ErrorHandler` directly instead of via
  ZoneJS — this app does not use the `| async` pipe anywhere (verified above), so not a concern.
- `TestBed.flushEffects()` removed (use `TestBed.tick()`) — not used here.

### 20 → 21 (`ng update @angular/core@21 @angular/cli@21 angular-eslint@21`)
- TypeScript < 5.9 no longer supported — bump again.
- Node.js floor moves to `^20.19.0 || ^22.12.0 || ^24.0.0`.
- The default ZoneJS change-detection scheduler provider is removed; `provideZoneChangeDetection`
  must be called explicitly, or the app silently loses its scheduler. Already true in this codebase
  (see "Current state" above) — R10 guards against this regressing during the upgrade.
- `ApplicationConfig` re-export removed from `@angular/platform-browser` — already imports from
  `@angular/core` here (see "Current state" above).
- Server-side bootstrap signature change (`BootstrapContext`) — not applicable, no SSR entry point.
- `UpgradeAdapter` (AngularJS interop) removed — not used, this is a green-field Angular app.

### 21 → 22 (`ng update @angular/core@22 @angular/cli@22 angular-eslint@22`)
- TypeScript < 6.0 no longer supported — bump again; the currently-active compatibility range for
  Angular `22.0.x` is `>=6.0.0 <6.1.0` (R11).
- `angular-eslint` v22 drops ESLint v8 and the legacy `.eslintrc.json` format entirely — this is the
  forcing function for R9's flat-config migration. (Flat config has been optionally supported since
  `angular-eslint` v18, but there is no auto-migration schematic from legacy to flat config at any
  point in this history — per `angular-eslint`'s own changelog notes on v18/v19 — so it must be
  hand-authored once, at this step.)
- Components with `changeDetection` unspecified now default to `OnPush` (previously `Default`);
  `ng update`'s migration schematic inserts `ChangeDetectionStrategy.Eager` on components it
  determines still need `Default`-style detection. Low risk here (see "Current state": everything is
  already signal-driven), but the migration schematic runs regardless as part of `ng update`, and
  R6/R8's verify-green checks are what confirms it didn't misclassify anything in this codebase.
- `ComponentFactoryResolver`/`ComponentFactory` removed, `createNgModuleRef` removed,
  `ChangeDetectorRef.checkNoChanges` removed, Hammer.js integration removed, `provideRoutes()`
  removed — none used here (verified above).
- `HttpXhrBackend` becomes opt-in via `provideHttpClient(withXhr(...))` if upload-progress reporting
  is needed — this app's `HarnessApiService` only does `GET` requests, no upload progress, so no
  change needed to `frontend/src/app/core/harness-api.service.ts` or `app.config.ts`'s
  `provideHttpClient` call.
- Router's `paramsInheritanceStrategy` default changes to `'always'` — this app has no nested
  routes with params (`/login` and `''`, both leaf routes), so this is a no-op here.

## Files touched

```
frontend/package.json          # @angular/*, angular-eslint, typescript, eslint, zone.js version bumps
                                # each done via `ng update`, not hand-edited, per stage
frontend/package-lock.json      # regenerated by `ng update`/`npm install` each stage
frontend/angular.json           # only if `ng update`'s own schematics touch schema/option names;
                                 # not expected to change given the builder is already current
frontend/tsconfig.json          # `ng update`'s migration schematics may add/adjust
                                 # angularCompilerOptions flags (e.g. strictStandalone); typescript
                                 # target/lib stay ES2022 unless a schematic says otherwise
frontend/.eslintrc.json          # DELETED at the v22 step (R9)
frontend/eslint.config.js       # CREATED at the v22 step (R9) — flat config, same rule set
frontend/src/app/app.config.ts  # verified unchanged/compliant per stage (R10); only touched if a
                                 # migration schematic legitimately needs to change it
```

No other `frontend/src/` file is expected to require a manual code change, based on the "Current
state" grep above — `ng update`'s own schematics handle the mechanical migrations (standalone flag
cleanup, `ChangeDetectionStrategy.Eager` insertion where needed). Any additional file the
implementer finds necessary during a given stage (e.g. a schematic surfaces a real, previously-latent
type error) is still in scope — R2/R4/R6/R8's "verify green" requirement is the actual acceptance
bar per stage, not this file list.

## Prerequisites / risks (not code changes, but must be checked before/at the relevant stage)

- **Node.js floor per stage**: 19 needs `^18.19.1 || ^20.11.1 || ^22.0.0`; 20 needs `^20.11.1`
  (Node 18 and Node 22.0-22.10 unsupported); 21 needs `^20.19.0 || ^22.12.0 || ^24.0.0`; 22's
  actively-supported range (per `angular.dev/reference/versions`, checked at spec-drafting time) is
  `^22.22.3 || ^24.15.0 || ^26.0.0`. If the implementer's Node runtime doesn't satisfy a given
  stage's floor, `ng update` or the subsequent build will fail with a clear error — this is an
  environment precondition to check (`node --version`) before starting that stage, not a code
  change this spec's tasks can make. If blocked on this, follow `AGENTS.md` §6 (record the blocker,
  leave the feature `in_progress`) rather than force an unrelated environment change.
- **Each `ng update` runs Angular's own automated migration schematics** (not hand-written code) —
  the implementer must let them run (`ng update` does this by default) and must not skip a major to
  "save time"; skipping majors is exactly what the incremental approach avoids (see "Discarded
  alternatives").

## Discarded alternatives

- **Direct `ng update @angular/core@22 @angular/cli@22` jump instead of incremental
  18→19→20→21→22** — rejected. `ng update`'s own tooling and Angular's official update guide both
  only support updating one major at a time; jumping majors skips each version's automated migration
  schematics (e.g. v19's standalone-by-default migration, v21's `provideZoneChangeDetection`
  insertion, v22's `ChangeDetectionStrategy.Eager` insertion) and skips the incremental
  build/lint/test checkpoint (R2/R4/R6) that would otherwise isolate which major introduced a given
  regression. A direct jump trades a slower, well-instrumented path for a faster one with no
  intermediate signal about where something broke.
- **Migrating templates from `*ngIf`/`*ngFor`/`*ngSwitch` to the `@if`/`@for`/`@switch` control-flow
  blocks as part of this feature** — rejected for this feature's scope. The structural directives
  are deprecated starting at v20 but not removed by v22 (confirmed against the v20/v21/v22
  breaking-changes lists above — no removal notice for them), so the app keeps working unchanged
  without this migration. Bundling a template-syntax rewrite across every component into a
  dependency-version-bump feature would mix two different kinds of risk (framework-version
  compatibility vs. template-behavior regressions from a syntax rewrite) into one change; better
  tracked as its own follow-up feature with its own template-by-template regression testing.
- **Adopting zoneless change detection (`provideZonelessChangeDetection`, stable-ish as of v20)
  instead of keeping ZoneJS** — rejected for this feature's scope. Nothing in the v19-v22 breaking
  changes *requires* dropping ZoneJS (R10 exists specifically to keep the current ZoneJS-based setup
  correct across the upgrade), and switching schedulers is an application-wide change-detection
  behavior change that deserves its own dedicated testing pass, not a side effect of a version bump.
