use axum::extract::rejection::QueryRejection;
use axum::extract::{Path, Query, State};
use axum::Json;
use serde::Deserialize;

use crate::app::AppState;
use crate::auth::extractor::AuthUser;
use crate::error::ApiError;
use crate::harness::reader::{
    list_projects, read_dashboard, read_feature_agent_usage, read_feature_log,
    read_features_by_status, read_project_state, AgentUsageResponse, DashboardResponse,
    FeatureByStatus, FeatureLogResponse, HarnessStateResponse, ProjectSummary,
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

pub async fn get_feature_log(
    State(state): State<AppState>,
    _user: AuthUser,
    Path((slug, name)): Path<(String, String)>,
) -> Result<Json<FeatureLogResponse>, ApiError> {
    let response = read_feature_log(&state.pool, &slug, &name).await?;
    Ok(Json(response))
}

pub async fn get_feature_agent_usage(
    State(state): State<AppState>,
    _user: AuthUser,
    Path((slug, name)): Path<(String, String)>,
) -> Result<Json<AgentUsageResponse>, ApiError> {
    let response = read_feature_agent_usage(&state.pool, &slug, &name).await?;
    Ok(Json(response))
}

pub async fn get_dashboard(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Result<Json<DashboardResponse>, ApiError> {
    let response = read_dashboard(&state.pool).await?;
    Ok(Json(response))
}

#[derive(Debug, Deserialize)]
pub struct FeaturesByStatusQuery {
    status: Option<String>,
}

pub async fn get_features_by_status(
    State(state): State<AppState>,
    _user: AuthUser,
    query: Result<Query<FeaturesByStatusQuery>, QueryRejection>,
) -> Result<Json<Vec<FeatureByStatus>>, ApiError> {
    let Query(query) = query.map_err(|_| ApiError::BadRequest)?;
    let status = query.status.ok_or(ApiError::BadRequest)?;
    let features = read_features_by_status(&state.pool, &status).await?;
    Ok(Json(features))
}
