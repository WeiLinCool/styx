export function formatCredits(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
