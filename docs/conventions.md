# Code Conventions

> Extreme homogeneity. Agents predict better when the codebase looks like
> itself throughout.

## Language/Style

- **Language & version:** TypeScript 5.x (Angular, standalone components, in `frontend/`) and Rust
  (stable toolchain, 2021 edition, Axum, in `backend/`). See `docs/architecture.md` for why this
  split exists.
- **Formatter/linter:**
  - Frontend: ESLint (`typescript-eslint` recommended rules + `angular-eslint`'s recommended
    rules) + Prettier for formatting. Exact commands (run from the repo root):
    - `npm --prefix frontend run lint` — `ng lint` (`eslint` under the hood via
      `angular-eslint`'s builder).
    - `npm --prefix frontend run format` — `prettier --write .`.
  - Backend: `rustfmt` for formatting, `clippy` for linting. Exact commands (run from the repo
    root):
    - `cargo fmt --manifest-path backend/Cargo.toml --check`.
    - `cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings`.
- **Line length / formatting rules:**
  - Frontend: Prettier defaults except `printWidth: 100`; `singleQuote: true`; `semi: true`;
    `trailingComma: "all"`.
  - Backend: `rustfmt` defaults (no custom `rustfmt.toml` unless a specific rule is needed later).

## Names

### Frontend (Angular)

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

### Backend (Rust)

| Construct | Convention | Example |
|---|---|---|
| Modules/files | `snake_case.rs` | `auth/middleware.rs` |
| Types/structs/enums/traits | `PascalCase` | `struct HarnessStateResponse`, `enum ApiError` |
| Functions/variables | `snake_case` | `verify_supabase_jwt`, `read_harness_state` |
| Constants | `UPPER_SNAKE_CASE` | `const DEFAULT_PORT: u16 = 4000;` |
| Env vars | `UPPER_SNAKE_CASE` | `DATABASE_URL`, `SUPABASE_JWT_SECRET` |

## File Structure

No license header or file-level docstring boilerplate.

- Frontend: standalone Angular components only — no `NgModule`-based feature modules. Import
  ordering: external packages first, then internal imports (relative), with a single blank line
  separating the two groups. No default exports — Angular convention is named class exports
  throughout.
- Backend: no default trait impls left unimplemented with `todo!()`/`unimplemented!()` committed.
  Import ordering follows `rustfmt`'s default grouping (std, external crates, `crate::` — separated
  automatically by `rustfmt`, not hand-maintained).

## Tests

- **Test file location/naming:**
  - Frontend: co-located `*.spec.ts` next to the file it tests (Angular CLI default), e.g.
    `frontend/src/app/auth/login-page.component.spec.ts` tests
    `frontend/src/app/auth/login-page.component.ts`.
  - Backend: integration tests in `backend/tests/`, one file per route group, named
    `<area>.rs` (e.g. `backend/tests/harness.rs` tests `backend/src/harness/`); unit tests for
    pure functions (e.g. JWT parsing helpers) live in a `#[cfg(test)] mod tests` block in the same
    file as the code they test, per Rust convention.
- **Test framework:**
  - Frontend: Karma + Jasmine (Angular CLI default), run via `ng test --watch=false --browsers=ChromeHeadless`.
  - Backend: Rust's built-in `#[tokio::test]` async test harness; `sqlx::test` for tests that need
    a throwaway Postgres schema (it provisions and migrates a fresh test database per test run).
- **Fixture/isolation convention:**
  - Backend: every test that touches Postgres uses `sqlx::test`, which points at a dedicated test
    database (via `DATABASE_URL` resolved by `sqlx`'s test harness) and runs `backend/migrations/`
    against it — tests must never point at a real Supabase-hosted database, mirroring the general
    harness convention of never touching real project data from a test.
  - Frontend: stub the network boundary only — `HttpTestingController` (Angular's built-in HTTP
    testing module) for backend calls, and a hand-written fake/spy for the Supabase client (never a
    real network call to Supabase in a test). No `msw` or other network-mocking library — see the
    dependency allowlist in `docs/architecture.md`.

## Error Handling

See `docs/architecture.md`'s "Error handling" principle: backend errors are a JSON
`{ "error": "<message>" }` envelope with an appropriate HTTP status code, formatted by a single
`IntoResponse` error type; frontend errors surface via a visible inline message on every
`HttpClient` call's error path. No silent catch-and-ignore on either side.

## Comments

By default, comments are **not** written. They are only allowed when they
explain a non-obvious *why* (a documented workaround, a subtle invariant).
Well-named identifiers should do the rest.
