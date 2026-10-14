# impl — project_selector (feature 5, sdd=0)

## Outcome

Implemented. `./init.sh` is green: lint, prettier check, build, and 41/41 Karma specs. The specs grew from 31 to 41: 3 service specs and 7 new dashboard specs, with the existing dashboard specs ported to the routed setup. Nothing is committed and I have not logged out. The session waits for review.

## Files changed

- `package.json`, `package-lock.json`: added `@angular/cdk` `^22.1.8`. It was already on the architecture allowlist but not installed.
- `src/styles.css`: imports `@angular/cdk/overlay-prebuilt.css`. This is structural overlay positioning CSS only, not a theme.
- `src/app/core/harness-api.service.ts`: `getState()` is replaced by `listProjects()` (`GET /api/harness/projects`) and `getProjectState(slug)` (`GET /api/harness/projects/{slug}/state`, with the slug URI-encoded). It also gains the `ProjectSummary` type `{slug, description, counts:{total, done, inProgress, blocked}}`, matching backend `reader.rs`.
- `src/app/core/harness-api.service.spec.ts` (new).
- `src/app/app.routes.ts`: the dashboard route (authGuard) now has componentless children `''` and `projects/:slug`. The dashboard instance therefore survives switching projects, and the project list is fetched once.
- `src/app/dashboard/project-selector.component.ts` (new).
- `src/app/dashboard/dashboard-page.component.ts`: hosts the selector, reads the slug from the child route on `NavigationEnd`, and uses `switchMap` so a stale request is cancelled. It also handles the redirect, localStorage, and the inline loading, 404, error and empty states, plus the mobile header.
- `src/app/dashboard/features-table.component.ts`: below `sm`, the title wraps onto a second line under the name.
- `src/app/dashboard/dashboard-page.component.spec.ts`: moved to `RouterTestingHarness` using the real `routes` structure. The routes are eager-mapped so the specs avoid lazy imports.
- `docs/architecture.md`: the Data and Data Flow sections now name the new endpoints instead of the removed `/api/harness/state`.

## Acceptance → evidence

1. **Selector lists every project with slug and counts.** The top-bar slug is now a `button[data-selector-trigger]` that opens the listbox. Each option shows the slug, `done/total done`, the description, a proportional done/in-progress/blocked bar, and "N in progress" / "N blocked" when nonzero. Spec: `project selector › turns the top-bar slug into a listbox trigger listing every project with its counts`.
2. **The `/projects/:slug` route and the `/` redirect.** The route loads `/api/harness/projects/:slug/state`. A slug is stored under localStorage key `harness.lastProject` only after its state loads successfully. `/` redirects with `replaceUrl` to the remembered slug when it is still in the list, otherwise to the first project. Specs: `default route › redirects / to the first project…`, `…to the last selected project from localStorage`, and `…falls back to the first project when the remembered one no longer exists`. The keyboard spec also asserts the localStorage write.
3. **CDK, keyboard access, tokens, mono slugs.** The panel is a `cdkConnectedOverlay` and the list is `cdkListbox`/`cdkOption` from `@angular/cdk/listbox`. Keyboard support:
   - ArrowDown on the trigger opens it and focus moves into the listbox.
   - Arrow keys, Home/End and typeahead come from CDK.
   - Enter or Space selects.
   - Escape and Tab close it and return focus to the trigger.
   - Enter on the current project just closes it.

   Only `tailwind.config.js` tokens are used. Slugs are `font-mono`, and the spec checks the computed font is IBM Plex Mono. The `frontend-design` skill was invoked before any markup (see Visual decisions below). Specs: `is fully keyboard operable…` and `closes on Escape, or on Enter over the current project…`.
