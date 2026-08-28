use axum::extract::FromRequestParts;
use axum::http::request::Parts;

use crate::app::AppState;
use crate::auth::jwt::{verify_supabase_jwt, Claims};
use crate::error::ApiError;

pub struct SupabaseUser(pub Claims);

impl FromRequestParts<AppState> for SupabaseUser {
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

        let claims = verify_supabase_jwt(&state.config.supabase_jwt_secret, token)?;
        Ok(SupabaseUser(claims))
    }
}
