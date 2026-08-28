# Spec Author Notes — feature 3 `upgrade_rust_toolchain`

Session: 6 (resumed after two earlier interrupted runs; a session was already open when this
session began, so `claim-spec` was correctly skipped and we went straight to validation +
fixes + `mark-spec-ready`).

## Validation against the live repo

| Claim in draft | Verified | How |
|---|---|---|
| `rustc 1.94.1` Homebrew, no `rustup` | yes | `rustc --version`, `which rustup` (not found) |
| `Cargo.toml` edition 2021, current pins (axum 0.7, tower 0.5, tower-http 0.5, sqlx 0.7, jsonwebtoken 9, thiserror 1, dotenvy 0.15, chrono 0.4, tokio 1, tower-http 0.5, tracing 0.1, tracing-subscriber 0.3, serde 1, serde_json 1) | yes | read `backend/Cargo.toml` |
| `Cargo.lock` versions match design table | yes | `grep -E '^name = \|^version = ' Cargo.lock` |
| `axum::async_trait` only used in `extractor.rs:10` | yes | `grep -rn async_trait backend/src/` |
| `axum 0.8.9` is latest stable | yes | `cargo search axum --limit 1` |
| `tower-http 0.7.0` is latest stable | yes | `cargo search tower-http --limit 1` |
| `sqlx 0.9.0` is latest stable, MSRV 1.94.0 | yes | `cargo search sqlx --limit 1`, `cargo info sqlx` |
| `jsonwebtoken 11.0.0` is latest stable, MSRV 1.88, with `aws_lc_rs`/`rust_crypto` features | yes | `cargo search jsonwebtoken --limit 1`, `cargo info jsonwebtoken` |
| `thiserror 2.0.20` is latest stable; 1.x already pulled transitively at 2.0.20 | yes | `cargo search thiserror --limit 1`, Cargo.lock shows both |
| `tests/harness.rs` has 4 integration tests | **NO — has 5** | `grep -nE '#\[sqlx::test\]' tests/harness.rs` lists 5 entries |
| `jwt.rs` has 4 unit tests | yes | `mod tests` in `src/auth/jwt.rs` |
| No `rust-toolchain.toml` anywhere in repo | yes | `find . -name rust-toolchain\*` (none) |

## What I changed

1. **`requirements.md` R8**: replaced "four integration tests" with the actual five
   `#[sqlx::test]` fn names (added the missing `reader_performs_only_select_queries`), and
   named all four `jwt.rs` unit tests. Explicitly mentions the `pg_stat_user_tables`
   SELECT-only invariant from the fifth test so the requirement still pins down what
   "passes with existing assertions unmodified" means for it.

2. **`tasks.md` T9**: same fix — five integration tests + four unit tests, all named,
   `pg_stat_user_tables` invariant spelled out.

3. **`design.md`**:
   - Added a new **"Environment preconditions"** section (the explicit ask from the leader:
     the Angular feature blocked mid-implementation on exactly this shape of problem).
     It calls out:
       * `rustc` ≥ 1.94 required (matches `sqlx 0.9`'s MSRV) — **already satisfied on this
         machine** by the installed 1.94.1 Homebrew `rustc`, so no operator action needed
         here.
       * `rustup` intentionally NOT a precondition (it's not installed; the
         `rust-version`-vs-`rust-toolchain.toml` choice above already accommodates that).
       * A running PostgreSQL server is required for `cargo test` because
         `#[sqlx::test]` provisions an ephemeral DB per test — pre-existing constraint,
         not introduced by this feature, but called out so it isn't rediscovered.
       * First-run `cargo fmt`/`cargo clippy` need network access to pull component crates.
   - Added one paragraph in the **`jsonwebtoken` crypto-backend** section noting that
     `features = ["rust_crypto"]` keeps `jsonwebtoken` 11's default `use_pem` feature
     (Cargo only disables defaults when you also write `default-features = false`), so
     two extra harmless crates (`pem`, `simple_asn1`) get pulled in. The spec leaves
     this alone deliberately (no requirement drives it; `docs/conventions.md`'s
     "don't add knobs no requirement asks for" idiom applies).

## What I did NOT change

- The 10-requirement / 10-task structure, numbering, EARS patterns, traceability, and
  R-n↔T-n mapping were already correct (verified by tracing each R to ≥1 T and vice versa).
- The `version table` in design.md (verified against crates.io via `cargo search` and
  `cargo info`).
- The `extractor.rs` fix description (verified that `#[axum::async_trait]` is the only
  `async_trait` use anywhere in `backend/src/`).
- The `sqlx 0.9` feature-rename reasoning (verified `runtime-tokio` and `tls-rustls` are
  the documented split for the old `runtime-tokio-rustls` combination feature).
- The discarded-alternatives section (`rust-toolchain.toml` vs `rust-version`,
  `aws_lc_rs` vs `rust_crypto`, full `0.7` vs stopping at `0.6`, `toml`/`cargo_lock`
  crate vs plain string matching) — all reasons hold.
- The "Deferred: edition 2024" section — out of scope for this feature's stated goal
  (fresh toolchain floor + fresh dep majors), and `rust-version = "1.94"` is compatible
  with edition 2024 whenever a future feature takes that on.

## Counts (what `mark-spec-ready` will check)

- requirements.md: 10 `^## R<n>` headers (`R1`–`R10`, no gaps, no duplicates)
- tasks.md: 10 `- [ ] T<n>` checkboxes (`T1`–`T10`, no gaps, no duplicates)
- design.md: ≥1 discarded alternative with a stated reason (4 are present)

## Environment-precondition conclusion for the implementer

On the current machine, **nothing in the "Environment preconditions" list blocks R1-R10**:
`rustc` 1.94.1 already ≥ 1.94, Postgres was available for features 1 and 2 (so it's
presumably available now), Homebrew cargo + clippy + rustfmt are all on PATH. The list is
written for future operators / fresh CI runners, not to flag an active blocker.
