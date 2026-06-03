const CREDIT_PRECISION = 2;
const CREDIT_SCALE = 10 ** CREDIT_PRECISION;
const CREDIT_TOLERANCE = 1 / CREDIT_SCALE / 1000;

export function roundCreditAmount(amount: number) {
  return Math.round((amount + Number.EPSILON) * CREDIT_SCALE) / CREDIT_SCALE;
}

export function coerceCreditAmount(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return roundCreditAmount(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return roundCreditAmount(parsed);
    }
  }

  return fallback;
}

export function hasCreditPrecision(amount: number) {
  return Number.isFinite(amount) && Math.abs(amount - roundCreditAmount(amount)) < CREDIT_TOLERANCE;
}
