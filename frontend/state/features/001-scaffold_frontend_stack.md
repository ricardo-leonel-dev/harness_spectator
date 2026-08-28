---
feature_number: 1
name: scaffold_frontend_stack
title: Scaffold the frontend + backend stack with login/auth
status: done
created_at: 2026-08-26T21:23:25.000Z
updated_at: 2026-08-27T05:58:30.000Z
---

## Description
Choose and scaffold both a frontend stack (build tool, framework, TypeScript config, linting) for a UI that reads/displays this harness's state (features, sessions, blocked dependencies) from a sibling project's harness.db / state/ snapshot, AND a separate backend API (framework/language) that the frontend consumes over HTTP. The backend must implement a login/authentication mechanism gating access to the harness-state data; the specific approach (own credentials vs. an external provider) is not decided yet. No stack has been chosen for either side — decide during implementation and document the choice, including the auth approach, in docs/architecture.md.

## Acceptance
- [ ] A working frontend dev server starts with a single documented command (e.g. npm run dev)
- [ ] A working frontend build command produces a production build (e.g. npm run build)
- [ ] A separate backend API is scaffolded and runs with a single documented command
- [ ] The backend exposes a login/auth flow that issues a session/token, plus at least one protected endpoint that requires it
- [ ] The frontend has a login screen that authenticates against the backend and gates access to the harness-state UI behind a successful login
- [ ] docs/architecture.md is updated to record the chosen frontend stack, backend stack, and auth approach, and why
- [ ] .harness.json's verify_command is updated to a real command (e.g. lint+build for both frontend and backend) once the stacks exist
