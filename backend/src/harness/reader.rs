use std::collections::HashMap;

use chrono::{DateTime, TimeDelta, Utc};
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

#[derive(Debug, Serialize)]
pub struct FeatureLogResponse {
    pub feature: FeatureHeader,
    pub sessions: Vec<ProcessLogSession>,
}

#[derive(Debug, Serialize)]
pub struct FeatureHeader {
    #[serde(rename = "featureNumber")]
    pub feature_number: i32,
    pub name: String,
    pub title: String,
    pub status: String,
    pub sdd: bool,
    pub description: Option<String>,
    pub acceptance: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ProcessLogSession {
    #[serde(rename = "localId")]
    pub local_id: i64,
    pub agent: String,
    #[serde(rename = "startedAt")]
    pub started_at: String,
    #[serde(rename = "closedAt")]
    pub closed_at: Option<String>,
    #[serde(rename = "pausedAt")]
    pub paused_at: Option<String>,
    pub plan: Option<Vec<String>>,
    #[serde(rename = "nextStep")]
    pub next_step: Option<Vec<String>>,
    pub changes: Option<Vec<String>>,
    pub verification: Option<String>,
    pub closure: Option<String>,
    pub entries: Vec<ProcessLogEntry>,
}

#[derive(Debug, Serialize)]
pub struct ProcessLogEntry {
    pub entry: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, FromRow)]
struct FeatureHeaderDbRow {
    id: i64,
    feature_number: i32,
    name: String,
    title: String,
    status: String,
    sdd: bool,
    description: Option<String>,
    acceptance: Vec<String>,
}

impl From<FeatureHeaderDbRow> for FeatureHeader {
    fn from(r: FeatureHeaderDbRow) -> Self {
        Self {
            feature_number: r.feature_number,
            name: r.name,
            title: r.title,
            status: r.status,
            sdd: r.sdd,
            description: r.description,
            acceptance: r.acceptance,
        }
    }
}

#[derive(Debug, FromRow)]
struct ProcessLogSessionDbRow {
    id: i64,
    local_id: i64,
    agent: String,
    started_at: DateTime<Utc>,
    closed_at: Option<DateTime<Utc>>,
    paused_at: Option<DateTime<Utc>>,
    plan: Option<Vec<String>>,
    next_step: Option<Vec<String>>,
    changes: Option<Vec<String>>,
    verification: Option<String>,
    closure: Option<String>,
}

impl From<ProcessLogSessionDbRow> for ProcessLogSession {
    fn from(r: ProcessLogSessionDbRow) -> Self {
        Self {
            local_id: r.local_id,
            agent: r.agent,
            started_at: r.started_at.to_rfc3339(),
            closed_at: r.closed_at.map(|t| t.to_rfc3339()),
            paused_at: r.paused_at.map(|t| t.to_rfc3339()),
            plan: r.plan,
            next_step: r.next_step,
            changes: r.changes,
            verification: r.verification,
            closure: r.closure,
            entries: Vec::new(),
        }
    }
}

#[derive(Debug, FromRow)]
struct ProcessLogEntryDbRow {
    session_id: i64,
    entry: String,
    created_at: DateTime<Utc>,
}

const TOP_PROJECTS_LIMIT: usize = 10;

#[derive(Debug, Serialize)]
pub struct DashboardResponse {
    pub overall: OverallProgress,
    #[serde(rename = "topProjects")]
    pub top_projects: Vec<ProjectProgress>,
}

#[derive(Debug, Serialize)]
pub struct OverallProgress {
    pub done: i64,
    pub total: i64,
    pub percentage: f64,
    #[serde(rename = "byStatus")]
    pub by_status: StatusBreakdown,
}

#[derive(Debug, Default, Serialize)]
pub struct StatusBreakdown {
    pub pending: i64,
    #[serde(rename = "specDrafting")]
    pub spec_drafting: i64,
    #[serde(rename = "specReady")]
    pub spec_ready: i64,
    #[serde(rename = "inProgress")]
    pub in_progress: i64,
    pub blocked: i64,
    pub done: i64,
}

