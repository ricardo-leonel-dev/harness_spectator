use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

use crate::error::ApiError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
    pub aud: String,
}

pub fn verify_supabase_jwt(secret: &str, token: &str) -> Result<Claims, ApiError> {
    let mut validation = Validation::new(jsonwebtoken::Algorithm::HS256);
    validation.set_audience(&["authenticated"]);
    validation.validate_exp = true;

    let key = DecodingKey::from_secret(secret.as_bytes());
    let data = decode::<Claims>(token, &key, &validation).map_err(|_| ApiError::Unauthorized)?;

    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_token(secret: &str, exp_offset: i64, aud: &str) -> String {
        use jsonwebtoken::{encode, EncodingKey, Header};

        let exp = (chrono::Utc::now().timestamp() + exp_offset) as usize;
        let claims = Claims {
            sub: "user-1".to_string(),
            exp,
            aud: aud.to_string(),
        };
        encode(
            &Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    }

    #[test]
    fn verifies_valid_token() {
        let secret = "test-secret";
        let token = make_token(secret, 3600, "authenticated");
        let claims = verify_supabase_jwt(secret, &token).expect("valid token should verify");
        assert_eq!(claims.sub, "user-1");
        assert_eq!(claims.aud, "authenticated");
    }

    #[test]
    fn rejects_wrong_signature() {
        let token = make_token("other-secret", 3600, "authenticated");
        let err = verify_supabase_jwt("test-secret", &token).unwrap_err();
        assert!(matches!(err, ApiError::Unauthorized));
    }

    #[test]
    fn rejects_expired_token() {
        let secret = "test-secret";
        let token = make_token(secret, -3600, "authenticated");
        let err = verify_supabase_jwt(secret, &token).unwrap_err();
        assert!(matches!(err, ApiError::Unauthorized));
    }

    #[test]
    fn rejects_wrong_audience() {
        let secret = "test-secret";
        let token = make_token(secret, 3600, "anon");
        let err = verify_supabase_jwt(secret, &token).unwrap_err();
        assert!(matches!(err, ApiError::Unauthorized));
    }
}
