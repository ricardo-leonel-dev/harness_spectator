use std::collections::HashSet;
use std::env;
use std::fmt;

use thiserror::Error;

use crate::auth::password::{dummy_hash_like, parse_argon2id_hash};

pub const DEFAULT_LOCAL_TOKEN_TTL_SECS: u64 = 3600;
pub const MIN_LOCAL_TOKEN_TTL_SECS: u64 = 60;
pub const MAX_LOCAL_TOKEN_TTL_SECS: u64 = 86_400;
pub const MIN_LOCAL_AUTH_SECRET_BYTES: usize = 32;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("missing required environment variable: {0}")]
    Missing(&'static str),
    #[error("invalid value for environment variable {0}: {1}")]
    Invalid(&'static str, String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AuthMode {
    Supabase,
    Local,
}

impl AuthMode {
    pub fn as_str(self) -> &'static str {
        match self {
            AuthMode::Supabase => "supabase",
            AuthMode::Local => "local",
        }
    }
}

#[derive(Clone, Debug)]
pub enum AuthConfig {
    Supabase { jwt_secret: String },
    Local(LocalAuthConfig),
}

impl AuthConfig {
    pub fn mode(&self) -> AuthMode {
        match self {
            AuthConfig::Supabase { .. } => AuthMode::Supabase,
            AuthConfig::Local(_) => AuthMode::Local,
        }
    }
}

#[derive(Clone)]
pub struct LocalAuthConfig {
    pub secret: String,
    pub users: Vec<LocalUser>,
    pub token_ttl_secs: u64,
    pub dummy_hash: String,
}

impl fmt::Debug for LocalAuthConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LocalAuthConfig")
            .field("secret", &"<redacted>")
            .field("users", &self.users)
            .field("token_ttl_secs", &self.token_ttl_secs)
            .field("dummy_hash", &"<redacted>")
            .finish()
    }
}

#[derive(Clone)]
pub struct LocalUser {
    pub email: String,
    pub password_hash: String,
}

impl fmt::Debug for LocalUser {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LocalUser")
            .field("email", &self.email)
            .field("password_hash", &"<redacted>")
            .finish()
    }
}

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub frontend_origin: String,
    pub auth: AuthConfig,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|key| env::var(key).ok())
    }

    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let port_raw = lookup("PORT").unwrap_or_else(|| "4000".to_string());
        let port = port_raw
            .parse::<u16>()
            .map_err(|e| ConfigError::Invalid("PORT", e.to_string()))?;

        let database_url = require(&lookup, "DATABASE_URL")?;
        let frontend_origin = require(&lookup, "FRONTEND_ORIGIN")?;
        let auth = match parse_auth_mode(lookup("AUTH_MODE"))? {
            AuthMode::Supabase => AuthConfig::Supabase {
                jwt_secret: require(&lookup, "SUPABASE_JWT_SECRET")?,
            },
            AuthMode::Local => AuthConfig::Local(load_local_auth(&lookup)?),
        };

        Ok(Self {
            port,
            database_url,
            frontend_origin,
            auth,
        })
    }
}

pub fn normalize_email(raw: &str) -> String {
    raw.trim().to_ascii_lowercase()
}

fn require(
    lookup: &impl Fn(&str) -> Option<String>,
    name: &'static str,
) -> Result<String, ConfigError> {
    lookup(name)
        .filter(|v| !v.is_empty())
        .ok_or(ConfigError::Missing(name))
}

fn parse_auth_mode(raw: Option<String>) -> Result<AuthMode, ConfigError> {
    match raw.as_deref() {
        None | Some("") | Some("supabase") => Ok(AuthMode::Supabase),
        Some("local") => Ok(AuthMode::Local),
        Some(other) => Err(ConfigError::Invalid(
            "AUTH_MODE",
            format!("expected `supabase` or `local`, got `{other}`"),
        )),
    }
}

