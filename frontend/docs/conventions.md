# Code Conventions

> Extreme homogeneity. Agents predict better when the codebase looks like
> itself throughout.

> **Scope note.** The Angular half of what used to be a two-stack conventions document. The Rust
> naming tables, `rustfmt`/`clippy` commands and `sqlx::test` fixture rules now live in the sibling
> backend project's own `docs/conventions.md`. The "Comments" section and the homogeneity principle
> above are deliberately identical in both — they are process conventions, not stack ones.

## Language/Style

- **Language & version:** TypeScript 5.x (Angular, standalone components). See
  `docs/architecture.md` for why this stack was chosen.
- **Formatter/linter:** ESLint (`typescript-eslint` recommended rules + `angular-eslint`'s
  recommended rules) + Prettier for formatting. Exact commands (run from this project's root):
  - `npm run lint` — `ng lint` (`eslint` under the hood via `angular-eslint`'s builder).
  - `npm run format` — `prettier --write .`.
- **Line length / formatting rules:** Prettier defaults except `printWidth: 100`;
  `singleQuote: true`; `semi: true`; `trailingComma: "all"`.

## Visual Design

**Always invoke the `frontend-design` skill (Claude Code) before writing or reshaping any markup or
styles under `src/app/auth/` or `src/app/dashboard/`.** This is non-negotiable, not advisory: per
`docs/architecture.md`'s Principle 5 and its "What NOT to do" list, a default or generic layout is
a rejected review, not a style nitpick. The skill applies every time these directories are touched
— new components, restyling existing ones, and material visual tweaks alike — not only at first
creation, and it is invoked **before** the design has settled, not retroactively to justify one.

- **Tailwind:** utility classes directly in templates are the default. Reach for a component-scoped
  `@apply` rule (in that component's own `.css` file) only when the same utility cluster repeats
  three or more times within one component — never a global `@apply`-based class sheet, and never
  hand-written CSS that duplicates what a utility class already does. `tailwind.config.js` lives at
  the project root; any design token (color, spacing, font size) used more than once belongs in its
  `theme.extend`, not copy-pasted as a raw utility value (e.g. `text-[#1a2b3c]`).
- **CDK:** import only the specific CDK module a component needs (`OverlayModule`, `A11yModule`,
  etc.) — never a blanket import. `@angular/cdk` provides behavior only; it must never be the source
  of a component's visible styling (no un-overridden CDK theme classes in markup).
- **Icons:** `lucide-angular`, registered per-component via `LucideAngularModule.pick({ IconName })`
  — never the whole icon set — and rendered with `<lucide-icon name="icon-name" />`. Size/color via
  Tailwind classes (`class="h-4 w-4 text-current"`), not the library's own styling props.
- **Fonts:** a deliberate two-face pairing, both Plex-family siblings — `@fontsource/ibm-plex-sans`
  for UI chrome (headings, labels, buttons, prose) via Tailwind's `font-sans`, and
  `@fontsource/ibm-plex-mono` for anything that is literally a harness data value — feature names,
  agent identities, timestamps, session ids, status labels — via Tailwind's `font-mono`. Both CSS
  imports live once, in `src/styles.css`; never a per-component `@font-face` and never a `<link>` in
  `index.html`. A value read straight from `HarnessApiService`'s response renders in `font-mono`; UI
  copy the frontend itself wrote (labels, button text, error prose) renders in `font-sans` — that
  split is the rule, not a hardcoded `font-family` per element.

## Names

| Construct | Convention | Example |
|---|---|---|
| Component files | `kebab-case.component.ts` | `login-page.component.ts` |
| Service files | `kebab-case.service.ts` | `harness-api.service.ts` |
| Guard files | `kebab-case.guard.ts` | `auth.guard.ts` |
| Non-component/service modules | `kebab-case.ts` | `supabase-client.ts` |
| Components/Services/Guards (class or const) | `PascalCase` (classes) / `camelCase` (functional
  guards/interceptors) | `class LoginPageComponent`, `authGuard`, `authInterceptor` |
| Functions/variables | `camelCase` | `fetchHarnessState`, `isAuthenticated` |
| Types/interfaces | `PascalCase` | `interface HarnessState` |
| Constants (module-level, fixed) | `UPPER_SNAKE_CASE` | `const AUTH_STORAGE_KEY = "sb-session"` |

This follows the official Angular style guide's file-naming convention (`<name>.<type>.ts`), chosen
for the same "most agents have already seen it" reason `docs/architecture.md` cites for picking
Angular's own CLI/toolchain in the first place.

## File Structure

No license header or file-level docstring boilerplate.

Standalone Angular components only — no `NgModule`-based feature modules. Import ordering: external
packages first, then internal imports (relative), with a single blank line separating the two
groups. No default exports — Angular convention is named class exports throughout.

## Tests

- **Test file location/naming:** co-located `*.spec.ts` next to the file it tests (Angular CLI
  default), e.g. `src/app/auth/login-page.component.spec.ts` tests
  `src/app/auth/login-page.component.ts`.
- **Test framework:** Karma + Jasmine (Angular CLI default), run via
  `ng test --watch=false --browsers=ChromeHeadless`.
- **Fixture/isolation convention:** stub the network boundary only — `HttpTestingController`
  (Angular's built-in HTTP testing module) for backend calls, and a hand-written fake/spy for the
  Supabase client (never a real network call to Supabase in a test). No `msw` or other
  network-mocking library — see the dependency allowlist in `docs/architecture.md`.

## Error Handling

See `docs/architecture.md`'s "Error handling" principle: errors surface via a visible inline message
on every `HttpClient` call's error path. No silent catch-and-ignore.

## Comments

By default, comments are **not** written. They are only allowed when they
explain a non-obvious *why* (a documented workaround, a subtle invariant).
Well-named identifiers should do the rest.
