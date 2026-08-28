# Code Conventions

> Extreme homogeneity. Agents predict better when the codebase looks like
> itself throughout.

> **Scope note.** The Rust half of what used to be a two-stack conventions document. The Angular
> naming tables, ESLint/Prettier commands and `HttpTestingController` fixture rules now live in the
> sibling frontend project's own `docs/conventions.md`. The "Comments" section and the homogeneity
> principle above are deliberately identical in both — they are process conventions, not stack ones.

## Language/Style

- **Language & version:** Rust (stable toolchain, 2021 edition, Axum). See `docs/architecture.md`
  for why this stack was chosen. The declared floor is `rust-version` in `Cargo.toml`; edition 2024
  is deliberately not adopted (see `specs/upgrade_rust_toolchain/design.md`).
- **Formatter/linter:** `rustfmt` for formatting, `clippy` for linting. Exact commands (run from
  this project's root):
  - `cargo fmt --check`.
  - `cargo clippy --all-targets -- -D warnings`.
- **Line length / formatting rules:** `rustfmt` defaults (no custom `rustfmt.toml` unless a specific
  rule is needed later).

## Names

| Construct | Convention | Example |
|---|---|---|
| Modules/files | `snake_case.rs` | `auth/middleware.rs` |
| Types/structs/enums/traits | `PascalCase` | `struct HarnessStateResponse`, `enum ApiError` |
| Functions/variables | `snake_case` | `verify_supabase_jwt`, `read_harness_state` |
| Constants | `UPPER_SNAKE_CASE` | `const DEFAULT_PORT: u16 = 4000;` |
| Env vars | `UPPER_SNAKE_CASE` | `DATABASE_URL`, `SUPABASE_JWT_SECRET` |

## File Structure

No license header or file-level docstring boilerplate.

No default trait impls left unimplemented with `todo!()`/`unimplemented!()` committed. Import
ordering follows `rustfmt`'s default grouping (std, external crates, `crate::` — separated
automatically by `rustfmt`, not hand-maintained).

## Tests

- **Test file location/naming:** integration tests in `tests/`, one file per route group, named
  `<area>.rs` (e.g. `tests/harness.rs` tests `src/harness/`); unit tests for pure functions (e.g.
  JWT parsing helpers) live in a `#[cfg(test)] mod tests` block in the same file as the code they
  test, per Rust convention.
- **Test framework:** Rust's built-in `#[tokio::test]` async test harness; `sqlx::test` for tests
  that need a throwaway Postgres schema (it provisions and migrates a fresh test database per test
  run).
- **Fixture/isolation convention:** every test that touches Postgres uses `sqlx::test`, which points
  at a dedicated test database (via `DATABASE_URL` resolved by `sqlx`'s test harness) and runs
  `migrations/` against it — tests must never point at a real Supabase-hosted database, mirroring
  the general harness convention of never touching real project data from a test.

## Error Handling

See `docs/architecture.md`'s "Error handling" principle: errors are a JSON
`{ "error": "<message>" }` envelope with an appropriate HTTP status code, formatted by a single
`IntoResponse` error type. No silent catch-and-ignore.

## Comments

By default, comments are **not** written. They are only allowed when they
explain a non-obvious *why* (a documented workaround, a subtle invariant).
Well-named identifiers should do the rest.
