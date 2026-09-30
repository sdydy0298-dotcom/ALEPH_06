const PRIORITIES = new Set(['low', 'medium', 'high']);

export function requiredText(value, field, max = 5000) {
  const text = String(value ?? '').trim();
  if (!text) throw new ValidationError(`${field} 값이 필요합니다.`);
  if (text.length > max) throw new ValidationError(`${field} 값이 너무 깁니다.`);
  return text;
}

export function optionalText(value, max = 5000) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > max) throw new ValidationError('입력값이 너무 깁니다.');
  return text;
}

export function priority(value) {
  const normalized = String(value ?? '');
  if (!PRIORITIES.has(normalized)) throw new ValidationError('올바른 우선순위를 선택하세요.');
  return normalized;
}

export function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new ValidationError(`${field} 값은 0 이상의 정수여야 합니다.`);
  return number;
}

export function dateOnly(value, field) {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ValidationError(`${field} 날짜 형식이 올바르지 않습니다.`);
  return text;
}

export function isoDateTime(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} 시각이 올바르지 않습니다.`);
  return date;
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}
