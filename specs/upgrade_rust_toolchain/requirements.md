# Requirements — upgrade_rust_toolchain

Scope: `backend/` only (Rust + Axum). This feature does **not** touch `frontend/` — see
`specs/upgrade_angular_latest/` for that work, drafted separately. It upgrades the backend's
declared minimum Rust version and its direct crate dependencies to their current latest majors,
fixes the one concrete source change that upgrade requires, and adds a regression guard so a
future accidental downgrade of any of these majors is caught by `cargo test` rather than
discovered later. It does **not** migrate `backend/` from edition 2021 to edition 2024 — see
`design.md`'s "Deferred: edition 2024" section for why that's out of scope here rather than
silently skipped.

Versions cited below were confirmed against crates.io's `max_stable_version` and each crate's own
CHANGELOG at spec-drafting time (2026-08-27), not assumed from the task description — see
`design.md`'s version table for the source of each.

## R1
The `backend/Cargo.toml` `[package]` section SHALL declare `rust-version = "1.94"`.

## R2
The `backend/Cargo.toml` `[dependencies]` section SHALL pin `axum` to major version `0.8`.

## R3
The `backend/Cargo.toml` `[dependencies]` and `[dev-dependencies]` sections SHALL each pin `sqlx`
to major version `0.9` using the separate `runtime-tokio` and `tls-rustls` features in place of
the removed `runtime-tokio-rustls` combination feature.

## R4
The `backend/Cargo.toml` `[dependencies]` section SHALL pin `tower-http` to major version `0.7`.

## R5
The `backend/Cargo.toml` `[dependencies]` section SHALL pin `jsonwebtoken` to major version `11`
with its `rust_crypto` feature enabled.

## R6
The `backend/Cargo.toml` `[dependencies]` section SHALL pin `thiserror` to major version `2`.

## R7
WHEN `backend/src/auth/extractor.rs` is compiled against `axum` `0.8`, the system SHALL implement
`SupabaseUser`'s `FromRequestParts` using the trait's native `async fn` method (no
`#[axum::async_trait]` attribute macro, which axum removed in `0.8`).

## R8
The system SHALL continue to pass `backend/tests/harness.rs`'s five `#[sqlx::test]` integration
tests (`state_with_valid_token_returns_200_and_seeded_data`,
`state_without_auth_header_returns_401_and_no_state`, `state_with_wrong_signature_returns_401`,
`state_with_expired_token_returns_401`, and `reader_performs_only_select_queries`) and
`backend/src/auth/jwt.rs`'s four unit tests (`verifies_valid_token`, `rejects_wrong_signature`,
`rejects_expired_token`, `rejects_wrong_audience`) with their existing assertions (HTTP status
codes, JSON error/success body shapes, JWT accept/reject outcomes, and the
`pg_stat_user_tables` SELECT-only counter invariant) unmodified after R2-R7's upgrade.

## R9
The system SHALL provide a `backend/tests/toolchain.rs` test that reads `backend/Cargo.lock` and
fails if the resolved version of `axum`, `sqlx`, `tower-http`, `jsonwebtoken`, or `thiserror` is
older than the major declared for it in R2-R6.

## R10
WHEN `cd backend && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo build
&& cargo test` is run after R1-R9 are satisfied, the system SHALL exit `0`.
