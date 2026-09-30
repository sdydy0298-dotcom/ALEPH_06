import { getPool } from '../lib/db.js';
import { methodNotAllowed, readJson, sendJson, serverError } from '../lib/response.js';
import { ValidationError, dateOnly, nonNegativeInteger, optionalText, priority, requiredText } from '../lib/validation.js';
import { refreshReview } from '../lib/review.js';

function parseTask(body) {
  return {
    planId: requiredText(body.planId, '계획 ID', 100),
    title: requiredText(body.title, '할 일 제목', 240),
    description: optionalText(body.description, 3000),
    dueDate: dateOnly(body.dueDate, '마감일'),
    priority: priority(body.priority),
    tag: optionalText(body.tag, 120),
    estimatedMinutes: nonNegativeInteger(body.estimatedMinutes, '예상 시간')
  };
}

function buildTaskQuery(query) {
  const values = [String(query.planId)];
  const where = ['t.plan_id = $1', 't.deleted_at IS NULL'];
  const push = value => { values.push(value); return `$${values.length}`; };

  if (query.q) {
    const p = push(`%${String(query.q).trim()}%`);
    where.push(`(t.title ILIKE ${p} OR COALESCE(t.description,'') ILIKE ${p} OR COALESCE(t.tag,'') ILIKE ${p})`);
  }
  if (query.status && ['in_progress', 'done'].includes(String(query.status))) where.push(`t.status = ${push(String(query.status))}`);
  if (query.priority && ['low', 'medium', 'high'].includes(String(query.priority))) where.push(`t.priority = ${push(String(query.priority))}`);
  if (query.tag) where.push(`COALESCE(t.tag,'') ILIKE ${push(`%${String(query.tag).trim()}%`)}`);
  if (String(query.overdue) === '1') where.push(`t.status <> 'done' AND t.due_date < (NOW() AT TIME ZONE 'Asia/Seoul')::date`);

  const sortMap = {
    default: `CASE t.status WHEN 'in_progress' THEN 0 ELSE 1 END,
              CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
              t.due_date ASC, t.created_at ASC`,
    due: 't.due_date ASC, t.created_at ASC',
    priority: `CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.due_date ASC`,
    created: 't.created_at DESC',
    title: 'LOWER(t.title) ASC, t.created_at ASC'
  };
  const sort = sortMap[String(query.sort || 'default')] || sortMap.default;
  return {
    text: `SELECT t.*,
                  COALESCE(x.actual_minutes, 0)::int AS actual_minutes,
                  COALESCE(x.execution_count, 0)::int AS execution_count,
                  COALESCE(x.blocked, false) AS blocked,
                  (t.status <> 'done' AND t.due_date < (NOW() AT TIME ZONE 'Asia/Seoul')::date) AS delayed
           FROM tasks t
           LEFT JOIN (
             SELECT task_id, SUM(actual_minutes)::int AS actual_minutes, COUNT(*)::int AS execution_count,
                    BOOL_OR(NULLIF(BTRIM(blocker_reason), '') IS NOT NULL) AS blocked
             FROM execution_logs GROUP BY task_id
           ) x ON x.task_id = t.id
           WHERE ${where.join(' AND ')}
           ORDER BY ${sort}`,
    values
  };
}

export default async function handler(req, res) {
  const pool = getPool();
  try {
    if (req.method === 'GET') {
      if (!req.query?.planId) throw new ValidationError('계획 ID가 필요합니다.');
      const q = buildTaskQuery(req.query);
      const [result, tagResult] = await Promise.all([
        pool.query(q.text, q.values),
        pool.query(
          `SELECT DISTINCT BTRIM(tag) AS tag
           FROM tasks
           WHERE plan_id=$1 AND deleted_at IS NULL AND NULLIF(BTRIM(tag),'') IS NOT NULL
           ORDER BY tag ASC`,
          [String(req.query.planId)]
        )
      ]);
      return sendJson(res, 200, { tasks: result.rows, tags: tagResult.rows.map(row => row.tag) });
    }

    if (req.method === 'POST') {
      const input = parseTask(readJson(req));
      const result = await pool.query(
        `INSERT INTO tasks (plan_id, title, description, due_date, priority, tag, estimated_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [input.planId, input.title, input.description, input.dueDate, input.priority, input.tag, input.estimatedMinutes]
      );
      await refreshReview(pool, input.planId);
      return sendJson(res, 201, { task: result.rows[0] });
    }

    if (req.method === 'PATCH') {
      const id = req.query?.id ? String(req.query.id) : '';
      if (!id) throw new ValidationError('할 일 ID가 필요합니다.');
      const input = parseTask(readJson(req));
      const result = await pool.query(
        `UPDATE tasks SET title=$2, description=$3, due_date=$4, priority=$5, tag=$6,
                          estimated_minutes=$7, updated_at=NOW()
         WHERE id=$1 AND plan_id=$8 AND deleted_at IS NULL RETURNING *`,
        [id, input.title, input.description, input.dueDate, input.priority, input.tag, input.estimatedMinutes, input.planId]
      );
      if (!result.rowCount) return sendJson(res, 404, { error: 'TASK_NOT_FOUND' });
      await refreshReview(pool, input.planId);
      return sendJson(res, 200, { task: result.rows[0] });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id ? String(req.query.id) : '';
      if (!id) throw new ValidationError('할 일 ID가 필요합니다.');
      const result = await pool.query(
        `UPDATE tasks SET deleted_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND deleted_at IS NULL RETURNING id, plan_id`, [id]
      );
      if (!result.rowCount) return sendJson(res, 404, { error: 'TASK_NOT_FOUND' });
      await refreshReview(pool, result.rows[0].plan_id);
      return sendJson(res, 200, { deleted: true, id });
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  } catch (error) {
    if (error instanceof ValidationError) return sendJson(res, 400, { error: 'VALIDATION_ERROR', message: error.message });
    return serverError(res, error);
  }
}
