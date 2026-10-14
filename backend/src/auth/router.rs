use axum::extract::rejection::JsonRejection;
use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::auth::local_token::issue_local_token;
use crate::auth::password::verify_password;
use crate::config::{normalize_email, AuthConfig};
use crate::error::ApiError;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "expiresAt")]
    pub expires_at: u64,
}

#[derive(Serialize)]
pub struct AuthModeResponse {
    pub mode: &'static str,
}

pub async fn get_auth_mode(State(state): State<AppState>) -> Json<AuthModeResponse> {
    Json(AuthModeResponse {
        mode: state.config.auth.mode().as_str(),
    })
}

pub async fn post_login(
    State(state): State<AppState>,
    payload: Result<Json<LoginRequest>, JsonRejection>,
) -> Result<Json<LoginResponse>, ApiError> {
    let AuthConfig::Local(local) = &state.config.auth else {
        return Err(ApiError::NotFound);
    };
    let Json(request) = payload.map_err(|_| ApiError::BadRequest)?;

    let email = normalize_email(&request.email);
    let user_hash = local
        .users
        .iter()
        .find(|user| user.email == email)
        .map(|user| user.password_hash.clone());
    let known_user = user_hash.is_some();
    let hash = user_hash.unwrap_or_else(|| local.dummy_hash.clone());
    let password = request.password;

    let verified = tokio::task::spawn_blocking(move || verify_password(&password, &hash))
        .await
        .map_err(|err| {
            tracing::error!(?err, "password verification task failed");
            ApiError::Internal
        })?;

    if !(known_user && verified) {
        tracing::info!("local login rejected");
        return Err(ApiError::Unauthorized);
    }

    let now = chrono::Utc::now().timestamp() as u64;
    let (access_token, expires_at) = issue_local_token(local, &email, now)?;
    tracing::info!(email = %email, "local login succeeded");
    Ok(Json(LoginResponse {
        access_token,
        expires_at,
    }))
}