#[derive(Debug, Serialize)]
pub struct ProjectProgress {
    pub slug: String,
    pub done: i64,
    pub total: i64,
    pub percentage: f64,
}

#[derive(Debug, FromRow)]
struct ProjectStatusCountsDbRow {
    slug: String,
    pending: i64,
    spec_drafting: i64,
    spec_ready: i64,
    in_progress: i64,
    blocked: i64,
    done: i64,
}

/// Percentage in hundredths, rounded half-up. `0` when `total == 0`.
fn completion_hundredths(done: i64, total: i64) -> i64 {
    if total == 0 {
        0
    } else {
        (done * 20000 + total) / (2 * total)
    }
}

pub async fn read_dashboard(pool: &PgPool) -> Result<DashboardResponse, ApiError> {
    let rows: Vec<ProjectStatusCountsDbRow> = sqlx::query_as(
        "SELECT p.slug,
                COUNT(*) FILTER (WHERE f.status = 'pending')       AS pending,
                COUNT(*) FILTER (WHERE f.status = 'spec_drafting') AS spec_drafting,
                COUNT(*) FILTER (WHERE f.status = 'spec_ready')    AS spec_ready,
                COUNT(*) FILTER (WHERE f.status = 'in_progress')   AS in_progress,
                COUNT(*) FILTER (WHERE f.status = 'blocked')       AS blocked,
                COUNT(*) FILTER (WHERE f.status = 'done')          AS done
         FROM projects p
         JOIN features f ON f.project_id = p.id
         WHERE p.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND f.status <> 'superseded'
         GROUP BY p.id, p.slug",
    )
    .fetch_all(pool)
    .await?;

    let mut by_status = StatusBreakdown::default();
    let mut projects: Vec<ProjectProgress> = Vec::with_capacity(rows.len());

    for r in rows {
        by_status.pending += r.pending;
        by_status.spec_drafting += r.spec_drafting;
        by_status.spec_ready += r.spec_ready;
        by_status.in_progress += r.in_progress;
        by_status.blocked += r.blocked;
        by_status.done += r.done;

        let total = r.pending + r.spec_drafting + r.spec_ready + r.in_progress + r.blocked + r.done;
        let hundredths = completion_hundredths(r.done, total);
        projects.push(ProjectProgress {
            slug: r.slug,
            done: r.done,
            total,
            percentage: hundredths as f64 / 100.0,
        });
    }

    let overall_total = by_status.pending
        + by_status.spec_drafting
        + by_status.spec_ready
        + by_status.in_progress
        + by_status.blocked
        + by_status.done;
    let overall_done = by_status.done;
    let overall_hundredths = completion_hundredths(overall_done, overall_total);

    projects.sort_by(|a, b| {
        b.done
            .cmp(&a.done)
            .then_with(|| {
                let bh = completion_hundredths(b.done, b.total);
                let ah = completion_hundredths(a.done, a.total);
                bh.cmp(&ah)
            })
            .then_with(|| a.slug.cmp(&b.slug))
    });
    projects.truncate(TOP_PROJECTS_LIMIT);

    Ok(DashboardResponse {
        overall: OverallProgress {
            done: overall_done,
            total: overall_total,
            percentage: overall_hundredths as f64 / 100.0,
            by_status,
        },
        top_projects: projects,
    })
}

