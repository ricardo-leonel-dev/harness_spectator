# Requirements — progress_dashboard_view

Context: today `/` is an empty child route of `DashboardPageComponent` that immediately redirects to
the last-remembered (or first) project at `/projects/:slug`. This feature turns `/` into a
cross-project **progress overview** rendered inside the existing app shell (top bar, wordmark,
project selector, log out), backed by a new backend endpoint, makes an HTTP 401 from the API
sign the user out app-wide, and makes the login page honour the resulting `returnUrl`.

Sources: the Notion card (feature #8 description/acceptance) and
`progress/requirements_progress_dashboard_view.md` (agreed with the user 2026-10-14; it wins on
conflict).

Backend contract consumed (`GET {apiBaseUrl}/api/harness/dashboard`, not yet merged on the backend;
this spec is written against the contract below):

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

- `percentage` values are rounded to 2 decimals by the backend, but JSON drops trailing zeros.
- `topProjects` holds at most 10 entries, already ordered by the backend; every `slug` resolves at
  `/api/harness/projects/{slug}/state`.
- `401 {"error":"unauthorized"}` without a valid token.

Terms used below:

- **overview** — the new `app-progress-overview` component.
- **dashboard response** — a successful (2xx) body of `GET /api/harness/dashboard`.
- **status chart** — the `ngx-charts-pie-chart` in doughnut mode.
- **gauge** — the `ngx-charts-gauge`.
- **Top 10 chart** — the `ngx-charts-bar-horizontal-stacked`.
- **readout** — the ranked HTML list rendered under the Top 10 chart.
- **fmt(x)** — `x` rendered with exactly two decimal places (`Number.prototype.toFixed(2)`).
- **local login URL** — `{apiBaseUrl}/api/auth/login`.

## API

## R1
The system SHALL expose `HarnessApiService.getDashboard()`, returning
`Observable<DashboardResponse>`, that sends `GET {apiBaseUrl}/api/harness/dashboard`.

## Percentage formatting

## R2
The system SHALL expose a pure function `formatPercent(value: number): string` that returns `value`
with exactly two decimal places (`100` → `"100.00"`, `87.5` → `"87.50"`, `59.62` → `"59.62"`,
`0` → `"0.00"`).

## Routing and app shell

## R3
WHILE the current URL is `/`, the system SHALL render the overview inside the dashboard page's
`<main>` element.

## R4
WHEN the dashboard page is at `/` and the project list request succeeds with one or more projects,
the system SHALL remain at `/` without navigating to any `/projects/:slug` URL.

## R5
WHILE the current URL is `/`, the system SHALL NOT render the "Loading projects…" message or the
"No projects in the mirror yet" message.

## R6
IF the project list request fails WHILE the current URL is `/` THEN the system SHALL show that
failure only inside the project selector, with no page-level `[ERR]` banner for it.

## R7
WHILE the current URL is `/projects/:slug`, the system SHALL NOT render the overview.

## R8
WHILE the current URL is `/projects/:slug`, the system SHALL NOT send `GET /api/harness/dashboard`.

## R9
WHILE no project is selected, the project selector trigger SHALL display the text `all projects`.

## R10
The system SHALL render the top-bar wordmark as a link to `/` with the accessible name `Overview`.

## Overview states

## R11
WHEN the overview is created, the system SHALL send exactly one `GET /api/harness/dashboard`
request.

## R12
WHILE the dashboard request is pending, the system SHALL render a `role="status"` element with the
text `Loading overview…`.

## R13
IF the dashboard request fails with a status other than 401 THEN the system SHALL render a
`role="alert"` banner containing `[ERR]` and the error's `message`.

## R14
WHEN the user activates the `Retry` button inside the error banner, the system SHALL send a new
`GET /api/harness/dashboard` request.

## R15
IF the dashboard request fails with status 401 THEN the overview SHALL NOT render the `[ERR]`
banner.

## R16
WHEN a dashboard response has `overall.total === 0`, the system SHALL render the empty-state
message in place of the gauge, the status chart and the Top 10 chart.

## R17
WHEN a dashboard response has `overall.total > 0`, the system SHALL render the gauge, the status
chart and the Top 10 chart.

## R18
WHEN a dashboard response has `overall.total > 0`, the system SHALL render the summary line
`<done> of <total> features done across all projects.` using `overall.done` and `overall.total`.

## Overall gauge

## R19
The system SHALL bind the gauge to a single result whose value is `overall.percentage`, with
`min` 0 and `max` 100.

## R20
The system SHALL render the gauge's center value as `fmt(overall.percentage)` followed by `%`.

## R21
The system SHALL render the gauge's units text as `<done> / <total> done`.

## Status chart

## R22
The system SHALL render the status chart with `doughnut` set to `true`.

## R23
The system SHALL feed the status chart exactly six slices, in this order and with these values:
`Pending` = `byStatus.pending`, `Spec drafting` = `byStatus.specDrafting`, `Spec ready` =
`byStatus.specReady`, `In progress` = `byStatus.inProgress`, `Blocked` = `byStatus.blocked`,
`Done` = `byStatus.done`.

## R24
The system SHALL color each status slice with its status token hex value (`Pending` `#46505f`,
`Spec drafting` `#4fa3e0`, `Spec ready` `#8b7fe8`, `In progress` `#e8a33d`, `Blocked` `#e5484d`,
`Done` `#3ecf8e`).

## R25
The system SHALL render each status slice's tooltip text as `<count> features (<fmt(count / total *
100)>%)`, where `total` is `overall.total`.

## R26
The system SHALL render the status chart with its legend enabled.

## R27
WHEN the user selects a slice of the status chart, an entry of its legend, or the gauge, the system
SHALL NOT navigate.

## Top 10 chart

## R28
The system SHALL feed the Top 10 chart one group per `topProjects` entry, named by its `slug`, in
the exact order returned by the API.

## R29
The system SHALL split each Top 10 group into a `Done` segment valued `done` and a `Remaining`
segment valued `total - done`, in that order.

## R30
The system SHALL color `Done` segments `#3ecf8e` (`status.done`) and `Remaining` segments
`#3a4452` (`line-strong`).

