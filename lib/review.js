function rangeClause(startDate, endDate, alias = 't', firstParam = 2) {
  if (!startDate || !endDate) return { sql: '', values: [] };
  return {
    sql: ` AND ${alias}.due_date BETWEEN $${firstParam} AND $${firstParam + 1}`,
    values: [startDate, endDate]
  };
}

async function calculateReviewMetrics(client, planId, startDate = null, endDate = null) {
  const range = rangeClause(startDate, endDate, 't', 2);
  const metricsResult = await client.query(
    `WITH active_tasks AS (
       SELECT t.*
       FROM tasks t
       WHERE t.plan_id = $1 AND t.deleted_at IS NULL${range.sql}
     ),
     actual_by_task AS (
       SELECT e.task_id, COALESCE(SUM(e.actual_minutes), 0)::int AS actual_minutes
       FROM execution_logs e
       JOIN active_tasks t ON t.id = e.task_id
       GROUP BY e.task_id
     )
     SELECT
       COUNT(*)::int AS task_count,
       COUNT(*) FILTER (WHERE t.status = 'done')::int AS completed_count,
       COUNT(*) FILTER (
         WHERE t.status <> 'done'
           AND t.due_date < (NOW() AT TIME ZONE 'Asia/Seoul')::date
       )::int AS delayed_count,
       COUNT(*) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM execution_logs e
           WHERE e.task_id = t.id
             AND NULLIF(BTRIM(e.blocker_reason), '') IS NOT NULL
         )
       )::int AS blocked_count,
       COALESCE(SUM(t.estimated_minutes), 0)::int AS estimated_minutes,
       COALESCE(SUM(a.actual_minutes), 0)::int AS actual_minutes
     FROM active_tasks t
     LEFT JOIN actual_by_task a ON a.task_id = t.id`,
    [planId, ...range.values]
  );

  const m = metricsResult.rows[0] || {
    task_count: 0,
    completed_count: 0,
    delayed_count: 0,
    blocked_count: 0,
    estimated_minutes: 0,
    actual_minutes: 0
  };

  return {
    task_count: Number(m.task_count || 0),
    completed_count: Number(m.completed_count || 0),
    delayed_count: Number(m.delayed_count || 0),
    blocked_count: Number(m.blocked_count || 0),
    estimated_minutes: Number(m.estimated_minutes || 0),
    actual_minutes: Number(m.actual_minutes || 0),
    delta_minutes: Number(m.actual_minutes || 0) - Number(m.estimated_minutes || 0)
  };
}

export async function refreshReview(client, planId) {
  const m = await calculateReviewMetrics(client, planId);
  const reviewResult = await client.query(
    `INSERT INTO reviews (
       plan_id, task_count, completed_count, delayed_count, blocked_count,
       estimated_minutes, actual_minutes, delta_minutes, calculated_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     ON CONFLICT (plan_id) DO UPDATE SET
       task_count = EXCLUDED.task_count,
       completed_count = EXCLUDED.completed_count,
       delayed_count = EXCLUDED.delayed_count,
       blocked_count = EXCLUDED.blocked_count,
       estimated_minutes = EXCLUDED.estimated_minutes,
       actual_minutes = EXCLUDED.actual_minutes,
       delta_minutes = EXCLUDED.delta_minutes,
       calculated_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      planId,
      m.task_count,
      m.completed_count,
      m.delayed_count,
      m.blocked_count,
      m.estimated_minutes,
      m.actual_minutes,
      m.delta_minutes
    ]
  );
  return reviewResult.rows[0];
}

export async function rangeReview(client, planId, startDate, endDate) {
  const [metrics, stored] = await Promise.all([
    calculateReviewMetrics(client, planId, startDate, endDate),
    client.query('SELECT id, plan_id, improvement_text, updated_at FROM reviews WHERE plan_id=$1', [planId])
  ]);
  const base = stored.rows[0] || {};
  return {
    ...base,
    ...metrics,
    range_start: startDate,
    range_end: endDate,
    calculated_at: new Date().toISOString()
  };
}

export async function reviewEvidence(client, planId, startDate = null, endDate = null) {
  const range = rangeClause(startDate, endDate, 't', 2);
  const result = await client.query(
    `SELECT
       t.id,
       t.title,
       t.status,
       t.due_date,
       t.priority,
       t.estimated_minutes,
       COALESCE(SUM(e.actual_minutes), 0)::int AS actual_minutes,
       EXISTS (
         SELECT 1 FROM execution_logs eb
         WHERE eb.task_id = t.id
           AND NULLIF(BTRIM(eb.blocker_reason), '') IS NOT NULL
       ) AS blocked,
       (t.status <> 'done' AND t.due_date < (NOW() AT TIME ZONE 'Asia/Seoul')::date) AS delayed
     FROM tasks t
     LEFT JOIN execution_logs e ON e.task_id = t.id
     WHERE t.plan_id = $1 AND t.deleted_at IS NULL${range.sql}
     GROUP BY t.id
     ORDER BY t.due_date ASC, t.created_at ASC`,
    [planId, ...range.values]
  );
  return result.rows;
}
