import {
  AdminActionBar,
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminContent,
  type AdminContentRow,
} from '@/server/repositories/content';

export const dynamic = 'force-dynamic';

const columns: AdminColumn<AdminContentRow>[] = [
  {
    key: 'content',
    label: '内容',
    render: (content) => (
      <div>
        <div className="font-medium text-neutral-950">{content.title}</div>
        <div className="text-xs text-neutral-500">{content.slug}</div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '状态',
    render: (content) => <StatusBadge value={content.status} />,
  },
  {
    key: 'kind',
    label: '类型 / 位置',
    render: (content) => (
      <div>
        <div className="text-sm text-neutral-900">{content.kind}</div>
        <div className="text-xs text-neutral-500">{content.placement}</div>
      </div>
    ),
  },
  {
    key: 'body',
    label: '正文 / 媒体',
    render: (content) => (
      <div>
        <div className="max-w-xs text-xs text-neutral-700">{content.bodySummary}</div>
        <div className="mt-1 text-xs text-neutral-500">{content.mediaReference}</div>
      </div>
    ),
  },
  {
    key: 'owner',
    label: '负责人',
    render: (content) => (
      <div>
        <div className="text-sm text-neutral-900">{content.owner}</div>
        <div className="text-xs text-neutral-500">{content.updatedAt}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (content) => <AdminActionBar actions={content.actions} />,
  },
];

export default async function AdminContentPage() {
  const data = await getAdminContent();

  return (
    <AdminModulePage
      title="内容管理"
      description="首页内容、banner、教程、示例资产与媒体引用管理视图。"
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
      columns={columns}
      searchPlaceholder="搜索 slug、标题或位置..."
    />
  );
}
