use axum::extract::State;
use axum::Json;

use crate::app::AppState;
use crate::auth::extractor::SupabaseUser;
use crate::error::ApiError;
use crate::harness::reader::{read_harness_state, HarnessStateResponse};

pub async fn get_harness_state(
    State(state): State<AppState>,
    _user: SupabaseUser,
) -> Result<Json<HarnessStateResponse>, ApiError> {
    let project_slug = &state.config.project_slug;
    let response = read_harness_state(&state.pool, project_slug).await?;
    Ok(Json(response))
}
