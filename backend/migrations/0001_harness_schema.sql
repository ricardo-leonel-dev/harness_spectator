-- Harness schema (Supabase-portable: only standard SQL + built-in functions).
-- No extensions required (gen_random_uuid() is built-in on Postgres 13+, and
-- Supabase-hosted Postgres supports it without any CREATE EXTENSION).

CREATE TABLE projects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        text NOT NULL UNIQUE,
    description text NOT NULL DEFAULT ''
);

CREATE TABLE features (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    feature_number  integer NOT NULL,
    name            text NOT NULL,
    title           text NOT NULL,
    description     text NOT NULL DEFAULT '',
    sdd             boolean NOT NULL DEFAULT false,
    status          text NOT NULL DEFAULT 'pending',
    deleted_at      timestamptz NULL,
    UNIQUE (project_id, feature_number)
);

CREATE TABLE blocked_features (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_id  uuid NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    note        text NOT NULL DEFAULT '',
    blocked_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    feature_id   uuid NULL REFERENCES features(id) ON DELETE SET NULL,
    agent        text NOT NULL,
    plan         jsonb NOT NULL DEFAULT '[]'::jsonb,
    next_step    jsonb NOT NULL DEFAULT '[]'::jsonb,
    changes      jsonb NOT NULL DEFAULT '[]'::jsonb,
    verification text NOT NULL DEFAULT '',
    closure      text NOT NULL DEFAULT '',
    started_at   timestamptz NOT NULL DEFAULT now(),
    closed_at    timestamptz NULL,
    deleted_at   timestamptz NULL
);

CREATE INDEX features_project_id_idx ON features (project_id);
CREATE INDEX session_log_project_id_idx ON session_log (project_id);
CREATE INDEX session_log_open_idx ON session_log (project_id) WHERE closed_at IS NULL;
CREATE INDEX blocked_features_feature_id_idx ON blocked_features (feature_id);
