import { getPool } from '../lib/db.js';
import { methodNotAllowed, serverError } from '../lib/response.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const pool = getPool();
  try {
    const [plans, versions, tasks, events, executions, reviews] = await Promise.all([
      pool.query('SELECT * FROM plans ORDER BY created_at ASC'),
      pool.query('SELECT * FROM plan_versions ORDER BY plan_id, version_no ASC'),
      pool.query('SELECT * FROM tasks ORDER BY created_at ASC'),
      pool.query('SELECT * FROM task_status_events ORDER BY created_at ASC'),
      pool.query('SELECT * FROM execution_logs ORDER BY created_at ASC'),
      pool.query('SELECT * FROM reviews ORDER BY updated_at ASC')
    ]);

    const now = new Date();
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const payload = {
      exportedAt: now.toISOString(),
      timezone: 'Asia/Seoul',
      durationUnit: 'minute',
      plans: plans.rows,
      planVersions: versions.rows,
      tasks: tasks.rows,
      taskStatusEvents: events.rows,
      executionLogs: executions.rows,
      reviews: reviews.rows
    };
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="plando-see-export-${date}.json"`);
    return res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (error) {
    return serverError(res, error);
  }
}
