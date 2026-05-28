import {
  AdminActionBar,
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminAiJobs,
  type AdminAiJobRow,
} from '@/server/repositories/ai-jobs';

export const dynamic = 'force-dynamic';

const columns: AdminColumn<AdminAiJobRow>[] = [
  {
    key: 'job',
    label: '任务',
    render: (job) => (
      <div>
        <div className="font-medium text-neutral-950">{job.type}</div>
        <div className="text-xs text-neutral-500">{job.user}</div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '状态',
    render: (job) => <StatusBadge value={job.status} />,
  },
  {
    key: 'prompt',
    label: 'Prompt',
    render: (job) => <div className="max-w-xs text-xs text-neutral-700">{job.promptSummary}</div>,
  },
  {
    key: 'provider',
    label: 'Provider',
    render: (job) => (
      <div>
        <div className="text-sm text-neutral-900">{job.provider}</div>
        <div className="text-xs text-neutral-500">{job.model}</div>
      </div>
    ),
  },
  {
    key: 'output',
    label: '输出 / 错误',
    render: (job) => (
      <div>
        <div className="text-xs text-neutral-700">{job.outputReference}</div>
        <div className="mt-1 text-xs text-neutral-500">{job.errorSummary}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (job) => <AdminActionBar actions={job.actions} />,
  },
];

export default async function AdminAiJobsPage() {
  const data = await getAdminAiJobs();

  return (
    <AdminModulePage
      title="AI Jobs"
      description="AI 任务类型、用户、prompt、供应商模型、输出引用、错误与复跑入口。"
      source={data.source}
      metrics={data.metrics}
      filters={data.filters}
      records={data.records}
      columns={columns}
      searchPlaceholder="Search prompt, user, provider, status..."
    />
  );
}
