use axum::extract::{Path, State};
use axum::Json;

use crate::app::AppState;
use crate::auth::extractor::AuthUser;
use crate::error::ApiError;
use crate::harness::reader::{
    list_projects, read_project_state, HarnessStateResponse, ProjectSummary,
};

pub async fn get_projects(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Result<Json<Vec<ProjectSummary>>, ApiError> {
    let projects = list_projects(&state.pool).await?;
    Ok(Json(projects))
}

pub async fn get_project_state(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(slug): Path<String>,
) -> Result<Json<HarnessStateResponse>, ApiError> {
    let response = read_project_state(&state.pool, &slug).await?;
    Ok(Json(response))
}
