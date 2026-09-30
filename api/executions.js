import { getPool } from '../lib/db.js';
import { refreshReview } from '../lib/review.js';
import { methodNotAllowed, readJson, sendJson, serverError } from '../lib/response.js';
import { ValidationError, isoDateTime, optionalText, requiredText } from '../lib/validation.js';

export default async function handler(req, res) {
  const pool = getPool();
  try {
    if (req.method === 'GET') {
      const taskId = req.query?.taskId ? String(req.query.taskId) : '';
      const planId = req.query?.planId ? String(req.query.planId) : '';

      if (taskId) {
        const result = await pool.query(
          `SELECT * FROM execution_logs WHERE task_id=$1 ORDER BY started_at DESC, created_at DESC`, [taskId]
        );
        return sendJson(res, 200, { executions: result.rows });
      }

      if (planId) {
        const result = await pool.query(
          `SELECT e.*, t.title AS task_title, t.due_date, t.status, t.priority, t.tag
           FROM execution_logs e
           JOIN tasks t ON t.id=e.task_id
           WHERE t.plan_id=$1 AND t.deleted_at IS NULL
           ORDER BY e.started_at DESC, e.created_at DESC`, [planId]
        );
        return sendJson(res, 200, { executions: result.rows });
      }

      throw new ValidationError('할 일 ID 또는 계획 ID가 필요합니다.');
    }

    if (req.method === 'POST') {
      const body = readJson(req);
      const taskId = requiredText(body.taskId, '할 일 ID', 100);
      const started = isoDateTime(body.startedAt, '시작');
      const ended = isoDateTime(body.endedAt, '종료');
      if (ended < started) throw new ValidationError('종료 시각은 시작 시각보다 빠를 수 없습니다.');
      const actualMinutes = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 60000));
      const blockerReason = optionalText(body.blockerReason, 3000);

      const task = await pool.query('SELECT plan_id FROM tasks WHERE id=$1 AND deleted_at IS NULL', [taskId]);
      if (!task.rowCount) return sendJson(res, 404, { error: 'TASK_NOT_FOUND' });
      const result = await pool.query(
        `INSERT INTO execution_logs (task_id, started_at, ended_at, actual_minutes, blocker_reason)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [taskId, started.toISOString(), ended.toISOString(), actualMinutes, blockerReason]
      );
      await refreshReview(pool, task.rows[0].plan_id);
      return sendJson(res, 201, { execution: result.rows[0] });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (error) {
    if (error instanceof ValidationError) return sendJson(res, 400, { error: 'VALIDATION_ERROR', message: error.message });
    return serverError(res, error);
  }
}
