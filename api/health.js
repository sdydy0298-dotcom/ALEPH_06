import { getPool } from '../lib/db.js';
import { methodNotAllowed, sendJson, serverError } from '../lib/response.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const pool = getPool();
    const result = await pool.query("SELECT NOW() AS server_time, current_database() AS database_name");
    return sendJson(res, 200, {
      ok: true,
      database: result.rows[0]?.database_name || 'postgres',
      serverTime: result.rows[0]?.server_time || null
    });
  } catch (error) {
    return serverError(res, error);
  }
}
