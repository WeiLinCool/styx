import { db } from '@/server/db';

export type AdminDataSource = 'database' | 'seed';
export type AdminMetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export type AdminMetric = {
  label: string;
  value: string;
  hint: string;
  tone: AdminMetricTone;
};

export type AdminFilter = {
  label: string;
  value: string;
  count?: number;
};

export type AdminModuleData<TRecord> = {
  source: AdminDataSource;
  metrics: AdminMetric[];
  filters: AdminFilter[];
  records: TRecord[];
};

export function ensureAdminReadSource(moduleName: string) {
  if (!db || !process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`DATABASE_URL is required for ${moduleName} admin data.`);
    }

    return null;
  }

  return db;
}

export function formatCurrency(cents: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatIso(value: Date | string | null | undefined) {
  if (!value) {
    return '未记录';
  }

  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function metadataText(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
  fallback = '未记录',
) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function metadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
  fallback = 0,
) {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
