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
