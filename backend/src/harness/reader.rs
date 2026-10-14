use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use sqlx::PgPool;

use crate::error::ApiError;

#[derive(Debug, Serialize)]
pub struct ProjectSummary {
    pub slug: String,
    pub description: String,
    pub counts: FeatureCounts,
}

#[derive(Debug, Serialize)]
pub struct FeatureCounts {
    pub total: i64,
    pub done: i64,
    #[serde(rename = "inProgress")]
    pub in_progress: i64,
    pub blocked: i64,
}

#[derive(Debug, FromRow)]
struct ProjectSummaryDbRow {
    slug: String,
    description: String,
    total: i64,
    done: i64,
    in_progress: i64,
    blocked: i64,
}

impl From<ProjectSummaryDbRow> for ProjectSummary {
    fn from(r: ProjectSummaryDbRow) -> Self {
        Self {
            slug: r.slug,
            description: r.description,
            counts: FeatureCounts {
                total: r.total,
                done: r.done,
                in_progress: r.in_progress,
                blocked: r.blocked,
            },
        }
    }
}

#[derive(Debug, Serialize)]
pub struct HarnessStateResponse {
    pub project: ProjectInfo,
    pub features: Vec<FeatureRow>,
    #[serde(rename = "openSession")]
    pub open_session: Option<OpenSessionInfo>,
    #[serde(rename = "blockedFeatures")]
    pub blocked_features: Vec<BlockedFeatureInfo>,
}

#[derive(Debug, Serialize)]
pub struct ProjectInfo {
    pub slug: String,
    pub description: String,
}

#[derive(Debug, FromRow)]
struct FeatureDbRow {
    feature_number: i32,
    name: String,
    title: String,
    status: String,
    sdd: bool,
}

#[derive(Debug, Serialize)]
pub struct FeatureRow {
    #[serde(rename = "featureNumber")]
    pub feature_number: i32,
    pub name: String,
    pub title: String,
    pub status: String,
    pub sdd: bool,
}

impl From<FeatureDbRow> for FeatureRow {
    fn from(r: FeatureDbRow) -> Self {
        Self {
            feature_number: r.feature_number,
            name: r.name,
            title: r.title,
            status: r.status,
            sdd: r.sdd,
        }
    }
}

#[derive(Debug, FromRow)]
struct OpenSessionDbRow {
    agent: String,
    feature: Option<String>,
    started_at: DateTime<Utc>,
    next_step: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OpenSessionInfo {
    pub agent: String,
    pub feature: String,
    #[serde(rename = "startedAt")]
    pub started_at: String,
    #[serde(rename = "nextStep")]
    pub next_step: Option<String>,
}

impl From<OpenSessionDbRow> for OpenSessionInfo {
    fn from(r: OpenSessionDbRow) -> Self {
        Self {
            agent: r.agent,
            feature: r.feature.unwrap_or_default(),
            started_at: r.started_at.to_rfc3339(),
            next_step: r.next_step,
        }
    }
}

#[derive(Debug, FromRow)]
struct BlockedFeatureDbRow {
    name: String,
    note: String,
}

#[derive(Debug, Serialize)]
pub struct BlockedFeatureInfo {
    pub name: String,
    pub note: String,
}

impl From<BlockedFeatureDbRow> for BlockedFeatureInfo {
    fn from(r: BlockedFeatureDbRow) -> Self {
        Self {
            name: r.name,
            note: r.note,
        }
    }
}

pub async fn list_projects(pool: &PgPool) -> Result<Vec<ProjectSummary>, ApiError> {
    let rows: Vec<ProjectSummaryDbRow> = sqlx::query_as(
        "SELECT p.slug,
                COALESCE(p.description, '') AS description,
                COUNT(f.id) AS total,
                COUNT(f.id) FILTER (WHERE f.status = 'done') AS done,
                COUNT(f.id) FILTER (WHERE f.status = 'in_progress') AS in_progress,
                COUNT(f.id) FILTER (WHERE f.status = 'blocked') AS blocked
         FROM projects p
         LEFT JOIN features f ON f.project_id = p.id AND f.deleted_at IS NULL
         WHERE p.deleted_at IS NULL
         GROUP BY p.id, p.slug, p.description
         ORDER BY p.slug ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn read_project_state(
    pool: &PgPool,
    project_slug: &str,
) -> Result<HarnessStateResponse, ApiError> {
    let project_row: Option<(sqlx::types::Uuid, String, String)> = sqlx::query_as(
        "SELECT id, slug, COALESCE(description, '')
         FROM projects
         WHERE slug = $1 AND deleted_at IS NULL",
    )
    .bind(project_slug)
    .fetch_optional(pool)
    .await?;

    let (project_id, slug, description) = project_row.ok_or(ApiError::NotFound)?;

    let features: Vec<FeatureDbRow> = sqlx::query_as(
        "SELECT feature_number, name, title, status::text AS status, sdd
         FROM features
         WHERE project_id = $1
           AND deleted_at IS NULL
         ORDER BY feature_number ASC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    let open_session: Option<OpenSessionDbRow> = sqlx::query_as(
        "SELECT sl.agent, f.name AS feature, sl.started_at,
                NULLIF(array_to_string(sl.next_step, ' | '), '') AS next_step
         FROM session_log sl
         LEFT JOIN features f ON f.id = sl.feature_id AND f.deleted_at IS NULL
         WHERE sl.project_id = $1
           AND sl.closed_at IS NULL
           AND sl.paused_at IS NULL
           AND sl.deleted_at IS NULL
         ORDER BY sl.started_at DESC, sl.id DESC
         LIMIT 1",
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await?;

    // A blocked feature's note is the latest entry of its latest session — the
    // mirror has no dedicated blocked-features table.
    let blocked_features: Vec<BlockedFeatureDbRow> = sqlx::query_as(
        "SELECT f.name,
                COALESCE((
                  SELECT e.entry
                  FROM session_log_entries e
                  WHERE e.deleted_at IS NULL
                    AND e.session_id = (
                      SELECT sl.id
                      FROM session_log sl
                      WHERE sl.feature_id = f.id
                        AND sl.deleted_at IS NULL
                      ORDER BY sl.started_at DESC, sl.id DESC
                      LIMIT 1
                    )
                  ORDER BY e.created_at DESC, e.id DESC
                  LIMIT 1
                ), '') AS note
         FROM features f
         WHERE f.project_id = $1
           AND f.status = 'blocked'
           AND f.deleted_at IS NULL
         ORDER BY f.feature_number ASC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(HarnessStateResponse {
        project: ProjectInfo { slug, description },
        features: features.into_iter().map(Into::into).collect(),
        open_session: open_session.map(Into::into),
        blocked_features: blocked_features.into_iter().map(Into::into).collect(),
    })
}