pub async fn read_feature_log(
    pool: &PgPool,
    project_slug: &str,
    feature_name: &str,
) -> Result<FeatureLogResponse, ApiError> {
    let project_row: Option<sqlx::types::Uuid> = sqlx::query_scalar(
        "SELECT id
         FROM projects
         WHERE slug = $1 AND deleted_at IS NULL",
    )
    .bind(project_slug)
    .fetch_optional(pool)
    .await?;
    let project_id = project_row.ok_or(ApiError::NotFound)?;

    let feature_row: Option<FeatureHeaderDbRow> = sqlx::query_as(
        "SELECT id, feature_number, name, title, status::text AS status, sdd, description, acceptance
         FROM features
         WHERE project_id = $1 AND name = $2 AND deleted_at IS NULL",
    )
    .bind(project_id)
    .bind(feature_name)
    .fetch_optional(pool)
    .await?;
    let feature_db = feature_row.ok_or(ApiError::NotFound)?;
    let feature_id = feature_db.id;
    let feature: FeatureHeader = feature_db.into();

    let session_rows: Vec<ProcessLogSessionDbRow> = sqlx::query_as(
        "SELECT id, local_id, agent, started_at, closed_at, paused_at,
                plan, next_step, changes, verification, closure
         FROM session_log
         WHERE project_id = $1 AND feature_id = $2 AND deleted_at IS NULL
         ORDER BY started_at ASC, id ASC",
    )
    .bind(project_id)
    .bind(feature_id)
    .fetch_all(pool)
    .await?;

    let session_ids: Vec<i64> = session_rows.iter().map(|r| r.id).collect();

    let mut entries_by_session: HashMap<i64, Vec<ProcessLogEntry>> = HashMap::new();
    if !session_ids.is_empty() {
        let entry_rows: Vec<ProcessLogEntryDbRow> = sqlx::query_as(
            "SELECT session_id, entry, created_at
             FROM session_log_entries
             WHERE session_id = ANY($1) AND deleted_at IS NULL
             ORDER BY session_id ASC, created_at ASC, id ASC",
        )
        .bind(&session_ids)
        .fetch_all(pool)
        .await?;
        for row in entry_rows {
            entries_by_session
                .entry(row.session_id)
                .or_default()
                .push(ProcessLogEntry {
                    entry: row.entry,
                    created_at: row.created_at.to_rfc3339(),
                });
        }
    }

    let sessions = session_rows
        .into_iter()
        .map(|db_row| {
            let session_id = db_row.id;
            let mut session: ProcessLogSession = db_row.into();
            let entries = entries_by_session.remove(&session_id).unwrap_or_default();
            session.entries = entries;
            session
        })
        .collect();

    Ok(FeatureLogResponse { feature, sessions })
}

#[derive(Debug, Serialize)]
pub struct AgentUsageResponse {
    pub runs: Vec<AgentRunNode>,
    pub totals: AgentUsageTotals,
}

#[derive(Debug, Serialize)]
pub struct AgentRunNode {
    #[serde(rename = "externalId")]
    pub external_id: String,
    #[serde(rename = "parentExternalId")]
    pub parent_external_id: Option<String>,
    pub runtime: String,
    pub role: Option<String>,
    pub label: Option<String>,
    pub model: Option<String>,
    #[serde(rename = "spawnDepth")]
    pub spawn_depth: Option<i32>,
    #[serde(rename = "startedAt")]
    pub started_at: Option<String>,
    #[serde(rename = "finishedAt")]
    pub finished_at: Option<String>,
    #[serde(rename = "durationSeconds")]
    pub duration_seconds: Option<f64>,
    pub tokens: AgentRunTokens,
    pub children: Vec<AgentRunNode>,
}

