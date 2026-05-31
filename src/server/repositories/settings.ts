import { desc, eq } from 'drizzle-orm';

import { schema } from '@/server/db';
import {
  type AdminModuleData,
  ensureAdminReadSource,
  formatIso,
} from './admin-shared';

export type AdminSettingRow = {
  id: string;
  key: string;
  category: string;
  valueSummary: string;
  description: string;
  isSecret: boolean;
  updatedBy: string;
  updatedAt: string;
  actions: string[];
};

function summarizeValue(value: Record<string, unknown>) {
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return '{}';
  }

  return entries
    .slice(0, 3)
    .map(([key, entryValue]) => `${key}: ${typeof entryValue === 'object' ? 'object' : String(entryValue)}`)
    .join(' / ');
}

function getSeedSettings(): AdminModuleData<AdminSettingRow> {
  const records: AdminSettingRow[] = [
    {
      id: 'site.general',
      key: 'site.general',
      category: 'site',
      valueSummary: 'name: Styx / maintenance: false',
      description: 'General site settings.',
      isSecret: false,
      updatedBy: 'Styx Admin',
      updatedAt: '2026-05-29T08:00:00.000Z',
      actions: ['Edit setting', 'View audit'],
    },
    {
      id: 'providers.ai',
      key: 'providers.ai',
      category: 'providers',
      valueSummary: 'openai: placeholder / video: placeholder',
      description: 'Provider placeholders for AI routing.',
      isSecret: true,
      updatedBy: 'Styx Admin',
      updatedAt: '2026-05-29T08:00:00.000Z',
      actions: ['Edit setting', 'View audit'],
    },
    {
      id: 'storage.assets',
      key: 'storage.assets',
      category: 'storage',
      valueSummary: 'bucket: placeholder / cdn: placeholder',
      description: 'Storage placeholders for generated media.',
      isSecret: true,
      updatedBy: 'Styx Admin',
      updatedAt: '2026-05-29T08:00:00.000Z',
      actions: ['Edit setting', 'View audit'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '配置项', value: '3', hint: 'seed settings', tone: 'info' },
      { label: '敏感项', value: '2', hint: 'masked', tone: 'warning' },
      { label: '角色访问', value: 'owner/admin/operator', hint: 'guarded', tone: 'success' },
      { label: '审计事件', value: 'ready', hint: 'view-only', tone: 'default' },
    ],
    filters: [
      { label: 'All', value: 'all', count: 3 },
      { label: 'Site', value: 'site', count: 1 },
      { label: 'Providers', value: 'providers', count: 1 },
      { label: 'Storage', value: 'storage', count: 1 },
    ],
    records,
  };
}

export async function getAdminSettings(): Promise<AdminModuleData<AdminSettingRow>> {
  const database = ensureAdminReadSource('settings');

  if (!database) {
    return getSeedSettings();
  }

  const rows = await database
    .select({
      setting: schema.systemSettings,
      user: schema.users,
    })
    .from(schema.systemSettings)
    .leftJoin(schema.users, eq(schema.users.id, schema.systemSettings.updatedByUserId))
    .orderBy(desc(schema.systemSettings.updatedAt));

  const records = rows.map(({ setting, user }) => ({
    id: setting.key,
    key: setting.key,
    category: setting.key.split('.')[0] ?? 'system',
    valueSummary: setting.isSecret ? 'masked secret value' : summarizeValue(setting.value),
    description: setting.description ?? '未填写',
    isSecret: setting.isSecret,
    updatedBy: user?.displayName ?? '系统',
    updatedAt: formatIso(setting.updatedAt),
    actions: ['Edit setting', 'View audit'],
  }));

  return {
    source: 'database',
    metrics: [
      { label: '配置项', value: String(records.length), hint: '数据库', tone: 'info' },
      {
        label: '敏感项',
        value: String(records.filter((record) => record.isSecret).length),
        hint: 'masked',
        tone: 'warning',
      },
      { label: '角色访问', value: 'owner/admin/operator', hint: 'guarded', tone: 'success' },
      { label: '审计事件', value: 'ready', hint: 'view-only', tone: 'default' },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      { label: 'Site', value: 'site' },
      { label: 'Providers', value: 'providers' },
      { label: 'Storage', value: 'storage' },
      { label: 'Secrets', value: 'secrets' },
    ],
    records,
  };
}
