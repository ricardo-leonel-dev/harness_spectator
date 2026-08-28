# Tasks — scaffold_frontend_stack (backend half)

Ordered; check off `[x]` as completed. See `design.md` for the file layout/signatures each task
below refers to, and `docs/architecture.md`/`docs/conventions.md` for the stack/style decisions
already made.

> **Scope note.** Renumbered `T1`-`T8` from the original cross-stack task list (old `T1`-`T7` plus
> the closing `T15`). The frontend's seven scaffolding tasks live in the frontend project's own
> `specs/scaffold_frontend_stack/tasks.md`.

- [x] T1 (R1, R2) Scaffold the crate (`Cargo.toml` per the dependency allowlist in
      `docs/architecture.md`, `.env.example`); add `src/config.rs` (`Config::from_env`,
      reading `PORT`, `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `FRONTEND_ORIGIN`) and
      `src/main.rs` that builds a `sqlx::PgPool` from `DATABASE_URL`, calls `build_app`,
      and starts the HTTP server on `config.port`.
- [x] T2 (R4) Add `migrations/0001_harness_schema.sql` (`projects`, `features`,
      `session_log` tables) using only Supabase-portable Postgres features — no local-only
      extensions.
- [x] T3 (R1, R3) Add `src/error.rs` (`ApiError` + `IntoResponse` impl, JSON
      `{ "error": ... }` envelope) and `src/app.rs`'s `build_app(pool, config)` wiring the
      `tower-http` CORS layer (origin = `config.frontend_origin`) and a `tracing` layer.
- [x] T4 (R7, R8) Add `src/auth/jwt.rs`'s `verify_supabase_jwt` (HS256 verification
      against `SUPABASE_JWT_SECRET`, checking `exp` and `aud == "authenticated"`) and
      `src/auth/extractor.rs`'s `SupabaseUser` (`FromRequestParts` extracting the
      `Authorization: Bearer` header and calling `verify_supabase_jwt`).
- [x] T5 (R6) Ensure `SupabaseUser`'s extraction failure path (missing `Authorization` header)
      returns `ApiError::Unauthorized` (401 JSON `{ "error": "unauthorized" }`) before any route
      handler runs.
- [x] T6 (R2, R3, R5) Add `src/harness/reader.rs`'s `read_harness_state` (SELECT-only
      `sqlx` queries against `projects`/`features`/`session_log` per the schema in T2) and
      `src/harness/router.rs`'s `GET /api/harness/state` handler, requiring the
      `SupabaseUser` extractor.
- [x] T7 (R3, R5, R6, R7, R8) Add `tests/harness.rs` (`sqlx::test`-backed, driving
      `build_app` via `tower::ServiceExt::oneshot`, no mocking of the router itself): a request
      with a validly-signed test JWT returns 200 with the seeded features/session/blocked data; a
      request with no `Authorization` header returns 401 with no harness data in the body; a
      request with a JWT signed with the wrong secret returns 401; a request with an expired JWT
      returns 401; assert the test only ever issues `SELECT` statements against the seeded schema
      (no route under test performs a write).
- [x] T8 (R9) Update `.harness.json`'s `verify_command` to the command documented in
      `docs/verification.md`'s "Level 1" section (fmt + clippy + build + test for this project);
      run `./init.sh` and confirm it passes.
