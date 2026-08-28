# Tasks — upgrade_rust_toolchain

Ordered; check off `[x]` as completed. See `design.md` for the version table, the exact
`Cargo.toml` diffs, and the rationale behind each choice.

- [x] T1 (R1) Add `rust-version = "1.94"` to `backend/Cargo.toml`'s `[package]` section.
- [x] T2 (R2, R7) Bump `axum` to `"0.8"` in `backend/Cargo.toml`'s `[dependencies]`; update
      `backend/src/auth/extractor.rs`'s `impl FromRequestParts<AppState> for SupabaseUser` to drop
      the `#[axum::async_trait]` attribute (keep the `async fn from_request_parts` body unchanged —
      see `design.md`'s "Concrete code change" section); run `cargo build` and confirm it compiles.
- [x] T3 (R3) Bump `sqlx` to `"0.9"` in both `[dependencies]` and `[dev-dependencies]`, replacing
      the `runtime-tokio-rustls` feature with `runtime-tokio` and `tls-rustls` in each (keep
      `postgres`, `macros`, `uuid`, `chrono` in both, and `migrate` in `[dev-dependencies]` only, as
      today).
- [x] T4 (R4) Bump `tower-http` to `"0.7"` in `[dependencies]` (features stay `cors`, `trace`).
- [x] T5 (R5) Bump `jsonwebtoken` to `"11"` in `[dependencies]`, adding `features = ["rust_crypto"]`;
      confirm `backend/src/auth/jwt.rs` compiles with no other change (per `design.md`, its API
      surface — `Validation`, `DecodingKey`, `EncodingKey`, `Header`, `encode`, `decode` — is
      unaffected by `9`→`11`).
- [x] T6 (R6) Bump `thiserror` to `"2"` in `[dependencies]`; confirm `backend/src/error.rs`'s
      `#[derive(Error)]` `ApiError` enum compiles with no other change.
- [x] T7 (R9) Add `backend/tests/toolchain.rs`'s `lockfile_majors_meet_upgraded_floor` test (see
      `design.md` for the exact string-matching approach) asserting `Cargo.lock` resolves `axum`,
      `sqlx`, `tower-http`, `jsonwebtoken`, and `thiserror` to at least the majors pinned in T2-T6;
      if `thiserror`'s two-stanza ordering in the regenerated `Cargo.lock` doesn't match
      `design.md`'s assumption, adjust the search to unambiguously target this project's own direct
      dependency stanza.
- [x] T8 (R1) Add `backend/tests/toolchain.rs`'s `declares_minimum_supported_rust_version` test
      asserting `env!("CARGO_PKG_RUST_VERSION") == "1.94"`.
- [x] T9 (R8) Run `cargo test` and confirm `backend/tests/harness.rs`'s five `#[sqlx::test]`
      integration tests (`state_with_valid_token_returns_200_and_seeded_data`,
      `state_without_auth_header_returns_401_and_no_state`, `state_with_wrong_signature_returns_401`,
      `state_with_expired_token_returns_401`, `reader_performs_only_select_queries`) and
      `backend/src/auth/jwt.rs`'s four unit tests (`verifies_valid_token`,
      `rejects_wrong_signature`, `rejects_expired_token`, `rejects_wrong_audience`) all pass with
      their existing assertions unmodified (status codes, JSON body shapes, JWT accept/reject
      outcomes, `pg_stat_user_tables` SELECT-only invariant).
- [x] T10 (R10) Run `cargo update` from `backend/` to refresh `Cargo.lock`'s unbumped crates
      (`tower`, `tokio`, `serde`, `serde_json`, `chrono`, `dotenvy`, `tracing`,
      `tracing-subscriber`) to their latest compatible version within their existing `Cargo.toml`
      ranges, then run `cd backend && cargo fmt --check && cargo clippy --all-targets -- -D
      warnings && cargo build && cargo test` and confirm it exits `0`.
