import { getPool } from '../lib/db.js';
import { rangeReview, refreshReview, reviewEvidence } from '../lib/review.js';
import { methodNotAllowed, readJson, sendJson, serverError } from '../lib/response.js';
import { ValidationError, dateOnly, optionalText, requiredText } from '../lib/validation.js';

export default async function handler(req, res) {
  const pool = getPool();
  try {
    if (req.method === 'GET') {
      const planId = req.query?.planId ? String(req.query.planId) : '';
      if (!planId) throw new ValidationError('계획 ID가 필요합니다.');
      const hasRange = Boolean(req.query?.startDate || req.query?.endDate);
      let startDate = null;
      let endDate = null;
      if (hasRange) {
        startDate = dateOnly(req.query?.startDate, '시작일');
        endDate = dateOnly(req.query?.endDate, '종료일');
        if (endDate < startDate) throw new ValidationError('종료일은 시작일보다 빠를 수 없습니다.');
      }
      const review = hasRange
        ? await rangeReview(pool, planId, startDate, endDate)
        : await refreshReview(pool, planId);
      const evidence = await reviewEvidence(pool, planId, startDate, endDate);
      return sendJson(res, 200, { review, evidence, period: hasRange ? { startDate, endDate } : null });
    }

    if (req.method === 'POST') {
      const body = readJson(req);
      const planId = requiredText(body.planId, '계획 ID', 100);
      const improvementText = optionalText(body.improvementText, 2000);
      await refreshReview(pool, planId);
      const result = await pool.query(
        `UPDATE reviews SET improvement_text=$2, updated_at=NOW()
         WHERE plan_id=$1 RETURNING *`, [planId, improvementText]
      );
      if (!result.rowCount) return sendJson(res, 404, { error: 'REVIEW_NOT_FOUND' });
      return sendJson(res, 200, { review: result.rows[0] });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (error) {
    if (error instanceof ValidationError) return sendJson(res, 400, { error: 'VALIDATION_ERROR', message: error.message });
    return serverError(res, error);
  }
}
