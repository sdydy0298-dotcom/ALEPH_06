import { getPool } from '../lib/db.js';
import { methodNotAllowed, readJson, sendJson, serverError } from '../lib/response.js';
import { ValidationError, dateOnly, nonNegativeInteger, optionalText, priority, requiredText } from '../lib/validation.js';

function parsePlan(body) {
  const startDate = dateOnly(body.startDate, '시작일');
  const endDate = dateOnly(body.endDate, '종료일');
  if (endDate < startDate) throw new ValidationError('종료일은 시작일보다 빠를 수 없습니다.');
  return {
    title: requiredText(body.title, '계획 제목', 200),
    startDate,
    endDate,
    priority: priority(body.priority),
    successCriteria: requiredText(body.successCriteria, '성공 기준', 2000),
    estimatedMinutes: nonNegativeInteger(body.estimatedMinutes, '예상 시간')
  };
}

export default async function handler(req, res) {
  const pool = getPool();
  try {
    if (req.method === 'GET') {
      const id = req.query?.id ? String(req.query.id) : null;
      if (id) {
        const current = await pool.query(
          `SELECT p.id, p.current_version_no, p.source_review_id, p.created_at, p.updated_at,
                  v.title, v.start_date, v.end_date, v.priority, v.success_criteria,
                  v.estimated_minutes, v.carried_improvement, v.created_at AS version_created_at
           FROM plans p
           JOIN plan_versions v ON v.plan_id = p.id AND v.version_no = p.current_version_no
           WHERE p.id = $1`, [id]
        );
        if (!current.rowCount) return sendJson(res, 404, { error: 'PLAN_NOT_FOUND' });
        const versions = await pool.query(
          `SELECT id, plan_id, version_no, title, start_date, end_date, priority,
                  success_criteria, estimated_minutes, carried_improvement, created_at
           FROM plan_versions WHERE plan_id = $1 ORDER BY version_no DESC`, [id]
        );
        return sendJson(res, 200, { plan: current.rows[0], versions: versions.rows });
      }

      const result = await pool.query(
        `SELECT p.id, p.current_version_no, p.source_review_id, p.created_at, p.updated_at,
                v.title, v.start_date, v.end_date, v.priority, v.success_criteria,
                v.estimated_minutes, v.carried_improvement
         FROM plans p
         JOIN plan_versions v ON v.plan_id = p.id AND v.version_no = p.current_version_no
         ORDER BY p.created_at DESC`
      );
      return sendJson(res, 200, { plans: result.rows });
    }

    if (req.method === 'POST') {
      const body = readJson(req);
      const input = parsePlan(body);
      const sourceReviewId = optionalText(body.sourceReviewId, 100);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let carriedImprovement = null;
        if (sourceReviewId) {
          const review = await client.query('SELECT improvement_text FROM reviews WHERE id = $1', [sourceReviewId]);
          if (!review.rowCount) throw new ValidationError('이전 돌아보기 자료를 찾을 수 없습니다.');
          carriedImprovement = review.rows[0].improvement_text || null;
        }
        const plan = await client.query(
          `INSERT INTO plans (source_review_id) VALUES ($1) RETURNING id, current_version_no, source_review_id, created_at, updated_at`,
          [sourceReviewId]
        );
        const planId = plan.rows[0].id;
        const version = await client.query(
          `INSERT INTO plan_versions
             (plan_id, version_no, title, start_date, end_date, priority, success_criteria, estimated_minutes, carried_improvement)
           VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [planId, input.title, input.startDate, input.endDate, input.priority, input.successCriteria, input.estimatedMinutes, carriedImprovement]
        );
        await client.query('COMMIT');
        return sendJson(res, 201, { planId, plan: plan.rows[0], version: version.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      const id = req.query?.id ? String(req.query.id) : '';
      if (!id) throw new ValidationError('계획 ID가 필요합니다.');
      const input = parsePlan(readJson(req));
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query('SELECT id, current_version_no FROM plans WHERE id = $1 FOR UPDATE', [id]);
        if (!locked.rowCount) {
          await client.query('ROLLBACK');
          return sendJson(res, 404, { error: 'PLAN_NOT_FOUND' });
        }
        const nextVersion = Number(locked.rows[0].current_version_no) + 1;
        const previous = await client.query(
          'SELECT carried_improvement FROM plan_versions WHERE plan_id = $1 AND version_no = $2',
          [id, locked.rows[0].current_version_no]
        );
        const version = await client.query(
          `INSERT INTO plan_versions
             (plan_id, version_no, title, start_date, end_date, priority, success_criteria, estimated_minutes, carried_improvement)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [id, nextVersion, input.title, input.startDate, input.endDate, input.priority, input.successCriteria, input.estimatedMinutes, previous.rows[0]?.carried_improvement || null]
        );
        await client.query('UPDATE plans SET current_version_no = $2, updated_at = NOW() WHERE id = $1', [id, nextVersion]);
        await client.query('COMMIT');
        return sendJson(res, 200, { plan: version.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
  } catch (error) {
    if (error instanceof ValidationError) return sendJson(res, 400, { error: 'VALIDATION_ERROR', message: error.message });
    return serverError(res, error);
  }
}
