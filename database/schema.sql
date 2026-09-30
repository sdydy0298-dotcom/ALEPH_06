CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    current_version_no INTEGER NOT NULL DEFAULT 1 CHECK (current_version_no >= 1),
    source_review_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL CHECK (version_no >= 1),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    success_criteria TEXT NOT NULL CHECK (length(trim(success_criteria)) > 0),
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes >= 0),
    carried_improvement TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_plan_version UNIQUE (plan_id, version_no),
    CONSTRAINT ck_plan_period CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NULL,
    due_date DATE NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    tag TEXT NULL,
    estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes >= 0),
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'done')),
    status_version INTEGER NOT NULL DEFAULT 0 CHECK (status_version >= 0),
    deleted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_plan_active
    ON tasks(plan_id, deleted_at, status, due_date);

CREATE TABLE IF NOT EXISTS task_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    status_version INTEGER NOT NULL CHECK (status_version >= 1),
    from_status TEXT NOT NULL CHECK (from_status IN ('in_progress', 'done')),
    to_status TEXT NOT NULL CHECK (to_status IN ('in_progress', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_task_status_version UNIQUE (task_id, status_version),
    CONSTRAINT ck_status_changed CHECK (from_status <> to_status)
);

CREATE TABLE IF NOT EXISTS execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    actual_minutes INTEGER NOT NULL CHECK (actual_minutes >= 0),
    blocker_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_execution_period CHECK (ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_execution_task
    ON execution_logs(task_id, started_at);

CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL UNIQUE REFERENCES plans(id) ON DELETE CASCADE,
    task_count INTEGER NOT NULL DEFAULT 0 CHECK (task_count >= 0),
    completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
    delayed_count INTEGER NOT NULL DEFAULT 0 CHECK (delayed_count >= 0),
    blocked_count INTEGER NOT NULL DEFAULT 0 CHECK (blocked_count >= 0),
    estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
    actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes >= 0),
    delta_minutes INTEGER NOT NULL DEFAULT 0,
    improvement_text TEXT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE plans
    DROP CONSTRAINT IF EXISTS fk_plans_source_review;
ALTER TABLE plans
    ADD CONSTRAINT fk_plans_source_review
    FOREIGN KEY (source_review_id) REFERENCES reviews(id) ON DELETE SET NULL;

-- Supabase Data API에서 직접 접근하지 못하도록 공개 역할 권한을 제거한다.
-- 이 앱은 브라우저 -> Vercel Functions -> PostgreSQL 구조만 사용한다.
REVOKE ALL ON TABLE plans, plan_versions, tasks, task_status_events, execution_logs, reviews FROM anon, authenticated;
