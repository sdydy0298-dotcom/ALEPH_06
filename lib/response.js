export function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

export function sendJson(res, status, payload) {
  setNoStore(res);
  res.status(status).json(payload);
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED', message: '지원하지 않는 요청 방식입니다.' });
}

export function serverError(res, error) {
  console.error('[server-error]', error?.message || error);
  sendJson(res, 500, { error: 'INTERNAL_SERVER_ERROR', message: '서버 처리 중 오류가 발생했습니다.' });
}

export function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}
