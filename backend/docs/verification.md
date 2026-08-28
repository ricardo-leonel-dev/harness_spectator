# Verification — How to prove a feature works

> Golden rule: the agent doesn't say "it works," it proves it. Every feature
> ends with executable evidence, not just claims.

> **Scope note.** The backend half of what used to be a two-stack verification document. The
> frontend's `npm`/Karma levels and its Node-pinning notes live in the sibling frontend project's
> own `docs/verification.md`. Each project's `verify_command` now covers only its own package, so a
> change here no longer waits on the other stack's test suite.

## Verification Levels

### Level 1 — Unit Tests (mandatory)

Run, from this project's root:

```bash
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo build && cargo test
```

This is what `.harness.json`'s `verify_command` is set to (plus a `DATABASE_URL` default) —
`init.sh` runs it before allowing a session to close.

**`cargo test` needs a running PostgreSQL server.** Every test that touches the database uses
`#[sqlx::test]`, which provisions an ephemeral database per test from `DATABASE_URL`. This is a
pre-existing environment precondition, not something any one feature introduced: if Postgres is
not running, the failure is an environment problem to fix, not a regression to debug in the code.

### Level 2 — Integration Test (if this project has a user-facing surface)

An `axum`-native integration test (`tower::ServiceExt::oneshot` against the real router built by
`build_app`, no mocking of the app itself) run against a throwaway `sqlx::test` Postgres schema:
`GET /api/harness/state` with a validly-signed Supabase JWT (crafted in the test using the same
test `SUPABASE_JWT_SECRET`) asserts 200 and the seeded feature/session data; the same request with
a missing, malformed, or expired JWT asserts 401 with no harness data in the body.

The CORS response contract (`Access-Control-*` headers plus the `Vary` header) is pinned separately
in `tests/cors.rs` — see `specs/cors_regression_test/` for why: a `tower-http` major bump changed
the `Vary` default while every other test stayed green.

### Level 3 — Manual Smoke Test (optional but recommended)

1. `cargo run` (reads `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `FRONTEND_ORIGIN`, `PORT` from `.env`;
   defaults documented in `.env.example`).
2. Request `GET /api/harness/state` without an `Authorization` header — confirm 401 and a JSON
   `{ "error": ... }` body carrying no harness data.
3. Request it again with a validly-signed Supabase JWT — confirm 200 and that the returned feature
   list matches `scripts/harness.sh status` run against the same target project.
4. For the full end-to-end path through a browser, start the sibling frontend project and follow its
   `docs/verification.md`'s Level 3.

## Anti-patterns (do not do)

- "I added the feature, it should work." → missing executable proof.
- A test that only checks "it didn't throw" → check the actual result.
- Mocking the thing under test instead of exercising it for real (e.g. mocking the Axum router in a
  test — only the network boundary may be stubbed, per `docs/conventions.md`'s "Tests" section).
- A regression guard that cannot fail. A test written by observing current output and asserting it
  can only ever confirm that today equals today — derive expectations from the configured intent
  instead.
- Marking a feature `done` without `init.sh` passing.

## Final Check Before Closing

```bash
./init.sh   # must end with [OK] Environment ready
```

If `init.sh` is red, do not close the session as `done` — record the blocker
and set the feature's status to `blocked` instead.
