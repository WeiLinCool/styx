import {
  AdminActionBar,
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { AdminVideoGenerationConfigModule } from '@/features/admin/admin-video-generation-config-module';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminSettings,
  type AdminSettingRow,
} from '@/server/repositories/settings';
import { listAdminVideoStylePresets } from '@/server/repositories/video-generation-config';

export const dynamic = 'force-dynamic';

const columns: AdminColumn<AdminSettingRow>[] = [
  {
    key: 'key',
    label: '配置',
    render: (setting) => (
      <div>
        <div className="font-medium text-foreground">{setting.key}</div>
        <div className="text-xs text-muted-foreground">{setting.category}</div>
      </div>
    ),
  },
  {
    key: 'secret',
    label: '敏感',
    render: (setting) => (
      <StatusBadge
        value={setting.isSecret ? '敏感' : '明文'}
        tone={setting.isSecret ? 'warning' : 'success'}
      />
    ),
  },
  {
    key: 'value',
    label: '值摘要',
    render: (setting) => <div className="max-w-xs text-xs text-muted-foreground">{setting.valueSummary}</div>,
  },
  {
    key: 'description',
    label: '说明',
    render: (setting) => <div className="max-w-sm text-xs text-muted-foreground">{setting.description}</div>,
  },
  {
    key: 'audit',
    label: '更新 / 审计',
    render: (setting) => (
      <div>
        <div className="text-sm text-foreground">{setting.updatedBy}</div>
        <div className="text-xs text-muted-foreground">{setting.updatedAt}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (setting) => <AdminActionBar actions={setting.actions} />,
  },
];

export default async function AdminSettingsPage() {
  const [data, videoStyles] = await Promise.all([
    getAdminSettings(),
    listAdminVideoStylePresets(),
  ]);

  return (
    <AdminModulePage
      title="系统设置"
      description="角色访问、AI provider、存储占位配置与审计入口。"
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
      columns={columns}
      searchPlaceholder="搜索设置、供应商或存储..."
      guide={<AdminVideoGenerationConfigModule initialStyles={videoStyles} />}
    />
  );
}