4. **404.** The page shows an inline `[404]` alert, "No project named `<slug>` in the mirror.", with a **Choose another project** button. The button opens the selector with focus in the list. The features table and aside are hidden, and the slug is not remembered. Spec: `unknown project › shows an inline 404 with a way back to the selector…`. It walks the full path back to a valid project.
5. **Inline loading and error states.**
   - Loading: a `role=status` row shows "Loading `<slug>`…", or "Loading projects…" on `/`.
   - Project-list failure: a `[ERR]` alert on the page and another inside the panel.
   - Empty mirror: an inline empty state.
   - Non-404 state errors: the existing `[ERR]` banner.

   Specs: `navigates between projects by clicking an option and shows an inline loading state meanwhile`, `surfaces a project-list failure inline…`, `shows an inline empty state…`, and `surfaces an inline [ERR] banner…`.
6. **360px.** Spec: `phone width › renders the dashboard and the open selector at 360px with no horizontal scroll`. It clones the rendered page and the open panel into a 360px iframe that carries the app's compiled CSS, so the media queries really evaluate at 360. It then asserts:
   - no document scroll
   - every header element stays inside 360
   - feature rows do not overflow
   - the panel is at most 328px wide

   I confirmed the spec has teeth: with the old nowrap row layout restored it fails, with 443px > 360px.
7. **HttpTestingController specs.** The project list, navigation between projects (keyboard and click) and the 404 case are each covered above.

## Visual decisions (frontend-design)

- **Trigger.** It keeps the reference's quiet `HARNESS · slug` look: mono `text-xs text-muted`, plus a small `chevrons-up-down` lucide icon. The border shows only on hover, focus-visible (signal colour) or while open. It truncates at 11rem on phones.
- **Panel.** `bg-panel-raised`, `border-line`, `shadow-card`, 6px radius, with the same `fade-in` (motion-reduce off) the logout overlay uses. Its header is the mono uppercase `text-label` instrument caption "Projects" with the count. Width is `min(22rem, 100vw - 2rem)`.
- **The one bold element.** A 3px proportional bar per project in the lifecycle colours: status-done, signal (in progress) and status-blocked, so the list reads as a fleet health strip. Everything else stays quiet.
- **Current and active options.** The current project carries a 2px signal left rule, echoing the blocked-card rule. The keyboard-active option gets `bg-edge`, and hover gets `bg-row-hover`.
- **Fonts.** Descriptions are API free text, so they render `font-sans` per the conventions. Slugs, counts and ratios are `font-mono`.
- **Phones.** Below `sm`, the agent indicator text and the "Log out" label become `sr-only`; the dot and icon stay, and screen readers still announce the text. Feature rows put the title on a second line, aligned under the name.

## Deviations / notes

- The bar segment widths use `[style.width.%]`. A data-driven proportion cannot be a static Tailwind class; this is the only inline style.
- On options, static `role="option"`, `tabindex="-1"` and `aria-selected="false"` are written in the template to satisfy angular-eslint's a11y rules, which cannot see CDK host bindings. `CdkOption`'s host bindings override them at runtime, and the spec asserts the live `aria-selected` values.
- I could not do the manual smoke test (verification Level 3): the Chrome extension was unreachable, and it would need a real Supabase login. The behaviour is covered by the TestBed specs above.
- `init.sh` warnings, neither caused by this feature:
  - `[WARN] No tests/ directory; fingerprint lint skipped`
  - `[WARN] cannot reach http://localhost:3001 — skipping mirror sync`. This shows on later runs; the first run synced successfully.

## Revision 1 — response to review (changes_requested on session 14)

`./init.sh` is green again: lint, build, 43/43 Karma.

