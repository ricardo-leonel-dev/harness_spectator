# Design — upgrade_rust_toolchain

## Research basis

All version numbers below were checked against crates.io's `/api/v1/crates/<name>` endpoint
(`max_stable_version`) and the relevant crate's own `CHANGELOG.md`/GitHub releases at
spec-drafting time (2026-08-27) — not carried over unverified from the task description, which
turned out to understate two of them (`tower-http` and `jsonwebtoken`, see below). Rust's own
latest-stable number was checked against `static.rust-lang.org/dist/channel-rust-stable.toml` and
`rust-lang/rust`'s `RELEASES.md`.

| Crate | Currently pinned (`Cargo.lock`) | Latest stable (verified) | Action |
|---|---|---|---|
| `axum` | 0.7.9 | 0.8.9 | Bump to `"0.8"` (R2) |
| `tower` | 0.5.3 | 0.5.3 | No change — already latest major |
| `tower-http` | 0.5.2 | **0.7.0** (task description said 0.6.x — outdated) | Bump to `"0.7"` (R4) |
| `tokio` | 1.53.1 | 1.53.1 | No change |
| `serde` | 1.0.229 | 1.0.229 | No change |
| `serde_json` | 1.0.151 | 1.0.151 | No change |
| `sqlx` | 0.7.4 | **0.9.0** (task description said 0.8.x — outdated) | Bump to `"0.9"` (R3) |
| `chrono` | 0.4.45 | 0.4.45 | No change |
| `jsonwebtoken` | 9.3.1 | **11.0.0** (task description implied no bump needed — two majors behind) | Bump to `"11"` (R5) |
| `dotenvy` | 0.15.7 | 0.15.7 | No change |
| `thiserror` | 1.0.69 (direct); 2.0.20 already present transitively | 2.0.20 | Bump direct dep to `"2"` (R6) |
| `tracing` | 0.1.44 | 0.1.44 | No change |
| `tracing-subscriber` | 0.3.23 | 0.3.23 | No change |
| Rust (`rustc`) | 1.94.1 (Homebrew, this machine) | 1.98.0 (2026-08-20) | See "Rust toolchain" below — not a Cargo.toml-enforceable exact pin |

## Rust toolchain: `rust-version`, not `rust-toolchain.toml`

This machine's `rustc` is a Homebrew install (`rustc --version` → `1.94.1`); `rustup` is not
installed (`command not found: rustup`). A `rust-toolchain.toml` pinning `channel = "1.98.0"` is
only honored by `rustup`'s `cargo`/`rustc` proxy shims — a plain Homebrew `cargo` silently ignores
it, so committing one here would assert a guarantee this environment cannot actually enforce
(false confidence, not a false requirement — see "Discarded alternatives").

