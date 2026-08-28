# Verification — How to prove a feature works

> Golden rule: the agent doesn't say "it works," it proves it. Every feature
> ends with executable evidence, not just claims.

## Verification Levels

### Level 1 — Unit Tests (mandatory)

Run, from the repo root:

```bash
(cd frontend && npm run lint && npm run build && npm run test -- --watch=false --browsers=ChromeHeadless) && \
(cd backend && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo build && cargo test)
```

This is the exact command `.harness.json`'s `verify_command` must be set to once both packages
exist (task in `specs/scaffold_frontend_stack/tasks.md`) — `init.sh` runs it before allowing a
session to close.

### Level 2 — Integration Test (if this project has a user-facing surface)

- **Backend:** an `axum`-native integration test (`tower::ServiceExt::oneshot` against the real
  router built by `build_app`, no mocking of the app itself) run against a throwaway `sqlx::test`
  Postgres schema: `GET /api/harness/state` with a validly-signed Supabase JWT (crafted in the test
  using the same test `SUPABASE_JWT_SECRET`) asserts 200 and the seeded feature/session data;
  the same request with a missing, malformed, or expired JWT asserts 401 with no harness data in
  the body.
- **Frontend:** an Angular `TestBed` test that renders the root routed component with
  `HttpTestingController` stubbing backend calls and a fake Supabase client stubbing
  `signInWithPassword`/session state — first with no session (assert the login page renders, the
  dashboard does not), then after a simulated successful sign-in (assert the dashboard now
  renders).

### Level 3 — Manual Smoke Test (optional but recommended)

1. `cd backend && cargo run` (reads `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `FRONTEND_ORIGIN`,
   `PORT` from `backend/.env`, defaults documented in `backend/.env.example`).
2. `cd frontend && npm start` (`ng serve`; reads `SUPABASE_URL`/`SUPABASE_ANON_KEY` from
   `frontend/src/environments/environment.ts`, generated from `frontend/.env` — see
   `frontend/.env.example`).
3. Open the frontend dev server URL in a browser — confirm the login screen renders and the
   dashboard is not visible/reachable yet.
4. Log in with a real Supabase user's email/password (created out-of-band in the Supabase project
   dashboard, per `docs/architecture.md`'s "What NOT to do" — this feature does not implement
   signup) — confirm the dashboard now renders, and that its feature list matches
   `scripts/harness.sh status` run against the same target project's mirrored Postgres schema.
5. Reload the page — confirm the session persists (still logged in) without re-entering
   credentials, since `supabase-js` persists the session and refreshes the access token.

## Anti-patterns (do not do)

- "I added the feature, it should work." → missing executable proof.
- A test that only checks "it didn't throw" → check the actual result.
- Mocking the thing under test instead of exercising it for real (e.g. mocking the Axum router in
  a backend test, or mocking the component under test in a frontend test — only the network
  boundary/HTTP client/Supabase client may be stubbed, per `docs/conventions.md`'s "Tests"
  section).
- Marking a feature `done` without `init.sh` passing.

## Final Check Before Closing

```bash
./init.sh   # must end with [OK] Environment ready
```

If `init.sh` is red, do not close the session as `done` — record the blocker
and set the feature's status to `blocked` instead.

## Node runtime (why `verify_command` starts with a PATH block)

Angular 22 requires `node ^22.22.3 || ^24.15.0 || >=26.0.0`. On this machine the inherited `PATH`
puts a secondary Node manager (`~/.local/share/nvm/v22.19.0/bin`) ahead of the nvm-managed
versions, and that v22.19.0 does **not** satisfy Angular 22 — the CLI aborts with a minimum-version
error. Sourcing nvm and running `nvm use` is *not* enough: nvm substitutes its path in place
(landing behind the shadow entry), so `node -v` keeps reporting v22.19.0 even after nvm prints
"Now using node v22.23.2".

So `.harness.json`'s `verify_command` begins with a block that reads the version from `.nvmrc`
and **force-prepends** that Node's `bin` to `PATH`, checking both the classic
(`<dir>/versions/node/v<V>/bin`) and flat (`<dir>/v<V>/bin`) layouts. It is written to never break
the `&&` chain: if `.nvmrc` is missing or that version isn't installed, it falls through silently
and the run proceeds on whatever `node` is on `PATH` (Angular will then fail loudly, which is the
intended visible failure rather than a false green).

Consequences worth knowing:

- **The pinned version lives in `.nvmrc`**, not in `.harness.json`. To move Node, edit `.nvmrc`
  and install that version (`nvm install <V>`).
- `.nvmrc` must hold a **literal version** (e.g. `22.23.2`), not an alias like `lts/*` — the block
  resolves paths directly and does not expand aliases.
- Running `npm`/`ng` **outside** `init.sh` gets no pin. Activate it in the same shell call first:
  `export PATH="$HOME/.nvm/versions/node/v$(cat .nvmrc)/bin:$PATH"`, then confirm with `node -v`.

