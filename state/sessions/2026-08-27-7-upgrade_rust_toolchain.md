---
session_id: 7
feature: upgrade_rust_toolchain
agent: leader -> implementer (MiniMax-M3)
started_at: 2026-08-27T08:32:55.000Z
closed_at: 2026-08-27T14:21:44.000Z
---

## Plan
- T1: Add rust-version 1.94 to backend/Cargo.toml
- T2: Bump axum to 0.8 and remove async_trait from extractor.rs
- T3: Bump sqlx to 0.9 with new feature flags
- T4: Bump tower-http to 0.7
- T5: Bump jsonwebtoken to 11 with rust_crypto feature
- T6: Bump thiserror to 2
- T7: Add Cargo.lock regression guard test
- T8: Add rust-version assertion test
- T9: Run cargo test to verify all existing tests still pass
- T10: Run cargo update, fmt, clippy, build, test for full verification

## Log
- Claimed feature 3 upgrade_rust_toolchain. Plan recorded. Now starting implementation per spec.
- T1-T6 done: Cargo.toml updated (rust-version=1.94, axum=0.8, sqlx=0.9, tower-http=0.7, jsonwebtoken=11+rust_crypto, thiserror=2). Removed #[axum::async_trait] from extractor.rs.
- All T1-T10 complete. Report written to progress/impl_upgrade_rust_toolchain.md. ./init.sh passes (verify command exits 0). The only [WARN] is the pre-existing Supabase mirror bootstrap failure (unrelated to this feature). Awaiting reviewer verdict.
- Reviewer correction recorded: tower-http 0.5.2 → 0.7.0 introduces an observable CORS behavior change in the Vary header. 0.5.2's CorsLayer default sets vary = Vary::list(preflight_request_headers()), so every CORS response (including non-preflight) emitted 'Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers'. 0.7.0 adds an update_vary_header() method (mod.rs lines 459-481) that derives Vary from three predicates: allow_origin.varies_with_origin(), allow_methods.varies_with_request_method(), allow_headers.varies_with_request_headers(). With app.rs's constant config (single allow_origin, single-element allow_methods([Method::GET]), two allow_headers), all three return false, so update_vary_header sets vary = Vary::list([]) and NO Vary header is emitted. This is a benign upstream improvement over the overly-conservative 0.5 default but is a real behavior change, not an absence of one — my impl report's 'No observable CORS behavior change' claim was too strong. Worth noting for the planned CORS regression test feature: the assertion should pin down whether Vary is expected to be present or absent (current 0.7 behavior is absent), so a future tower-http bump doesn't silently flip it back.

## Next Step
- Feature complete and approved by reviewer. The only behavior change flagged in tower-http 0.5.2 → 0.7.0 (Vary header no longer emitted for constant CORS config) is benign upstream improvement, recorded in DB log for the planned CORS regression test feature to pin down explicitly.

## Verification
./init.sh passed end-to-end: frontend npm run lint + build + test (4/4) and backend cargo fmt --check + cargo clippy --all-targets -- -D warnings + cargo build + cargo test all green; 11 backend tests pass (4 unit in auth::jwt, 5 #[sqlx::test] integration in tests/harness.rs, 2 new in tests/toolchain.rs) with all existing assertions unmodified including the pg_stat_user_tables SELECT-only invariant. Only [WARN] was the pre-existing Supabase mirror bootstrap failure (environmental, non-blocking).

## Closure
Feature 3 upgrade_rust_toolchain implemented per approved spec. T1-T10 all checked: backend/Cargo.toml bumped to rust-version=1.94, axum=0.8, sqlx=0.9 (with runtime-tokio+tls-rustls feature split), tower-http=0.7, jsonwebtoken=11+rust_crypto, thiserror=2; backend/src/auth/extractor.rs dropped #[axum::async_trait] for axum 0.8 RPITIT; backend/tests/toolchain.rs added with 2 regression-guard tests (rust-version floor + Cargo.lock major floor for axum/sqlx/tower-http/jsonwebtoken/thiserror). Reviewer flagged one substantive correction: tower-http 0.5.2 -> 0.7.0 emits NO Vary header for the constant CORS config in app.rs (was 'Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers' under 0.5.2 default); benign upstream improvement, recorded in DB log for the planned CORS regression test feature to pin down explicitly. Frontend untouched, edition 2021 retained per spec's deferral.
