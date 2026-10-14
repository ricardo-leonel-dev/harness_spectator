# Requirements — local_auth_mode

Scope: this backend only. Today every protected route verifies a Supabase-issued HS256 JWT
(`SUPABASE_JWT_SECRET`, `aud = "authenticated"`) and the backend issues no tokens. This feature adds
a runtime `AUTH_MODE` (`supabase` by default, or `local`). In local mode the backend checks
email/password pairs against users configured in `.env` (`LOCAL_AUTH_USERS`, email + argon2id PHC
hash) and issues its own short-lived HS256 token signed with `LOCAL_AUTH_SECRET`. Supabase mode keeps
today's behaviour. The backend stays read-only against the toolkit mirror: no table, no write.

Consumer: the frontend feature `local_auth_login`
(`frontend/specs/local_auth_login/design.md` § "Backend contract", assumptions A1–A7). The mapping
from each assumption to the requirements that satisfy it is in `design.md` § "Frontend contract".

Terms:

- **supabase mode / local mode** — the active value of `AUTH_MODE` after configuration loads.
- **config loading** — `Config::from_lookup` (and `Config::from_env`, which delegates to it), see
  `design.md`.
- **entry** — one `email:hash` item of `LOCAL_AUTH_USERS`; entries are numbered from 1 in the order
  they appear.
- **normalized email** — the email with surrounding whitespace removed and ASCII letters lowercased.
- **local token** — an HS256 JWT signed with `LOCAL_AUTH_SECRET` carrying the claims in R21.
- **Supabase token** — an HS256 JWT signed with `SUPABASE_JWT_SECRET` with `aud = "authenticated"`,
  as accepted today.
- **protected route** — `GET /api/harness/projects` and `GET /api/harness/projects/{slug}/state`.

Documentation changes (`docs/architecture.md`, `docs/verification.md`, `.env.example`) are delivered
by tasks T1 and T16 and checked by the reviewer; they are not behaviour and carry no `R<n>`.

## Configuration

## R1
WHEN `AUTH_MODE` is unset or empty, config loading SHALL select supabase mode.

## R2
WHEN `AUTH_MODE` is exactly `supabase` or exactly `local`, config loading SHALL select that mode.

## R3
IF `AUTH_MODE` is set to any other non-empty value (including a different letter case such as
`Local`) THEN config loading SHALL fail with `ConfigError::Invalid("AUTH_MODE", _)` whose message
lists both accepted values and repeats the rejected value.

## R4
WHILE supabase mode is selected, IF `SUPABASE_JWT_SECRET` is unset or empty THEN config loading SHALL
fail with `ConfigError::Missing("SUPABASE_JWT_SECRET")`.

## R5
WHILE supabase mode is selected, config loading SHALL succeed regardless of the presence or content
of `LOCAL_AUTH_SECRET`, `LOCAL_AUTH_USERS` and `LOCAL_AUTH_TOKEN_TTL_SECONDS`.

## R6
WHILE local mode is selected, config loading SHALL succeed when `SUPABASE_JWT_SECRET` is unset.

## R7
WHILE local mode is selected, IF `LOCAL_AUTH_SECRET` is unset or empty THEN config loading SHALL fail
with `ConfigError::Missing("LOCAL_AUTH_SECRET")`.

## R8
WHILE local mode is selected, IF `LOCAL_AUTH_SECRET` is shorter than 32 bytes THEN config loading
SHALL fail with `ConfigError::Invalid("LOCAL_AUTH_SECRET", _)`.

## R9
WHILE local mode is selected, config loading SHALL parse `LOCAL_AUTH_USERS` as entries separated by
`;`, each entry being `<email>:<argon2id PHC string>` split at its first `:`, with whitespace around
each entry ignored and empty entries skipped.

## R10
WHILE local mode is selected, IF `LOCAL_AUTH_USERS` is unset or yields zero entries THEN config
loading SHALL fail with `ConfigError::Missing("LOCAL_AUTH_USERS")`.

## R11
WHILE local mode is selected, IF an entry has no `:`, an email that is empty or contains no `@`, or a
hash that does not parse as a PHC string whose algorithm is `argon2id`, THEN config loading SHALL
fail with `ConfigError::Invalid("LOCAL_AUTH_USERS", _)` whose message names that entry's 1-based
position.

## R12
WHILE local mode is selected, IF two entries have the same normalized email THEN config loading
SHALL fail with `ConfigError::Invalid("LOCAL_AUTH_USERS", _)` whose message names the position of the
second one.

## R13
IF config loading fails THEN the error's `Display` text SHALL NOT contain the value of
`LOCAL_AUTH_SECRET` or any hash text taken from `LOCAL_AUTH_USERS`.

## R14
WHILE local mode is selected and `LOCAL_AUTH_TOKEN_TTL_SECONDS` is unset or empty, config loading
SHALL set the token lifetime to 3600 seconds.

## R15
WHILE local mode is selected, IF `LOCAL_AUTH_TOKEN_TTL_SECONDS` is not a base-10 integer between 60
and 86400 inclusive THEN config loading SHALL fail with
`ConfigError::Invalid("LOCAL_AUTH_TOKEN_TTL_SECONDS", _)`.

