use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::config::LocalAuthConfig;
use crate::error::ApiError;

pub const LOCAL_TOKEN_ISSUER: &str = "harness-spectator";
pub const LOCAL_TOKEN_AUDIENCE: &str = "harness-spectator-local";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalClaims {
    pub sub: String,
    pub email: String,
    pub iss: String,
    pub aud: String,
    pub iat: u64,
    pub exp: u64,
}

pub fn issue_local_token(
    config: &LocalAuthConfig,
    email: &str,
    now: u64,
) -> Result<(String, u64), ApiError> {
    let exp = now + config.token_ttl_secs;
    let claims = LocalClaims {
        sub: email.to_string(),
        email: email.to_string(),
        iss: LOCAL_TOKEN_ISSUER.to_string(),
        aud: LOCAL_TOKEN_AUDIENCE.to_string(),
        iat: now,
        exp,
    };
    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(config.secret.as_bytes()),
    )
    .map_err(|err| {
        tracing::error!(?err, "failed to sign local token");
        ApiError::Internal
    })?;
    Ok((token, exp))
}

pub fn verify_local_jwt(secret: &str, token: &str) -> Result<LocalClaims, ApiError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&[LOCAL_TOKEN_AUDIENCE]);
    validation.set_issuer(&[LOCAL_TOKEN_ISSUER]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    validation.leeway = 0;

    let key = DecodingKey::from_secret(secret.as_bytes());
    let data =
        decode::<LocalClaims>(token, &key, &validation).map_err(|_| ApiError::Unauthorized)?;
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "local-secret-local-secret-local-secret";

    fn config() -> LocalAuthConfig {
        LocalAuthConfig {
            secret: SECRET.to_string(),
            users: Vec::new(),
            token_ttl_secs: 900,
            dummy_hash: String::new(),
        }
    }

    fn now() -> u64 {
        chrono::Utc::now().timestamp() as u64
    }

    fn sign(secret: &str, claims: &LocalClaims) -> String {
        encode(
            &Header::new(Algorithm::HS256),
            claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    }

    fn claims(exp: u64) -> LocalClaims {
        LocalClaims {
            sub: "alice@example.com".to_string(),
            email: "alice@example.com".to_string(),
            iss: LOCAL_TOKEN_ISSUER.to_string(),
            aud: LOCAL_TOKEN_AUDIENCE.to_string(),
            iat: now(),
            exp,
        }
    }

    #[test]
    fn issue_local_token_sets_claims() {
        let (token, exp) = issue_local_token(&config(), "alice@example.com", 1_000_000).unwrap();
        assert_eq!(exp, 1_000_900);

        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = false;
        validation.validate_aud = false;
        let data = decode::<serde_json::Value>(
            &token,
            &DecodingKey::from_secret(SECRET.as_bytes()),
            &validation,
        )
        .unwrap();
        assert_eq!(data.header.alg, Algorithm::HS256);
        assert_eq!(
            data.claims,
            serde_json::json!({
                "sub": "alice@example.com",
                "email": "alice@example.com",
                "iss": "harness-spectator",
                "aud": "harness-spectator-local",
                "iat": 1_000_000,
                "exp": 1_000_900,
            })
        );
    }

    #[test]
    fn verify_local_jwt_accepts_issued_token() {
        let (token, _) = issue_local_token(&config(), "alice@example.com", now()).unwrap();
        let claims = verify_local_jwt(SECRET, &token).unwrap();
        assert_eq!(claims.sub, "alice@example.com");
    }

    #[test]
    fn verify_local_jwt_rejects_supabase_audience() {
        let mut c = claims(now() + 600);
        c.aud = "authenticated".to_string();
        assert!(matches!(
            verify_local_jwt(SECRET, &sign(SECRET, &c)),
            Err(ApiError::Unauthorized)
        ));
    }

    #[test]
    fn verify_local_jwt_rejects_wrong_issuer() {
        let mut c = claims(now() + 600);
        c.iss = "https://example.supabase.co/auth/v1".to_string();
        assert!(matches!(
            verify_local_jwt(SECRET, &sign(SECRET, &c)),
            Err(ApiError::Unauthorized)
        ));
    }

    #[test]
    fn verify_local_jwt_rejects_expired_token_without_leeway() {
        let c = claims(now() - 10);
        assert!(matches!(
            verify_local_jwt(SECRET, &sign(SECRET, &c)),
            Err(ApiError::Unauthorized)
        ));
    }

    #[test]
    fn verify_local_jwt_rejects_other_secret() {
        let c = claims(now() + 600);
        let token = sign("another-secret-another-secret-another", &c);
        assert!(matches!(
            verify_local_jwt(SECRET, &token),
            Err(ApiError::Unauthorized)
        ));
    }
}
