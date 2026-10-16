# Requirements — feature_process_log_panel

Context: the dashboard (`/projects/:slug`) lists a project's features in `app-features-table` and
shows two presentational cards in the right `<aside>`: Open session and Blocked. Rows are not
interactive today. The backend feature `feature_process_log` (spectator_backend #6, done) adds
`GET {apiBaseUrl}/api/harness/projects/{slug}/features/{name}/log`. This feature makes rows
selectable, keeps the selection in the URL, and renders the selected feature's process log in a new
Process log card below Blocked.

Backend contract consumed (authoritative source: the backend's
`specs/feature_process_log/design.md` § "Response contract (200)" and § "Error paths"):

- `200` → `{ feature: FeatureHeader, sessions: ProcessLogSession[] }`, every nullable field present
  as an explicit `null`, no `notes` key. Sessions are ordered `startedAt` ascending and entries
  `createdAt` ascending by the server.
- `404 {"error":"not found"}` for an unknown project **or** an unknown feature (indistinguishable).
- `401 {"error":"unauthorized"}` without a valid token.

Terms used below:

- **selected feature** — the value of the `feature` query parameter on the current
  `/projects/:slug` URL, or none when the parameter is absent.
- **row** — one `[data-feature-row]` element of `app-features-table`.
- **activate a row** — click it, or press Enter or Space while it has focus.
- **card** — the new `app-process-log-card` component.
- **empty field** — a value that is `null`, an empty array, or a string that is empty after trimming.
- **narrow viewport** — `window.matchMedia('(min-width: 1024px)').matches` is `false` (below
  Tailwind's `lg` breakpoint, where the dashboard grid is a single column).

## API

## R1
The system SHALL expose `HarnessApiService.getFeatureLog(slug, name)`, returning
`Observable<FeatureLogResponse>`, that sends `GET
{apiBaseUrl}/api/harness/projects/{slug}/features/{name}/log`.

## R2
WHEN `getFeatureLog` builds the request URL, the system SHALL encode `slug` and `name` each with
`encodeURIComponent`.

## Row selection

## R3
The system SHALL render every row with `role="button"` and `tabindex="0"`.

## R4
WHEN the user activates a row whose name is not the selected feature, the system SHALL navigate to
`/projects/<slug>?feature=<name>` for the current slug.

## R5
WHEN the user activates the row whose name is the selected feature, the system SHALL navigate to
`/projects/<slug>` with no `feature` query parameter.

## R6
WHEN a row is focused and the user presses Enter or Space, the system SHALL apply the same
navigation that a click on that row applies.

## R7
WHEN the user presses Space on a focused row, the system SHALL call `preventDefault()` on the
keydown event.

## R8
WHEN a row activation changes the selected feature, the system SHALL navigate with
`replaceUrl: true`.

## R9
The system SHALL set `aria-pressed="true"` on the row whose name equals the selected feature and
`aria-pressed="false"` on every other row.

## R10
WHILE a row's name equals the selected feature, the system SHALL apply the classes
`border-signal` and `bg-edge` to that row.

## URL and request lifecycle

## R11
WHEN the dashboard's URL is `/projects/<slug>?feature=<name>`, including on initial load or reload,
the system SHALL send exactly one `getFeatureLog(<slug>, <name>)` request for that slug/name pair.

## R12
WHEN the user picks a different project in the project selector, the system SHALL navigate to
`/projects/<new-slug>` with no `feature` query parameter.

## R13
WHEN the slug or the selected feature changes while a feature-log request is in flight, the system
SHALL cancel the in-flight request.

## R14
WHEN only the `feature` query parameter changes, the system SHALL NOT send a new
`GET /api/harness/projects/{slug}/state` request.

## R15
WHEN the user activates a row WHILE the viewport is narrow, the system SHALL call
`scrollIntoView` on the card's host element.

## R16
IF the user prefers reduced motion (`(prefers-reduced-motion: reduce)` matches) THEN the system
SHALL pass `{ behavior: 'auto', block: 'start' }` to the `scrollIntoView` call of R15 instead of
`{ behavior: 'smooth', block: 'start' }`.

## Card placement and states

## R17
WHILE the dashboard shows a project, the system SHALL render the card as the last child of the
`<aside>`, immediately after `app-blocked-features-card`.

## R18
The system SHALL title the card with an `<h2>` reading `Process log` that carries the classes
`font-mono`, `text-label` and `uppercase`.

## R19
WHILE there is no selected feature, the system SHALL render the hint
`Select a feature to see its process log.` inside the card.

## R20
WHILE a feature-log request is in flight, the system SHALL render, inside the card, an element with
`role="status"` reading `Loading <name>…`.

## R21
IF the feature-log request fails with status 404 THEN the system SHALL render, inside the card, an
element with `role="alert"` containing `[404]` and the text `No feature named <name> in <slug>.`

## R22
IF the feature-log request fails with any status other than 404, including 401, THEN the system
SHALL render, inside the card, an element with `role="alert"` containing `[ERR]` and the error's
`message`, or `Failed to load the process log.` when the error has no message.

## Card content

## R23
WHEN a feature log loads, the system SHALL render the feature header: the `featureNumber` padded
to two digits, the `name`, the `title`, and an `app-lifecycle-track` bound to `status`.

## R24
WHEN a feature log loads with an empty `sessions` array, the system SHALL render the header
and the text `No sessions recorded for this feature yet.`

## R25
The system SHALL render sessions in the order the response lists them.

## R26
The system SHALL render, for each session, its `localId` prefixed with `#`, its `agent` and its
`startedAt`.

## R27
The system SHALL render, for each session, its `closedAt` and `pausedAt` when they are not empty
fields.

## R28
The system SHALL render, for each session, `plan`, `nextStep` and `changes` as lists with one item
per array element when they are not empty fields.

## R29
The system SHALL render, for each session, `verification` and `closure` when they are not empty
fields.

## R30
The system SHALL render, for each session, every element of `entries` in the order the response
lists them, showing its `createdAt` and its `entry` text.

## R31
IF a session field rendered by R27–R30 is an empty field THEN the system SHALL omit that field's
whole block, including its label.

## R32
The system SHALL mark each session with a state label: `closed` when `closedAt` is not null, else
`paused` when `pausedAt` is not null, else `open`.

## R33
The system SHALL render `localId`, `agent`, every timestamp, every `changes` item and the feature
`name` in `font-mono`, and the feature `title`, every `plan`/`nextStep` item, every entry text,
`verification` and `closure` in `font-sans`.

## Layout and motion

## R34
WHILE the viewport is 360 px wide, the system SHALL render the card, populated with unbroken
values longer than the viewport, without making the document horizontally scrollable.

## R35
The system SHALL give every animated element inside the card the class `motion-reduce:animate-none`.

## R36
The system SHALL NOT render any `[data-beacon]` element inside the card.