## R16
IF config loading fails when the server binary starts THEN the binary SHALL exit with a non-zero
status after writing to stderr a message that names the offending environment variable, without
attempting a database connection.

## Mode endpoint

## R17
WHEN `GET /api/auth/mode` is requested without an `Authorization` header, the system SHALL respond
`200` with the JSON body exactly `{"mode":"supabase"}` in supabase mode or `{"mode":"local"}` in
local mode.

## Login (local mode)

## R18
WHILE local mode is selected, WHEN `POST /api/auth/login` receives `{"email","password"}` whose
normalized email matches an entry and whose password verifies against that entry's hash, the system
SHALL respond `200` with a JSON object whose only keys are `accessToken` (a string) and `expiresAt`
(an integer).

## R19
WHEN a login succeeds, the response's `expiresAt` SHALL equal the issued token's `exp` claim, which
SHALL equal its `iat` claim plus the configured token lifetime in seconds.

## R20
WHEN a login succeeds, the system SHALL sign the token with HS256 using `LOCAL_AUTH_SECRET`.

## R21
WHEN a login succeeds, the issued token SHALL carry exactly the claims `sub` and `email` (both the
normalized email), `iss = "harness-spectator"`, `aud = "harness-spectator-local"`, `iat` and `exp`.

## R22
WHILE local mode is selected, IF `POST /api/auth/login` names a configured email with a wrong
password THEN the system SHALL respond `401` with the JSON body exactly
`{"error":"unauthorized"}`.

## R23
WHILE local mode is selected, IF `POST /api/auth/login` names an email that matches no entry THEN
the system SHALL respond `401` with the JSON body exactly `{"error":"unauthorized"}`.

## R24
WHILE local mode is selected, config loading SHALL build a dummy argon2id hash whose `m`, `t` and
`p` parameters equal those of the first entry's hash.

## R25
WHILE local mode is selected, IF `POST /api/auth/login`'s body is not a JSON object with string
fields `email` and `password` (including a missing or non-JSON `Content-Type`) THEN the system SHALL
respond `400` with the JSON body exactly `{"error":"bad request"}`.

## R26
WHILE supabase mode is selected, `POST /api/auth/login` SHALL respond `404`.

## R27
The system SHALL respond `404` to `POST /api/auth/refresh` and to `POST /api/auth/logout` in both
modes.

## Protected routes

## R28
WHILE local mode is selected, WHEN a protected route receives `Authorization: Bearer <token>` with a
token returned by `POST /api/auth/login`, the system SHALL serve the route as it does for an
authorized request today (`200` for `GET /api/harness/projects`).

## R29
WHILE local mode is selected, IF a protected route receives a Supabase token THEN the system SHALL
respond `401`.

## R30
WHILE local mode is selected, IF a protected route receives a token signed with `LOCAL_AUTH_SECRET`
whose `aud` is `authenticated` THEN the system SHALL respond `401`.

## R31
WHILE local mode is selected, IF a protected route receives a local token whose `iss` is not
`harness-spectator` THEN the system SHALL respond `401`.

## R32
WHILE local mode is selected, IF a protected route receives a local token whose `exp` is earlier
than the current time THEN the system SHALL respond `401`.

## R33
WHILE local mode is selected, IF a protected route receives a token with the local claims signed with
a secret other than `LOCAL_AUTH_SECRET` THEN the system SHALL respond `401`.

## R34
WHILE supabase mode is selected, IF a protected route receives a token with the local claims
(`aud = "harness-spectator-local"`) signed with `SUPABASE_JWT_SECRET` THEN the system SHALL respond
`401`.

## R35
WHILE supabase mode is selected, protected routes SHALL accept and reject tokens exactly as pinned
by the pre-existing tests in `tests/harness.rs` and `src/auth/jwt.rs` (valid Supabase token → served;
missing, malformed, expired, wrong-secret or wrong-audience token → `401`).

## CORS

## R36
WHEN a preflight `OPTIONS /api/auth/login` arrives with `Origin` equal to `FRONTEND_ORIGIN`,
`Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: content-type`, the system
SHALL respond with `Access-Control-Allow-Origin` equal to `FRONTEND_ORIGIN`,
`Access-Control-Allow-Methods` containing `POST`, and `Access-Control-Allow-Headers` containing
`content-type`.

## R37
The CORS layer SHALL allow exactly the methods `GET` and `POST` and exactly the request headers
`authorization` and `content-type`, as constant values that do not depend on the request or on the
auth mode.

## Password hashing binary

## R38
WHEN `hash-password` runs with a non-empty first line on stdin, the binary SHALL write to stdout
exactly one line holding an argon2id PHC string that verifies against that line (without its
trailing `\n` or `\r\n`) and SHALL exit `0`.

## R39
WHEN `hash-password` runs twice with the same password, the two printed hashes SHALL differ.

## R40
IF `hash-password`'s stdin is empty or its first line is empty THEN the binary SHALL exit with a
non-zero status and write nothing to stdout.

## R41
The `hash-password` binary SHALL run with an empty environment (no `DATABASE_URL`, `AUTH_MODE` or
any other variable set).
