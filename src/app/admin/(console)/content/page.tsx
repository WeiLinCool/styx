import {
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import {
  AdminContentActions,
  CreateAdminContentDialog,
} from '@/features/admin/admin-content-actions';
import { AdminModuleGuide } from '@/features/admin/admin-module-guide';
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
        <div className="font-medium text-foreground">{content.title}</div>
        <div className="text-xs text-muted-foreground">{content.slug}</div>
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
        <div className="text-sm text-foreground">{content.kind}</div>
        <div className="text-xs text-muted-foreground">{content.placement}</div>
      </div>
    ),
  },
  {
    key: 'body',
    label: '正文 / 媒体',
    render: (content) => (
      <div>
        <div className="max-w-xs text-xs text-muted-foreground">{content.bodySummary}</div>
        <div className="mt-1 text-xs text-muted-foreground">{content.mediaReference}</div>
      </div>
    ),
  },
  {
    key: 'owner',
    label: '负责人',
    render: (content) => (
      <div>
        <div className="text-sm text-foreground">{content.owner}</div>
        <div className="text-xs text-muted-foreground">{content.updatedAt}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (content) => <AdminContentActions content={content} />,
  },
];

export default async function AdminContentPage() {
  const data = await getAdminContent();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateAdminContentDialog />
      </div>
      <AdminModulePage
        title="内容管理"
        description="配置前台首页导航、首屏、石头介绍、加入我们、AI 工具等展示内容。"
        source={data.source}
        metrics={data.metrics}
        filters={data.filters}
        records={data.records}
        columns={columns}
        searchPlaceholder="搜索 slug、标题或位置..."
        guide={
          <AdminModuleGuide
            title="第一次配置内容管理"
            description="内容管理以 slug 作为前台读取入口。相同 slug 下，已发布记录会覆盖前台对应区块；草稿可用于预填和校对，不会直接影响用户端。"
            steps={[
              '先检查 home.nav 与 home.hero，确认导航入口、首屏标题、按钮链接与当前运营目标一致。',
              '再维护 home.stone_intro、home.join_us、home.ai_tools，确保正文、媒体引用和 metadata JSON 与前台区块结构匹配。',
              '发布后打开 /home 做最终验收，重点检查文案、链接、图片或媒体引用是否按预期渲染。',
            ]}
            risks={[
              '发布内容会影响用户端 /home 对应区块，发布前先核对 slug、状态和位置。',
              'metadata JSON 格式错误会导致前台回退到默认内容或展示不完整。',
              '媒体引用当前只保存引用地址，请确认外部资源可访问且不会过期。',
            ]}
          />
        }
      />
    </div>
  );
}
