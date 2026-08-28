---
feature_number: 2
name: upgrade_rust_toolchain
title: Upgrade Rust toolchain and backend crate majors to latest stable
status: done
created_at: 2026-08-27T06:06:05.000Z
updated_at: 2026-08-28T05:26:43.000Z
---

## Description
The backend (backend/Cargo.toml) does not pin a rust-version/toolchain and locally resolves against rustc 1.94.1, while Rust 1.98.0 (Aug 2026) is the latest stable release. Several direct dependencies are also behind their latest major: axum 0.7 (latest 0.8.x), sqlx 0.7 (latest 0.8.x), tower-http 0.5 (latest 0.6.x), thiserror 1 (latest 2.x), among others to be confirmed during research. Research and execute an upgrade of the toolchain (rustc/cargo, optionally pinning via rust-toolchain.toml) and the crate majors listed, verifying edition 2021 vs 2024 tradeoffs, and resolving any breaking API changes.

## Acceptance
- [ ] Latest stable Rust toolchain is confirmed and used to build/test the project (rust-toolchain.toml added if pinning is decided on)
- [ ] axum, sqlx, tower-http, thiserror, and any other outdated direct dependencies are bumped to their latest stable majors, with breaking API changes resolved
- [ ] A decision on Rust edition (stay on 2021 vs move to 2024) is documented with rationale
- [ ] cargo fmt --check, cargo clippy --all-targets -- -D warnings, cargo build, and cargo test all pass after the upgrade
- [ ] Cargo.toml / Cargo.lock reflect the new versions consistently