1. **Required: the panel overflowed at 360px.** Fixed in `project-selector.component.ts`. The overlay now sets `[cdkConnectedOverlayPush]="true"`, which works with the existing 16px viewport margin. It also has end-aligned fallback positions (`originX/overlayX: 'end'`) below and above the trigger.
2. **Required: the spec now measures the real overlay.** New `src/app/dashboard/project-selector.component.spec.ts`, spec `ProjectSelectorComponent in a 360px viewport › keeps the real CDK overlay panel inside the viewport`:
   - TestBed's `DOCUMENT` is a 360px-wide iframe that carries the app's compiled CSS. The real dashboard renders there through `RouterTestingHarness`. CDK's `OverlayContainer` and `ViewportRuler` then measure the iframe's window, `innerWidth === 360` (asserted).
   - Only the HTTP boundary and the Supabase client are stubbed.
   - It opens the selector and asserts on the real `.cdk-overlay-container [data-selector-panel]`: `getBoundingClientRect().left >= 0`, `right <= 360`, width > 250, and no document scroll.
   - Before fix 1 it failed with `Expected 439.42 to be less than or equal 360`, matching the reviewer's live 440. The old clone-based panel assertion is removed from the dashboard spec. That spec, `phone width › renders the dashboard at 360px…`, now covers the page layout only.
3. **Minor: in-app navigation to `/` showed an empty table.** The slug stream now calls `redirectToDefault` when the slug becomes `null` and the project list is already loaded. New spec `default route › redirects an in-app navigation back to / once the dashboard is already loaded`. It fails if that call is removed (checked, then restored).
4. **Minor: raw pixel text sizes.** I added the `tag` font-size token (`0.625rem`, line-height `1rem`) to `tailwind.config.js`. The `[ERR]`/`[404]` tags use `text-tag`. The 404 button, and the logout button with the same value, use the existing `text-2xs` token (0.71875rem = 11.5px). No `text-[Npx]` remains in `src/app/dashboard/`. The login page's raw sizes are outside this feature and left alone.

Files touched in this revision:
- `src/app/dashboard/project-selector.component.ts`
- `src/app/dashboard/project-selector.component.spec.ts` (new)
- `src/app/dashboard/dashboard-page.component.ts`
- `src/app/dashboard/dashboard-page.component.spec.ts`
- `tailwind.config.js`

`init.sh` warning: `[WARN] No tests/ directory; fingerprint lint skipped` (pre-existing).

## Revision 2 — response to round-2 review

`./init.sh` is green: lint, build, 43/43 Karma.

1. **Required: false empty states when the project list fails.** Fixed in `dashboard-page.component.ts`. A new computed `showsProject = slug() !== null && notFound() === null` gates both the features table and the `<aside>`. When there is no slug — list failure, list loading, or an empty mirror — only the banner or state message for that case renders. The 404 case is unchanged.
2. **Required: spec.** `default route › surfaces a project-list failure inline…` now also asserts:
   - `app-features-table` and `aside` are absent
   - none of "Nothing queued yet", "No agent session open." or "Nothing blocked." appear

   With the old `!notFound()` gating restored, it fails on all five assertions (checked, then restored).
3. **Minor: 16px viewport margin at 360px.** `cdkConnectedOverlayPush` is removed. CDK's push compares overflow against the margin-reduced viewport width without the left offset, which is why the panel landed at `left 0`.
   - On viewports narrower than 352px + 2×16px, the selector now opens with start-aligned positions whose `offsetX = 16 - triggerLeft`. The width comes from the iframe's or the window's `innerWidth` via the injected `DOCUMENT`, so the panel sits exactly in the 16px gutter.
   - Wider viewports keep the start/end fallback positions.
   - The real-overlay spec now asserts `left === 16` and `right === 344`. Without the phone positions it fails (`-97.875` / `230.125`).
4. **Minor: the in-panel error now wraps.** The message span has `min-w-0 break-words`. The list-failure spec asserts the class and the computed `overflow-wrap: break-word`, and it fails without the change.

Files touched in this revision:
- `src/app/dashboard/dashboard-page.component.ts`
- `src/app/dashboard/dashboard-page.component.spec.ts`
- `src/app/dashboard/project-selector.component.ts`
- `src/app/dashboard/project-selector.component.spec.ts`

`init.sh` warnings, both environmental:
- `[WARN] No tests/ directory; fingerprint lint skipped`
- `[WARN] cannot reach http://localhost:3001 — skipping mirror sync`
