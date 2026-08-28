use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use sqlx::PgPool;

use crate::error::ApiError;

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

pub async fn read_harness_state(
    pool: &PgPool,
    project_slug: &str,
) -> Result<HarnessStateResponse, ApiError> {
    let project_row: Option<(String, String)> =
        sqlx::query_as("SELECT slug, description FROM projects WHERE slug = $1")
            .bind(project_slug)
            .fetch_optional(pool)
            .await?;

    let project = match project_row {
        Some((slug, description)) => ProjectInfo { slug, description },
        None => {
            return Ok(HarnessStateResponse {
                project: ProjectInfo {
                    slug: project_slug.to_string(),
                    description: String::new(),
                },
                features: Vec::new(),
                open_session: None,
                blocked_features: Vec::new(),
            })
        }
    };

    let features: Vec<FeatureDbRow> = sqlx::query_as(
        "SELECT feature_number, name, title, status, sdd
         FROM features
         WHERE project_id = (SELECT id FROM projects WHERE slug = $1)
           AND deleted_at IS NULL
         ORDER BY feature_number ASC",
    )
    .bind(project_slug)
    .fetch_all(pool)
    .await?;

    let open_session: Option<OpenSessionDbRow> = sqlx::query_as(
        "SELECT sl.agent, f.name AS feature, sl.started_at,
                (
                  SELECT string_agg(value, ' | ')
                  FROM jsonb_array_elements_text(sl.next_step)
                ) AS next_step
         FROM session_log sl
         LEFT JOIN features f ON f.id = sl.feature_id
         WHERE sl.project_id = (SELECT id FROM projects WHERE slug = $1)
           AND sl.closed_at IS NULL
           AND sl.deleted_at IS NULL
         ORDER BY sl.started_at DESC
         LIMIT 1",
    )
    .bind(project_slug)
    .fetch_optional(pool)
    .await?;

    let blocked_features: Vec<BlockedFeatureDbRow> = sqlx::query_as(
        "SELECT f.name, bf.note
         FROM blocked_features bf
         JOIN features f ON f.id = bf.feature_id
         JOIN projects p ON p.id = f.project_id
         WHERE p.slug = $1
           AND f.deleted_at IS NULL
         ORDER BY bf.blocked_at DESC",
    )
    .bind(project_slug)
    .fetch_all(pool)
    .await?;

    Ok(HarnessStateResponse {
        project,
        features: features.into_iter().map(Into::into).collect(),
        open_session: open_session.map(Into::into),
        blocked_features: blocked_features.into_iter().map(Into::into).collect(),
    })
}