#[derive(Debug, Serialize)]
pub struct AgentRunTokens {
    pub input: Option<i64>,
    #[serde(rename = "cacheRead")]
    pub cache_read: Option<i64>,
    #[serde(rename = "cacheWrite")]
    pub cache_write: Option<i64>,
    pub output: Option<i64>,
    pub reasoning: Option<i64>,
    pub total: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AgentUsageTotals {
    #[serde(rename = "effortSeconds")]
    pub effort_seconds: f64,
    #[serde(rename = "unionSeconds")]
    pub union_seconds: f64,
    pub tokens: TokenTotals,
}

#[derive(Debug, Default, Serialize)]
pub struct TokenTotals {
    pub input: i64,
    #[serde(rename = "cacheRead")]
    pub cache_read: i64,
    #[serde(rename = "cacheWrite")]
    pub cache_write: i64,
    pub output: i64,
    pub reasoning: i64,
    pub total: i64,
}

#[derive(Debug, FromRow)]
struct AgentRunDbRow {
    runtime: String,
    agent_role: Option<String>,
    label: Option<String>,
    external_id: String,
    parent_external_id: Option<String>,
    spawn_depth: Option<i32>,
    model: Option<String>,
    started_at: Option<DateTime<Utc>>,
    finished_at: Option<DateTime<Utc>>,
    duration_seconds: Option<f64>,
    input_tokens: Option<i64>,
    cache_read_tokens: Option<i64>,
    cache_write_tokens: Option<i64>,
    output_tokens: Option<i64>,
    reasoning_tokens: Option<i64>,
    total_tokens: Option<i64>,
}

impl AgentRunDbRow {
    fn to_node(&self, children: Vec<AgentRunNode>) -> AgentRunNode {
        AgentRunNode {
            external_id: self.external_id.clone(),
            parent_external_id: self.parent_external_id.clone(),
            runtime: self.runtime.clone(),
            role: self.agent_role.clone(),
            label: self.label.clone(),
            model: self.model.clone(),
            spawn_depth: self.spawn_depth,
            started_at: self.started_at.map(|t| t.to_rfc3339()),
            finished_at: self.finished_at.map(|t| t.to_rfc3339()),
            duration_seconds: self.duration_seconds,
            tokens: AgentRunTokens {
                input: self.input_tokens,
                cache_read: self.cache_read_tokens,
                cache_write: self.cache_write_tokens,
                output: self.output_tokens,
                reasoning: self.reasoning_tokens,
                total: self.total_tokens,
            },
            children,
        }
    }
}

/// `rows` must already be in run order; every child list and the root list
/// keep that order because positions in `rows` are only ever pushed ascending
/// or sorted by position.
fn build_run_tree(rows: &[AgentRunDbRow]) -> Vec<AgentRunNode> {
    let index: HashMap<(&str, &str), usize> = rows
        .iter()
        .enumerate()
        .map(|(i, r)| ((r.runtime.as_str(), r.external_id.as_str()), i))
        .collect();

    let parent_of: Vec<Option<usize>> = rows
        .iter()
        .enumerate()
        .map(|(i, r)| {
            r.parent_external_id
                .as_deref()
                .and_then(|p| index.get(&(r.runtime.as_str(), p)).copied())
                .filter(|&p| p != i)
        })
        .collect();

    let mut child_lists: Vec<Vec<usize>> = vec![Vec::new(); rows.len()];
    for (i, parent) in parent_of.iter().enumerate() {
        if let Some(p) = parent {
            child_lists[*p].push(i);
        }
    }

    // Edges actually taken by the walk; a cycle's closing edge is never taken.
    let mut tree_children: Vec<Vec<usize>> = vec![Vec::new(); rows.len()];
    let mut visited = vec![false; rows.len()];
    let mut roots: Vec<usize> = Vec::new();

    fn walk(
        node: usize,
        child_lists: &[Vec<usize>],
        visited: &mut [bool],
        tree_children: &mut [Vec<usize>],
    ) {
        visited[node] = true;
        for &child in &child_lists[node] {
            if !visited[child] {
                tree_children[node].push(child);
                walk(child, child_lists, visited, tree_children);
            }
        }
    }

    for (i, parent) in parent_of.iter().enumerate() {
        if parent.is_none() {
            roots.push(i);
            walk(i, &child_lists, &mut visited, &mut tree_children);
        }
    }
    for i in 0..rows.len() {
        if !visited[i] {
            roots.push(i);
            walk(i, &child_lists, &mut visited, &mut tree_children);
        }
    }
    roots.sort_unstable();

    fn materialize(
        node: usize,
        rows: &[AgentRunDbRow],
        tree_children: &[Vec<usize>],
    ) -> AgentRunNode {
        let children = tree_children[node]
            .iter()
            .map(|&c| materialize(c, rows, tree_children))
            .collect();
        rows[node].to_node(children)
    }

    roots
        .into_iter()
        .map(|r| materialize(r, rows, &tree_children))
        .collect()
}

fn union_seconds(intervals: &mut [(DateTime<Utc>, DateTime<Utc>)]) -> f64 {
    intervals.sort();
    let mut total = TimeDelta::zero();
    let mut current: Option<(DateTime<Utc>, DateTime<Utc>)> = None;
    for &(start, end) in intervals.iter() {
        match current {
            Some((s, e)) if start <= e => current = Some((s, e.max(end))),
            Some((s, e)) => {
                total += e - s;
                current = Some((start, end));
            }
            None => current = Some((start, end)),
        }
    }
    if let Some((s, e)) = current {
        total += e - s;
    }
    total.num_microseconds().unwrap_or(i64::MAX) as f64 / 1_000_000.0
}

fn agent_usage_totals(rows: &[AgentRunDbRow]) -> AgentUsageTotals {
    let mut intervals: Vec<(DateTime<Utc>, DateTime<Utc>)> = rows
        .iter()
        .filter_map(|r| match (r.started_at, r.finished_at) {
            (Some(s), Some(f)) if f >= s => Some((s, f)),
            _ => None,
        })
        .collect();
    let sum = |f: fn(&AgentRunDbRow) -> Option<i64>| rows.iter().filter_map(f).sum::<i64>();
    // `Iterator::sum` over no f64 yields `-0.0`, which would serialize as `-0.0`.
    AgentUsageTotals {
        effort_seconds: rows
            .iter()
            .filter_map(|r| r.duration_seconds)
            .fold(0.0, |acc, d| acc + d),
        union_seconds: union_seconds(&mut intervals),
        tokens: TokenTotals {
            input: sum(|r| r.input_tokens),
            cache_read: sum(|r| r.cache_read_tokens),
            cache_write: sum(|r| r.cache_write_tokens),
            output: sum(|r| r.output_tokens),
            reasoning: sum(|r| r.reasoning_tokens),
            total: sum(|r| r.total_tokens),
        },
    }
}

pub async fn read_feature_agent_usage(
    pool: &PgPool,
    project_slug: &str,
    feature_name: &str,
) -> Result<AgentUsageResponse, ApiError> {
    let project_row: Option<sqlx::types::Uuid> = sqlx::query_scalar(
        "SELECT id
         FROM projects
         WHERE slug = $1 AND deleted_at IS NULL",
    )
    .bind(project_slug)
    .fetch_optional(pool)
    .await?;
    let project_id = project_row.ok_or(ApiError::NotFound)?;

    let feature_row: Option<i64> = sqlx::query_scalar(
        "SELECT id
         FROM features
         WHERE project_id = $1 AND name = $2 AND deleted_at IS NULL",
    )
    .bind(project_id)
    .bind(feature_name)
    .fetch_optional(pool)
    .await?;
    let feature_id = feature_row.ok_or(ApiError::NotFound)?;

    let rows: Vec<AgentRunDbRow> = sqlx::query_as(
        "SELECT id, runtime, agent_role, label, external_id, parent_external_id, spawn_depth, model,
                started_at, finished_at, duration_seconds,
                input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, reasoning_tokens,
                total_tokens
         FROM agent_runs
         WHERE project_id = $1
           AND feature_id = $2
           AND deleted_at IS NULL
         ORDER BY started_at ASC NULLS LAST, id ASC",
    )
    .bind(project_id)
    .bind(feature_id)
    .fetch_all(pool)
    .await?;

    Ok(AgentUsageResponse {
        runs: build_run_tree(&rows),
        totals: agent_usage_totals(&rows),
    })
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, TimeDelta, Utc};

