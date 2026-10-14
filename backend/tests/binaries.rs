use std::io::Write;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

use harness_frontend_backend::auth::password::{parse_argon2id_hash, verify_password};

fn run(bin: &str, envs: &[(&str, &str)], stdin: &[u8]) -> Output {
    let mut child = Command::new(bin)
        .env_clear()
        .envs(envs.iter().copied())
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("binary must start");
    child.stdin.take().unwrap().write_all(stdin).unwrap();
    child.wait_with_output().unwrap()
}

fn hash_password_bin(stdin: &[u8]) -> Output {
    run(env!("CARGO_BIN_EXE_hash-password"), &[], stdin)
}

#[test]
fn server_exits_nonzero_naming_variable_on_bad_config() {
    let started = Instant::now();
    let output = run(
        env!("CARGO_BIN_EXE_harness_frontend_backend"),
        &[
            ("AUTH_MODE", "bogus"),
            (
                "DATABASE_URL",
                "postgres://nobody@10.255.255.1:1/unreachable",
            ),
            ("FRONTEND_ORIGIN", "http://localhost:4200"),
        ],
        b"",
    );
    let stderr = String::from_utf8_lossy(&output.stderr);

    assert!(!output.status.success(), "server must exit non-zero");
    assert!(stderr.contains("AUTH_MODE"), "stderr: {stderr}");
    assert!(stderr.contains("configuration error"), "stderr: {stderr}");
    assert!(
        started.elapsed() < Duration::from_secs(5),
        "exit must not wait on the 5 s database acquire timeout"
    );
}

#[test]
fn hash_password_binary_prints_verifiable_argon2id_hash() {
    let output = hash_password_bin(b"pw with spaces \n");
    assert_eq!(output.status.code(), Some(0));

    let stdout = String::from_utf8(output.stdout).unwrap();
    let lines: Vec<&str> = stdout.split_terminator('\n').collect();
    assert_eq!(lines.len(), 1, "exactly one stdout line: {stdout:?}");
    assert!(stdout.ends_with('\n'));
    let hash = lines[0];
    assert!(
        parse_argon2id_hash(hash).is_ok(),
        "not argon2id PHC: {hash}"
    );
    assert!(verify_password("pw with spaces ", hash));
    assert!(!verify_password("pw with spaces", hash));

    let crlf = hash_password_bin(b"secret\r\n");
    assert_eq!(crlf.status.code(), Some(0));
    let crlf_hash = String::from_utf8(crlf.stdout).unwrap();
    assert!(verify_password("secret", crlf_hash.trim_end_matches('\n')));
}

#[test]
fn hash_password_binary_uses_fresh_salt() {
    let first = hash_password_bin(b"same password\n");
    let second = hash_password_bin(b"same password\n");
    assert!(first.status.success() && second.status.success());
    assert_ne!(first.stdout, second.stdout);
}

#[test]
fn hash_password_binary_rejects_empty_input() {
    for stdin in [&b""[..], b"\n", b"\r\n"] {
        let output = hash_password_bin(stdin);
        assert!(!output.status.success(), "{stdin:?} must fail");
        assert!(output.stdout.is_empty(), "{stdin:?} must not write stdout");
        assert!(String::from_utf8_lossy(&output.stderr).contains("password must not be empty"));
    }
}
