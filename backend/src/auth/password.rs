use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use argon2::{Algorithm, Argon2, Params, PasswordHash, Version, ARGON2ID_IDENT};
use thiserror::Error;

const DUMMY_PASSWORD: &[u8] = b"harness-spectator-dummy-password";

#[derive(Debug, Error)]
#[error("password hashing failed")]
pub struct PasswordError;

pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|hash| hash.to_string())
        .map_err(|_| PasswordError)
}

pub fn verify_password(password: &str, phc: &str) -> bool {
    let Ok(hash) = PasswordHash::new(phc) else {
        return false;
    };
    if hash.algorithm != ARGON2ID_IDENT {
        return false;
    }
    Argon2::default()
        .verify_password(password.as_bytes(), &hash)
        .is_ok()
}

pub fn parse_argon2id_hash(phc: &str) -> Result<Params, PasswordError> {
    let hash = PasswordHash::new(phc).map_err(|_| PasswordError)?;
    if hash.algorithm != ARGON2ID_IDENT || hash.salt.is_none() || hash.hash.is_none() {
        return Err(PasswordError);
    }
    Params::try_from(&hash).map_err(|_| PasswordError)
}

pub fn dummy_hash_like(phc: &str) -> Result<String, PasswordError> {
    let params = parse_argon2id_hash(phc)?;
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password(DUMMY_PASSWORD)
        .map(|hash| hash.to_string())
        .map_err(|_| PasswordError)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cheap_hash(password: &str) -> String {
        let params = Params::new(8, 1, 1, None).unwrap();
        Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
            .hash_password(password.as_bytes())
            .unwrap()
            .to_string()
    }

    #[test]
    fn hash_password_round_trips() {
        let hash = hash_password("correct horse").unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_password("correct horse", &hash));
    }

    #[test]
    fn verify_password_rejects_wrong_password() {
        let hash = cheap_hash("correct horse");
        assert!(verify_password("correct horse", &hash));
        assert!(!verify_password("battery staple", &hash));
    }

    #[test]
    fn verify_password_rejects_unparseable_hash() {
        assert!(!verify_password("pw", "not-a-hash"));
    }

    #[test]
    fn parse_argon2id_hash_rejects_other_algorithms_and_garbage() {
        let argon2i = Argon2::new(
            Algorithm::Argon2i,
            Version::V0x13,
            Params::new(8, 1, 1, None).unwrap(),
        )
        .hash_password(b"pw")
        .unwrap()
        .to_string();
        assert!(argon2i.starts_with("$argon2i$"));
        assert!(parse_argon2id_hash(&argon2i).is_err());
        assert!(parse_argon2id_hash("v=19,t=2,p=1").is_err());
        assert!(parse_argon2id_hash("").is_err());
        assert!(parse_argon2id_hash(&cheap_hash("pw")).is_ok());
    }

    #[test]
    fn dummy_hash_like_copies_parameters_with_fresh_salt() {
        let source = Argon2::new(
            Algorithm::Argon2id,
            Version::V0x13,
            Params::new(16, 3, 2, None).unwrap(),
        )
        .hash_password(b"pw")
        .unwrap()
        .to_string();
        let dummy = dummy_hash_like(&source).unwrap();
        let params = parse_argon2id_hash(&dummy).unwrap();
        assert_eq!(
            (params.m_cost(), params.t_cost(), params.p_cost()),
            (16, 3, 2)
        );
        assert_ne!(
            PasswordHash::new(&dummy).unwrap().salt,
            PasswordHash::new(&source).unwrap().salt
        );
    }
}