    use super::{
        build_run_tree, completion_hundredths, union_seconds, AgentRunDbRow, AgentRunNode,
    };

    #[test]
    fn completion_hundredths_rounds_half_up() {
        let cases = [
            ((0, 0), 0),
            ((0, 3), 0),
            ((1, 32), 313),
            ((3, 32), 938),
            ((1, 16), 625),
            ((1, 8), 1250),
            ((1, 3), 3333),
            ((2, 3), 6667),
            ((2, 7), 2857),
            ((5, 5), 10000),
        ];
        for ((done, total), expected) in cases {
            assert_eq!(
                completion_hundredths(done, total),
                expected,
                "completion_hundredths({done}, {total})"
            );
        }

        assert_eq!(serde_json::to_string(&(3333_f64 / 100.0)).unwrap(), "33.33");
        assert_eq!(
            serde_json::to_string(&(10000_f64 / 100.0)).unwrap(),
            "100.0"
        );
    }

    fn at_ms(ms: i64) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-01-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
            + TimeDelta::milliseconds(ms)
    }

    #[test]
    fn union_seconds_counts_overlaps_once() {
        let s = |a: i64, b: i64| (at_ms(a * 1000), at_ms(b * 1000));
        type Interval = (DateTime<Utc>, DateTime<Utc>);
        let cases: Vec<(Vec<Interval>, f64)> = vec![
            (vec![], 0.0),
            (vec![s(0, 10), s(5, 15)], 15.0),
            (vec![s(0, 10), s(20, 30)], 20.0),
            (vec![s(0, 30), s(5, 10)], 30.0),
            (vec![s(0, 10), s(10, 20)], 20.0),
            (vec![s(20, 30), s(0, 10)], 20.0),
            (vec![(at_ms(0), at_ms(500))], 0.5),
        ];
        for (mut intervals, expected) in cases {
            let label = format!("{intervals:?}");
            assert_eq!(union_seconds(&mut intervals), expected, "{label}");
        }
    }

    fn row(runtime: &str, external_id: &str, parent: Option<&str>) -> AgentRunDbRow {
        AgentRunDbRow {
            runtime: runtime.to_string(),
            agent_role: None,
            label: None,
            external_id: external_id.to_string(),
            parent_external_id: parent.map(str::to_string),
            spawn_depth: None,
            model: None,
            started_at: None,
            finished_at: None,
            duration_seconds: None,
            input_tokens: None,
            cache_read_tokens: None,
            cache_write_tokens: None,
            output_tokens: None,
            reasoning_tokens: None,
            total_tokens: None,
        }
    }

    fn shape(nodes: &[AgentRunNode]) -> String {
        nodes
            .iter()
            .map(|n| {
                if n.children.is_empty() {
                    n.external_id.clone()
                } else {
                    format!("{}[{}]", n.external_id, shape(&n.children))
                }
            })
            .collect::<Vec<_>>()
            .join(",")
    }

    #[test]
    fn build_run_tree_handles_orphans_and_cycles() {
        // Run order is the slice order.
        let rows = vec![
            row("claude", "x", Some("y")),
            row("claude", "root", None),
            row("claude", "self", Some("self")),
            row("claude", "mid", Some("root")),
            row("claude", "orphan", Some("missing")),
            row("codex", "codex-child", Some("root")),
            row("claude", "leaf", Some("mid")),
            row("claude", "y", Some("x")),
            row("claude", "late", Some("root")),
        ];
        assert_eq!(
            shape(&build_run_tree(&rows)),
            "x[y],root[mid[leaf],late],self,orphan,codex-child"
        );
        assert!(build_run_tree(&[]).is_empty());
    }
}
