# progress_dashboard_view — additional requirements (agreed with the user, 2026-10-14)

These complement the Notion card's description/acceptance. Where they conflict, this file wins.

## Data

Consume `GET /api/harness/dashboard` (requires login; 401 without a valid token). Response shape:

```json
{
  "overall": { "done": 31, "total": 52, "percentage": 59.62,
               "byStatus": { "pending": 12, "specDrafting": 1, "specReady": 2,
                             "inProgress": 3, "blocked": 3, "done": 31 } },
  "topProjects": [
    { "slug": "spectator_backend", "done": 7, "total": 8, "percentage": 87.5 }
  ]
}
```

The backend endpoint is NOT yet in `origin/staging` — the spec is written against this contract.

## Decisions

1. **Percentages always with 2 decimals.** The backend rounds to 2 decimals, but JSON drops trailing zeros
   (`100.00` arrives as `100.0`, `87.50` as `87.5`). Always render with 2 decimals (`number:'1.2-2'` or
   `toFixed(2)`): `100` → `100.00`, `87.5` → `87.50`.
2. **401 handling — app-wide, in the interceptor.** `authGuard` only checks the local session before routing; it
   never sees HTTP responses, and `authInterceptor` only attaches the Bearer token. Extend `authInterceptor` so an
   HTTP 401 from the API signs the user out and redirects to `/login?returnUrl=<current url>`. Must not loop on the
   login request itself (local login 401 = invalid credentials, handled by `AuthService.loginLocal`).
3. **Chart library: `@swimlane/ngx-charts`** (v25.x, peer `@angular/core ^21.2 || ^22`). Requires adding
   `@angular/animations` (not currently installed). Colors via `customColors` using the Tailwind tokens; axis/label
   text styled via CSS for the dark theme. Dashboard route is already lazy-loaded, so bundle cost stays off startup.
4. **Theme: dark only.** The app has no light theme (`tailwind.config.js` has no `darkMode`, fixed dark palette).
   Charts must use the existing tokens (`ink`, `panel`, `signal`, `status.*`, etc.). No light theme in scope.
5. **New status color token:** `status.spec-drafting: '#4fa3e0'` (sky blue) — distinct from pending/in-progress/
   blocked/done/spec-ready, readable on `panel` (`#12161d`).
6. **Charts (statistical):**
   - Overall progress: `ngx-charts-gauge` with the percentage (2 decimals) and `done/total` in the center.
   - By status: `ngx-charts-pie-chart` in doughnut mode with the 6 statuses; tooltip shows count and %.
   - Top 10: `ngx-charts-bar-horizontal-stacked`, one bar per project split into done vs remaining, in the exact
     order returned by the API; label/tooltip shows slug, done/total and percentage.
7. **Click behavior:**
   - Top 10 bar click → navigate to existing route `/projects/:slug` with that entry's slug. Backend guarantees every
     returned slug works at `/api/harness/projects/{slug}/state`. Cursor/hover must make clickability obvious.
   - Overall/by-status charts are **informative only** (tooltips + interactive legend, no navigation): there is no
     global per-status listing, and `/` is the dashboard itself. A backend endpoint for that is requested separately.
8. **States:** loading; error (non-401 errors shown in-page; 401 handled by the interceptor per decision 2);
   empty when `overall.total === 0` — show a message instead of empty charts.
9. **Design:** the visual direction must come from the `frontend-design:frontend-design` skill (spec_author in
   design.md; implementer again before building components), following the existing app shell, auth and project
   selector.

## Required tests

- 2-decimal formatting: `100.0` renders `100.00`, `87.5` renders `87.50`.
- Clicking a project in the Top 10 chart navigates to `/projects/:slug`.
- Empty state when `overall.total === 0`.
- Loading and error states; data service.
- Interceptor: a 401 response signs out and redirects to `/login` with `returnUrl`.
