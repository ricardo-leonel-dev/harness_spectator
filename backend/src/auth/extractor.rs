use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::app::AppState;
use crate::auth::jwt::verify_supabase_jwt;
use crate::auth::local_token::verify_local_jwt;
use crate::config::AuthConfig;
use crate::error::ApiError;

pub struct AuthUser {
    pub sub: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .ok_or(ApiError::Unauthorized)?;
        let header_str = header.to_str().map_err(|_| ApiError::Unauthorized)?;
        let token = header_str
            .strip_prefix("Bearer ")
            .or_else(|| header_str.strip_prefix("bearer "))
            .ok_or(ApiError::Unauthorized)?;

        let sub = match &state.config.auth {
            AuthConfig::Supabase { jwt_secret } => verify_supabase_jwt(jwt_secret, token)?.sub,
            AuthConfig::Local(local) => verify_local_jwt(&local.secret, token)?.sub,
        };
        Ok(AuthUser { sub })
    }
}
