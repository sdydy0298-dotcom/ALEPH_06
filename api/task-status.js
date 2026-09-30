import { getPool } from '../lib/db.js';
import { refreshReview } from '../lib/review.js';
import { methodNotAllowed, readJson, sendJson, serverError } from '../lib/response.js';
import { ValidationError, requiredText } from '../lib/validation.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const pool = getPool();
  const client = await pool.connect();
  try {
    const body = readJson(req);
    const taskId = requiredText(body.taskId, '할 일 ID', 100);
    const toStatus = String(body.toStatus || '');
    if (!['in_progress', 'done'].includes(toStatus)) throw new ValidationError('올바른 상태가 아닙니다.');

    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT id, plan_id, status, status_version FROM tasks
       WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [taskId]
    );
    if (!locked.rowCount) {
      await client.query('ROLLBACK');
      return sendJson(res, 404, { error: 'TASK_NOT_FOUND' });
    }

    const task = locked.rows[0];
    if (task.status === toStatus) {
      const review = await refreshReview(client, task.plan_id);
      await client.query('COMMIT');
      return sendJson(res, 200, { changed: false, task, review });
    }

    const nextVersion = Number(task.status_version) + 1;
    const updated = await client.query(
      `UPDATE tasks SET status=$2, status_version=$3, updated_at=NOW()
       WHERE id=$1 RETURNING *`, [taskId, toStatus, nextVersion]
    );
    await client.query(
      `INSERT INTO task_status_events (task_id, status_version, from_status, to_status)
       VALUES ($1,$2,$3,$4)`, [taskId, nextVersion, task.status, toStatus]
    );
    const review = await refreshReview(client, task.plan_id);
    await client.query('COMMIT');
    return sendJson(res, 200, { changed: true, task: updated.rows[0], review });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ValidationError) return sendJson(res, 400, { error: 'VALIDATION_ERROR', message: error.message });
    return serverError(res, error);
  } finally {
    client.release();
  }
}