fn load_local_auth(
    lookup: &impl Fn(&str) -> Option<String>,
) -> Result<LocalAuthConfig, ConfigError> {
    let secret = require(lookup, "LOCAL_AUTH_SECRET")?;
    if secret.len() < MIN_LOCAL_AUTH_SECRET_BYTES {
        return Err(ConfigError::Invalid(
            "LOCAL_AUTH_SECRET",
            format!(
                "must be at least {MIN_LOCAL_AUTH_SECRET_BYTES} bytes, got {}",
                secret.len()
            ),
        ));
    }

    let users = parse_local_users(&lookup("LOCAL_AUTH_USERS").unwrap_or_default())?;
    let token_ttl_secs = parse_token_ttl(lookup("LOCAL_AUTH_TOKEN_TTL_SECONDS"))?;
    let dummy_hash = dummy_hash_like(&users[0].password_hash)
        .map_err(|_| users_error(1, "could not derive a dummy hash"))?;

    Ok(LocalAuthConfig {
        secret,
        users,
        token_ttl_secs,
        dummy_hash,
    })
}

fn users_error(position: usize, message: &str) -> ConfigError {
    ConfigError::Invalid("LOCAL_AUTH_USERS", format!("entry {position}: {message}"))
}

fn parse_local_users(raw: &str) -> Result<Vec<LocalUser>, ConfigError> {
    let mut users = Vec::new();
    let mut seen = HashSet::new();
    let entries = raw.split(';').map(str::trim).filter(|e| !e.is_empty());

    for (index, entry) in entries.enumerate() {
        let position = index + 1;
        let (email, hash) = entry
            .split_once(':')
            .ok_or_else(|| users_error(position, "expected <email>:<argon2id hash>"))?;
        let email = normalize_email(email);
        if email.is_empty() || !email.contains('@') {
            return Err(users_error(
                position,
                "email must be non-empty and contain @",
            ));
        }
        let hash = hash.trim();
        parse_argon2id_hash(hash).map_err(|_| {
            users_error(
                position,
                "hash is not an argon2id PHC string; wrap the whole value in single quotes in .env so `$` is not expanded",
            )
        })?;
        if !seen.insert(email.clone()) {
            return Err(users_error(position, "duplicate email"));
        }
        users.push(LocalUser {
            email,
            password_hash: hash.to_string(),
        });
    }

    if users.is_empty() {
        return Err(ConfigError::Missing("LOCAL_AUTH_USERS"));
    }
    Ok(users)
}