## R31
The system SHALL render each Top 10 tooltip with the group's `slug`, the text `<done> / <total>
done`, and `fmt(percentage)` followed by `%`.

## R32
WHEN the user selects a segment of a Top 10 group, the system SHALL navigate to
`/projects/<slug>` for that group's slug.

## R33
The system SHALL style the Top 10 chart's bar elements with `cursor: pointer`.

## R34
The system SHALL render the readout as one row per `topProjects` entry, in API order, each showing
its slug, `<done>/<total>` and `fmt(percentage)` followed by `%`.

## R35
The system SHALL render each readout row's slug as a link to `/projects/<slug>`.

## R36
IF a dashboard response has `overall.total > 0` and an empty `topProjects` array THEN the system
SHALL render the text `No projects to rank yet.` in place of the Top 10 chart and the readout.

## R37
The system SHALL render the gauge, the status chart and the Top 10 chart with the ngx-charts
`animations` input set to `false`.

## Theme

## R38
The system SHALL define the Tailwind color token `status.spec-drafting` with the value `#4fa3e0`.

## Layout

## R39
WHILE the viewport is at least 1024 px wide, the system SHALL lay out the gauge and the status
chart side by side in one row.

## R40
WHILE the viewport is 360 px wide, the system SHALL render the populated overview without
horizontal page scroll (`document.documentElement.scrollWidth <= clientWidth`).

## App-wide 401 handling

## R41
WHEN an HTTP request whose URL is not the local login URL fails with status 401, the
`authInterceptor` SHALL clear the current session through `AuthService`.

## R42
WHEN an HTTP request whose URL is not the local login URL fails with status 401 and the router URL
does not start with `/login`, the `authInterceptor` SHALL navigate to `/login` with the query
parameter `returnUrl` set to the router URL at the time of the failure.

## R43
IF the local login URL request fails with status 401 THEN the `authInterceptor` SHALL pass the error
through without clearing the session or navigating.

## R44
WHEN an HTTP request fails with status 401, the `authInterceptor` SHALL re-emit the original
`HttpErrorResponse` to the caller.

## Post-login `returnUrl`

Terms used below:

- **returnUrl** — the value of the `returnUrl` query parameter on the router URL at the moment the
  login form is submitted (set by `authGuard` and by R42).
- **safe returnUrl** — a returnUrl that starts with exactly one `/` (its second character is neither
  `/` nor `\`) and whose path is not `/login` (it is not equal to `/login` and does not start with
  `/login?`, `/login#` or `/login/`).

## R45
WHEN a login succeeds and the returnUrl is a safe returnUrl, the login page SHALL navigate to that
returnUrl, including its query string and fragment.

## R46
WHEN a login succeeds and the router URL has no `returnUrl` query parameter (or it is empty), the
login page SHALL navigate to `/`.

## R47
IF a login succeeds and the returnUrl does not start with exactly one `/` (for example
`https://evil.example`, `//evil.example`, `/\evil.example`, `javascript:alert(1)` or
`projects/demo`) THEN the login page SHALL navigate to `/`.

## R48
IF a login succeeds and the returnUrl's path is `/login` THEN the login page SHALL navigate to `/`.