`rust-version` in `Cargo.toml`, by contrast, is enforced by *any* `cargo`, `rustup`-installed or
not: a build against an older `rustc` than the declared floor fails at `cargo build` time. That
makes it the right git-tracked, portably-enforced artifact for this feature. The floor is set to
`1.94` (R1) because that's `sqlx` `0.9`'s own declared MSRV (its CHANGELOG: "the supported Rust
version for this release cycle is 1.94.0") — the tightest floor actually *required* by R2-R6's
bumps, and one this machine's current 1.94.1 install already satisfies without any local upgrade.
Pinning `rust-version` to the exact latest (`1.98`) instead would reject perfectly good future
patch releases (1.94.2, 1.95.0, ...) for no functional reason and isn't what `rust-version`
is for (it's a floor, not a target). Upgrading this machine's actual installed `rustc` toward
1.98.0 (e.g. `brew upgrade rust`) is worth doing as routine hygiene, but it's an operator action
on a machine this spec doesn't control, not a git-trackable requirement — R1/R10 verify the floor
compiles, not which exact patch happens to be installed.

## Concrete code change: `backend/src/auth/extractor.rs` (R7)

`axum-core` 0.5.0 (paired with `axum` 0.8.0) replaced `#[async_trait]` with return-position
`impl Trait` in traits (RPITIT) for `FromRequestParts`/`FromRequest`, and axum's crate root no
longer re-exports `async_trait` at all (confirmed: no `async_trait` in `axum` 0.8.9's `lib.rs`
`pub use` list). The current code:

```rust
#[axum::async_trait]
impl FromRequestParts<AppState> for SupabaseUser {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        ...
    }
}
```

fails to compile under `axum` `0.8` (`axum::async_trait` no longer exists). The fix is a one-line
removal — RPITIT lets the impl keep the same `async fn from_request_parts` body verbatim, since
`FromRequestParts`'s trait definition itself now returns `impl Future<...> + Send`:

```rust
impl FromRequestParts<AppState> for SupabaseUser {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        ...  // body unchanged
    }
}
```

No other file in `backend/src/` uses `#[axum::async_trait]` or any other axum-0.8-removed API
(no `Host` extractor, no `WebSocket::close`, no `Serve::tcp_nodelay`, no path params using the old
`:name`/`*name` syntax — the only route, `/api/harness/state`, has no path params at all).

## `sqlx` feature rename (R3)

`sqlx` `0.9`'s `Cargo.toml` no longer declares the `runtime-tokio-rustls` combination feature at
all (confirmed: zero matches for it in the crate's current `Cargo.toml`, where 0.7/0.8 had it).
Both `[dependencies]` and `[dev-dependencies]` (the latter also carries `migrate`) move from:

```toml
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio-rustls", "macros", "uuid", "chrono"] }
```
to:
```toml
sqlx = { version = "0.9", features = ["postgres", "runtime-tokio", "tls-rustls", "macros", "uuid", "chrono"] }
```

`tls-rustls` (not `tls-rustls-aws-lc-rs`) is chosen because it's the alias `sqlx` itself documents
for backward compatibility with what the old `runtime-tokio-rustls` combination feature used
(`ring`-backed rustls) — same effective TLS backend, just requested as two separate feature flags
per `sqlx`'s new forward-compatible convention. No query macro output, migration file, or `FromRow`
usage in this codebase depends on any of `0.9`'s other breaking changes (nullability inference
changes are Postgres-view/SQLite-specific; the `PgHasArrayType`/`Encode`/`Migrator` changes only
bite manual trait impls or `#[sqlx(...)]` attributes this codebase doesn't use).

## `jsonwebtoken` crypto backend (R5)

Starting at `10.0.0`, `jsonwebtoken` requires selecting a crypto backend via a feature flag
(`aws_lc_rs` or `rust_crypto`) or supplying a custom `CryptoProvider`. `rust_crypto` is chosen over
`aws_lc_rs`: it's pure-Rust (the `hmac`+`sha2` crates cover this codebase's only algorithm, HS256),
consistent with this project's existing preference for pure-Rust builds over ones requiring a C
toolchain/cmake (the same reasoning `runtime-tokio-rustls` already reflected by avoiding
`native-tls`/OpenSSL). `aws_lc_rs` would additionally require a C compiler and `cmake` on every
machine that builds this backend, an environment dependency this project has never needed before.

One detail worth pinning down: `jsonwebtoken` 11's `default = ["use_pem"]`, so writing
`features = ["rust_crypto"]` *adds* `rust_crypto` on top of the default `use_pem` (it does not
disable it — Cargo only respects `default-features = false` for that). That's harmless for this
codebase — HS256 only uses HMAC/SHA2, not PEM — and pulls in two extra crates (`pem`,
`simple_asn1`). The spec leaves this alone rather than adding `default-features = false`,
because it is *not* a correctness or compatibility issue, and the "don't add knobs no requirement
asks for" idiom in `docs/conventions.md` applies. R10 still verifies a clean `cargo build`.

None of `9`→`11`'s other breaking changes (`Header.extras` becoming a struct, `Jwk`/`KeyAlgorithm`
renames, `DecodingKey`/`EncodingKey` accessor renames) touch this codebase — `backend/src/auth/jwt.rs`
only calls `Validation::new`, `.set_audience`, `DecodingKey::from_secret`, `decode::<Claims>`,
`Header::new`, `EncodingKey::from_secret`, and `encode`, none of which changed signature.

## `thiserror` (R6)

`thiserror` `1`→`2` has no changelog entries affecting `#[derive(Error)]` on a plain enum with
`#[error("...")]` messages and no `#[from]`/field-interpolation edge cases beyond what
`backend/src/error.rs`'s `ApiError` already uses — this bump is expected to be a version-string-only
change with no source edit required, unlike R7's `axum` fix.

## Files to touch

```
backend/
  Cargo.toml              # [package] rust-version (R1); axum/sqlx/tower-http/jsonwebtoken/thiserror
                           # version + feature bumps (R2-R6) in [dependencies] and [dev-dependencies]
  Cargo.lock               # regenerated by `cargo update`/`cargo build`, not hand-edited
  src/auth/extractor.rs    # drop `#[axum::async_trait]` (R7)
  tests/toolchain.rs        # new: Cargo.lock major-version regression guard (R9) +
                            # CARGO_PKG_RUST_VERSION assertion (R1)
```

No other `backend/src/` file needs a source change — `backend/src/error.rs`,
`backend/src/auth/jwt.rs`, `backend/src/harness/reader.rs`, `backend/src/harness/router.rs`,
`backend/src/app.rs`, `backend/src/config.rs`, `backend/src/main.rs`, and
`backend/migrations/0001_harness_schema.sql` are all reviewed against R2-R6's changelogs above and
none use a removed/changed API.

## Environment preconditions

This spec is deliberately written so its code changes (`Cargo.toml` + one `extractor.rs` line + a
new `tests/toolchain.rs`) are self-contained, but a few operator-side facts determine whether R1-R10
can actually be verified at all. They are preconditions of this *feature's execution*, not of the
git-tracked code change — flagged here so a future `implementer` (or the `reviewer`) doesn't hit
them cold:

- **`rustc` ≥ 1.94 is required to compile the upgraded `Cargo.toml`.** This is the floor R1 declares
  and is also `sqlx` 0.9's own declared MSRV (verified via `cargo info sqlx 0.9.0` → `rust-version:
  1.94.0`). The currently installed `rustc` on this machine is **1.94.1 (Homebrew)**, which already
  satisfies the floor — **no operator action is required for the new floor to be met on this
  machine.** Any other machine/CI runner doing a clean `cargo build` after this feature lands
  needs its own `rustc` ≥ 1.94; `rust-version = "1.94"` in `Cargo.toml` will produce a clear build
  error pointing at this if it isn't met.
- **`rustup` is intentionally NOT a precondition.** `rustup` is not installed on this machine
  (`command not found: rustup`); `rustc`/`cargo` come from Homebrew. That's exactly why this spec
  uses `rust-version` in `Cargo.toml` rather than `rust-toolchain.toml` — see the "Rust toolchain"
  section above. A future operator who wants `rustup`-based toolchain pinning should add
  `rust-toolchain.toml` in a *separate* follow-up feature, not silently here.
- **A running PostgreSQL server is required for `cargo test`.** `backend/tests/harness.rs` uses
  `#[sqlx::test]`, which provisions an ephemeral database per test and runs the migrations in
  `backend/migrations/`. This is a pre-existing constraint of the backend's test suite — not
  introduced by this feature, but it *is* required for R8 and R10 to pass. The same constraint
  applied to feature 1 and feature 2; this feature inherits it. No `DATABASE_URL` is needed when
  `sqlx::test` runs (it spins up its own DB), but the local Postgres server itself must be
  reachable on the default socket/port. If it isn't, `cargo test` will fail with a connection
  error — that failure is environmental, not a spec issue.
- **`cargo fmt` and `cargo clippy` (R10) need network access on first run.** `clippy` with
  `--all-targets -- -D warnings` will pull `clippy_lints`/`rustfmt` on the first invocation after
  this feature lands (the project does not currently commit a toolchain-component lockfile).
  Pre-existing condition of the verify pipeline, unchanged by this feature.

In short: on this machine, **nothing in this list blocks R1-R10 today** — `rustc` 1.94.1 ≥ 1.94,
Postgres is assumed available (it was for features 1 and 2), and the Homebrew cargo has been used
to build/run the backend through two prior features. The list exists so a new operator/clean CI
runner doesn't discover these implicitly.

## `backend/tests/toolchain.rs` (R1, R9)

```rust
const CARGO_LOCK: &str = include_str!("../Cargo.lock");

#[test]
fn declares_minimum_supported_rust_version() {
    assert_eq!(env!("CARGO_PKG_RUST_VERSION"), "1.94");
}

#[test]
fn lockfile_majors_meet_upgraded_floor() {
    let expectations = [
        ("axum", "\nversion = \"0.8."),
        ("sqlx", "\nversion = \"0.9."),
        ("tower-http", "\nversion = \"0.7."),
        ("jsonwebtoken", "\nversion = \"11."),
        ("thiserror", "\nversion = \"2."),
    ];
    for (crate_name, version_prefix) in expectations {
        let stanza_start = CARGO_LOCK
            .find(&format!("name = \"{crate_name}\"\n"))
            .unwrap_or_else(|| panic!("{crate_name} not found in Cargo.lock"));
        let stanza = &CARGO_LOCK[stanza_start..];
        assert!(
            stanza.starts_with(&format!("name = \"{crate_name}\"{version_prefix}")),
            "{crate_name}'s resolved Cargo.lock version does not start with the expected floor"
        );
    }
}
```

(`thiserror` appears twice in `Cargo.lock` post-upgrade — once as this project's own `"2."` direct
dependency, once as a transitive `1.x` pulled in by some other crate; `.find()` returns the first
occurrence, which — because `cargo` sorts `Cargo.lock` package entries alphabetically-then-by-
version — is deterministic. The implementer should confirm this ordering holds against the actual
regenerated lockfile as part of T7, and add a second, more specific search anchor if it doesn't.)

This is deliberately plain string-matching, not a TOML parser: adding a `toml`/`cargo_lock` crate
just for this one test would need `docs/architecture.md`'s dependency allowlist updated first
(`docs/conventions.md`'s "extreme homogeneity" principle applies to test code too), for a check
this simple to express without one.

## Error / edge-case paths

- If `cargo update` (T10) pulls in a *new* major for `tower`/`tokio`/`serde`/`serde_json`/`chrono`/
  `dotenvy`/`tracing`/`tracing-subscriber` that didn't exist at spec-drafting time (none currently
  do, per the table above), that's outside R1-R10's scope — `cargo update` only ever moves within
  an existing `Cargo.toml` version requirement's range (`"1"`, `"0.4"`, etc.), so it cannot silently
  cross a major boundary for those; a real new major for any of them would need its own
  `Cargo.toml` version-string edit, which is out of scope for this spec and would need a follow-up
  feature the same way `axum`/`sqlx`/`tower-http`/`jsonwebtoken`/`thiserror` are handled here.
- If `cargo build` fails after R2-R6's bumps for a reason not covered above (an undiscovered
  breaking change), the implementer fixes it in place and documents the fix in
  `progress/impl_upgrade_rust_toolchain.md` — this design's "no other file needs a change" claim is
  a research finding, not a guarantee; R8/R10 are the actual pass/fail gates.

## Deferred: edition 2024

`backend/Cargo.toml` keeps `edition = "2021"`. Edition 2024 (stable since Rust 1.85.0) is a larger,
separate blast radius than this feature's goal (fresh toolchain floor + fresh dependency majors):
RPIT lifetime-capture rules change by default, `unsafe extern`/`unsafe(...)` attribute syntax
becomes required in more places, `if-let`/tail-expression temporary drop order changes, the
prelude gains `Future`/`IntoFuture` (a possible new name-resolution ambiguity source), and Cargo's
dependency resolver v3 changes how build/host dependencies unify. None of R1-R10 requires any of
that — bundling an edition migration into this feature would add real regression risk with no
requirement driving it. `rust-version = "1.94"` (R1) is edition-2024-compatible whenever a future
feature does take on that migration (2024's own MSRV is 1.85, below our floor), so this choice
doesn't foreclose it.

## Discarded alternatives

- **`rust-toolchain.toml` pinning `channel = "1.98.0"`** — rejected: this project's dev environment
  has no `rustup`, so a plain Homebrew `cargo`/`rustc` would silently ignore the file, making it an
  inert artifact that looks like an enforced pin but isn't. `rust-version` in `Cargo.toml` (chosen)
  is enforced by any `cargo` regardless of `rustup`.
- **`jsonwebtoken`'s `aws_lc_rs` crypto backend feature instead of `rust_crypto`** — rejected: pulls
  in a C/cmake build step this project has never required, for the same reason `runtime-tokio-rustls`
  was originally chosen over a native-TLS combination feature.
- **Stopping the `tower-http` bump at `"0.6"` instead of `"0.7"`** — rejected once `0.7.0`'s
  changelog was actually read: its "breaking" entries are all in `compression`/`follow-redirect`/
  `fs`/gRPC-`trace`-classification, none of which this codebase's `cors`+`trace`-only feature set
  touches, so there's no reason to stop short of the actual latest stable and let a `"0.6"` pin go
  stale again immediately.
- **A `toml`/`cargo_lock` crate dependency for `backend/tests/toolchain.rs`'s Cargo.lock check** —
  rejected: plain string search is sufficient for "does this stanza's version start with this
  prefix" and adding a dependency for it would need `docs/architecture.md`'s allowlist updated for
  no real benefit.