fn parse_token_ttl(raw: Option<String>) -> Result<u64, ConfigError> {
    match raw.as_deref() {
        None | Some("") => Ok(DEFAULT_LOCAL_TOKEN_TTL_SECS),
        Some(value) => value
            .parse::<u64>()
            .ok()
            .filter(|ttl| (MIN_LOCAL_TOKEN_TTL_SECS..=MAX_LOCAL_TOKEN_TTL_SECS).contains(ttl))
            .ok_or_else(|| {
                ConfigError::Invalid(
                    "LOCAL_AUTH_TOKEN_TTL_SECONDS",
                    format!(
                        "must be an integer between {MIN_LOCAL_TOKEN_TTL_SECS} and {MAX_LOCAL_TOKEN_TTL_SECS}"
                    ),
                )
            }),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use argon2::password_hash::PasswordHasher;
    use argon2::{Algorithm, Argon2, Params, Version};

    use super::*;

    const SECRET_32: &str = "0123456789abcdef0123456789abcdef";

    fn cheap_hash_with(password: &str, m: u32, t: u32, p: u32) -> String {
        Argon2::new(
            Algorithm::Argon2id,
            Version::V0x13,
            Params::new(m, t, p, None).unwrap(),
        )
        .hash_password(password.as_bytes())
        .unwrap()
        .to_string()
    }

    fn cheap_hash(password: &str) -> String {
        cheap_hash_with(password, 8, 1, 1)
    }

    fn base(extra: &[(&str, &str)]) -> HashMap<String, String> {
        let mut vars: HashMap<String, String> = [
            ("DATABASE_URL", "postgres://unused"),
            ("FRONTEND_ORIGIN", "http://localhost:4200"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
        for (k, v) in extra {
            vars.insert(k.to_string(), v.to_string());
        }
        vars
    }

    fn local(extra: &[(&str, &str)]) -> HashMap<String, String> {
        let users = format!("alice@example.com:{}", cheap_hash("pw"));
        let mut vars = base(&[
            ("AUTH_MODE", "local"),
            ("LOCAL_AUTH_SECRET", SECRET_32),
            ("LOCAL_AUTH_USERS", &users),
        ]);
        for (k, v) in extra {
            vars.insert(k.to_string(), v.to_string());
        }
        vars
    }

    fn load(vars: &HashMap<String, String>) -> Result<Config, ConfigError> {
        Config::from_lookup(|k| vars.get(k).cloned())
    }

    fn without(mut vars: HashMap<String, String>, key: &str) -> HashMap<String, String> {
        vars.remove(key);
        vars
    }

    fn local_config(vars: &HashMap<String, String>) -> LocalAuthConfig {
        match load(vars).expect("config should load").auth {
            AuthConfig::Local(local) => local,
            other => panic!("expected local mode, got {other:?}"),
        }
    }

    fn assert_users_error_at(vars: &HashMap<String, String>, position: usize) -> String {
        match load(vars) {
            Err(ConfigError::Invalid("LOCAL_AUTH_USERS", message)) => {
                assert!(
                    message.contains(&format!("entry {position}")),
                    "message should name entry {position}: {message}"
                );
                message
            }
            other => panic!("expected Invalid(LOCAL_AUTH_USERS), got {other:?}"),
        }
    }

    #[test]
    fn auth_mode_defaults_to_supabase_when_unset_or_empty() {
        for vars in [
            base(&[("SUPABASE_JWT_SECRET", "s")]),
            base(&[("SUPABASE_JWT_SECRET", "s"), ("AUTH_MODE", "")]),
        ] {
            let config = load(&vars).unwrap();
            assert_eq!(config.auth.mode(), AuthMode::Supabase);
        }
    }

    #[test]
    fn auth_mode_accepts_supabase_and_local() {
        let supabase = load(&base(&[
            ("AUTH_MODE", "supabase"),
            ("SUPABASE_JWT_SECRET", "s"),
        ]))
        .unwrap();
        assert_eq!(supabase.auth.mode(), AuthMode::Supabase);
        assert!(matches!(
            supabase.auth,
            AuthConfig::Supabase { ref jwt_secret } if jwt_secret == "s"
        ));

        let local_cfg = load(&local(&[])).unwrap();
        assert_eq!(local_cfg.auth.mode(), AuthMode::Local);
        assert_eq!(AuthMode::Local.as_str(), "local");
        assert_eq!(AuthMode::Supabase.as_str(), "supabase");
    }

    #[test]
    fn auth_mode_rejects_unknown_value() {
        for value in ["Local", "ldap"] {
            let vars = local(&[("AUTH_MODE", value), ("SUPABASE_JWT_SECRET", "s")]);
            match load(&vars) {
                Err(ConfigError::Invalid("AUTH_MODE", message)) => {
                    assert!(message.contains("supabase"), "{message}");
                    assert!(message.contains("local"), "{message}");
                    assert!(message.contains(value), "{message}");
                }
                other => panic!("expected Invalid(AUTH_MODE) for {value}, got {other:?}"),
            }
        }
    }

    #[test]
    fn supabase_mode_requires_supabase_jwt_secret() {
        for vars in [base(&[]), base(&[("SUPABASE_JWT_SECRET", "")])] {
            assert!(matches!(
                load(&vars),
                Err(ConfigError::Missing("SUPABASE_JWT_SECRET"))
            ));
        }
    }

    #[test]
    fn supabase_mode_ignores_invalid_local_vars() {
        let vars = base(&[
            ("SUPABASE_JWT_SECRET", "s"),
            ("LOCAL_AUTH_SECRET", "short"),
            ("LOCAL_AUTH_USERS", "garbage without colon"),
            ("LOCAL_AUTH_TOKEN_TTL_SECONDS", "0"),
        ]);
        assert_eq!(load(&vars).unwrap().auth.mode(), AuthMode::Supabase);
    }

    #[test]
    fn local_mode_does_not_require_supabase_jwt_secret() {
        let vars = without(local(&[]), "SUPABASE_JWT_SECRET");
        assert_eq!(load(&vars).unwrap().auth.mode(), AuthMode::Local);
    }

    #[test]
    fn local_mode_requires_secret() {
        for vars in [
            without(local(&[]), "LOCAL_AUTH_SECRET"),
            local(&[("LOCAL_AUTH_SECRET", "")]),
        ] {
            assert!(matches!(
                load(&vars),
                Err(ConfigError::Missing("LOCAL_AUTH_SECRET"))
            ));
        }
    }

    #[test]
    fn local_mode_rejects_short_secret() {
        let short = &SECRET_32[..31];
        assert!(matches!(
            load(&local(&[("LOCAL_AUTH_SECRET", short)])),
            Err(ConfigError::Invalid("LOCAL_AUTH_SECRET", _))
        ));
        assert!(load(&local(&[("LOCAL_AUTH_SECRET", SECRET_32)])).is_ok());
    }

    #[test]
    fn local_users_parse_multiple_entries_with_whitespace_and_trailing_separator() {
        let alice = cheap_hash("a");
        let bob = cheap_hash("b");
        let carol = cheap_hash("c");
        assert!(alice.contains(','), "PHC string carries `,` in its params");

        let raw = format!(
            "  Alice@Example.com : {alice} ;\n bob@example.com:{bob}\n;;carol@example.com:{carol};  "
        );
        let config = local_config(&local(&[("LOCAL_AUTH_USERS", &raw)]));
        let emails: Vec<&str> = config.users.iter().map(|u| u.email.as_str()).collect();
        assert_eq!(
            emails,
            ["alice@example.com", "bob@example.com", "carol@example.com"]
        );
        let hashes: Vec<&str> = config
            .users
            .iter()
            .map(|u| u.password_hash.as_str())
            .collect();
        assert_eq!(hashes, [alice.as_str(), bob.as_str(), carol.as_str()]);
    }

    #[test]
    fn local_mode_requires_at_least_one_user() {
        for vars in [
            without(local(&[]), "LOCAL_AUTH_USERS"),
            local(&[("LOCAL_AUTH_USERS", "")]),
            local(&[("LOCAL_AUTH_USERS", " ; ")]),
        ] {
            assert!(matches!(
                load(&vars),
                Err(ConfigError::Missing("LOCAL_AUTH_USERS"))
            ));
        }
    }

    #[test]
    fn local_users_reject_malformed_entry_naming_position() {
        let good = format!("alice@example.com:{}", cheap_hash("a"));
        let argon2i = Argon2::new(
            Algorithm::Argon2i,
            Version::V0x13,
            Params::new(8, 1, 1, None).unwrap(),
        )
        .hash_password(b"b")
        .unwrap()
        .to_string();
        let bob_hash = cheap_hash("b");
        let second_entries = [
            "bob@example.com".to_string(),
            format!(":{bob_hash}"),
            format!("bob.example.com:{bob_hash}"),
            "bob@example.com:not-a-phc-string".to_string(),
            format!("bob@example.com:{argon2i}"),
            "bob@example.com:v=19,t=2,p=1".to_string(),
        ];
        for second in second_entries {
            let raw = format!("{good};{second}");
            assert_users_error_at(&local(&[("LOCAL_AUTH_USERS", &raw)]), 2);
        }
        let message = assert_users_error_at(
            &local(&[(
                "LOCAL_AUTH_USERS",
                &format!("{good};bob@example.com:v=19,t=2,p=1"),
            )]),
            2,
        );
        assert!(message.contains("single quotes"), "{message}");
    }

    #[test]
    fn local_users_reject_duplicate_email_case_insensitively() {
        let raw = format!(
            "alice@example.com:{};ALICE@Example.com:{}",
            cheap_hash("a"),
            cheap_hash("b")
        );
        let message = assert_users_error_at(&local(&[("LOCAL_AUTH_USERS", &raw)]), 2);
        assert!(message.contains("duplicate"), "{message}");
    }

    #[test]
    fn config_errors_never_echo_secret_or_hash() {
        let short_secret = "this-secret-is-short-31-bytes!!";
        assert_eq!(short_secret.len(), 31);
        let err = load(&local(&[("LOCAL_AUTH_SECRET", short_secret)])).unwrap_err();
        assert!(!err.to_string().contains(short_secret), "{err}");

        let good_hash = cheap_hash("a");
        let bad_hashes = [
            "not-a-phc-string-sentinel".to_string(),
            "v=19,t=2,p=1".to_string(),
            good_hash.replace("$argon2id$", "$argon2i$"),
        ];
        for bad in bad_hashes {
            let raw = format!("alice@example.com:{good_hash};bob@example.com:{bad}");
            let err = load(&local(&[("LOCAL_AUTH_USERS", &raw)])).unwrap_err();
            let text = err.to_string();
            assert!(!text.contains(&bad), "{text}");
            assert!(!text.contains(&good_hash), "{text}");
        }

        let dup = format!("alice@example.com:{good_hash};alice@example.com:{good_hash}");
        let text = load(&local(&[("LOCAL_AUTH_USERS", &dup)]))
            .unwrap_err()
            .to_string();
        assert!(!text.contains(&good_hash), "{text}");
    }

    #[test]
    fn local_token_ttl_defaults_to_3600() {
        for vars in [
            without(local(&[]), "LOCAL_AUTH_TOKEN_TTL_SECONDS"),
            local(&[("LOCAL_AUTH_TOKEN_TTL_SECONDS", "")]),
        ] {
            assert_eq!(local_config(&vars).token_ttl_secs, 3600);
        }
    }

    #[test]
    fn local_token_ttl_rejects_out_of_range_or_non_integer() {
        for bad in ["59", "86401", "abc", "-1", "1.5"] {
            assert!(
                matches!(
                    load(&local(&[("LOCAL_AUTH_TOKEN_TTL_SECONDS", bad)])),
                    Err(ConfigError::Invalid("LOCAL_AUTH_TOKEN_TTL_SECONDS", _))
                ),
                "{bad} should be rejected"
            );
        }
        for (good, expected) in [("60", 60), ("86400", 86_400)] {
            let config = local_config(&local(&[("LOCAL_AUTH_TOKEN_TTL_SECONDS", good)]));
            assert_eq!(config.token_ttl_secs, expected);
        }
    }

    #[test]
    fn dummy_hash_matches_first_user_params() {
        let raw = format!(
            "first@example.com:{};second@example.com:{}",
            cheap_hash_with("a", 16, 3, 2),
            cheap_hash_with("b", 8, 1, 1)
        );
        let config = local_config(&local(&[("LOCAL_AUTH_USERS", &raw)]));
        let params = parse_argon2id_hash(&config.dummy_hash).unwrap();
        assert_eq!(
            (params.m_cost(), params.t_cost(), params.p_cost()),
            (16, 3, 2)
        );
        assert!(config.dummy_hash.starts_with("$argon2id$"));
    }

    #[test]
    fn local_auth_debug_redacts_secret_and_hashes() {
        let config = load(&local(&[])).unwrap();
        let AuthConfig::Local(ref local_cfg) = config.auth else {
            panic!("expected local mode");
        };
        let debug = format!("{config:?}");
        assert!(!debug.contains(SECRET_32), "{debug}");
        assert!(
            !debug.contains(&local_cfg.users[0].password_hash),
            "{debug}"
        );
        assert!(!debug.contains(&local_cfg.dummy_hash), "{debug}");
        assert!(debug.contains("alice@example.com"), "{debug}");
    }
}
