import {
  AdminModulePage,
  type AdminColumn,
} from '@/features/admin/module-page';
import { AdminAgentCapabilityActions } from '@/features/admin/admin-action-controls';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getAdminAgentCapabilities,
  type AdminAgentCapabilityRow,
} from '@/server/repositories/agent-capabilities';

export const dynamic = 'force-dynamic';

const columns: AdminColumn<AdminAgentCapabilityRow>[] = [
  {
    key: 'kind',
    label: '类型',
    render: (capability) => <StatusBadge value={capability.kind} />,
  },
  {
    key: 'name',
    label: '名称',
    render: (capability) => (
      <div>
        <div className="font-medium text-neutral-950">{capability.name}</div>
        <div className="text-xs text-neutral-500">{capability.code}</div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '状态',
    render: (capability) => <StatusBadge value={capability.status} />,
  },
  {
    key: 'scope',
    label: '范围',
    render: (capability) => <div className="text-sm text-neutral-700">{capability.scope}</div>,
  },
  {
    key: 'config',
    label: '配置摘要',
    render: (capability) => (
      <div className="max-w-sm text-xs text-neutral-700">{capability.configSummary}</div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (capability) => (
      <AdminAgentCapabilityActions capabilityId={capability.id} status={capability.status} />
    ),
  },
];

export default async function AdminAgentCapabilitiesPage() {
  const data = await getAdminAgentCapabilities();

  return (
    <div className="space-y-4">
      <AdminModulePage
        title="Agent 能力"
        description="管理 Agent 运行时可用的模型、Skill、MCP 服务与 Plugin 能力，并查看配置摘要和启用状态。"
        source={data.source}
        metrics={data.metrics}
        filters={data.filters}
        records={data.records}
        columns={columns}
        searchPlaceholder="搜索能力名称、代码、类型或状态..."
      />

      <Card className="gap-0 rounded-lg border-neutral-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-neutral-200 px-4 py-3">
          <CardTitle className="text-sm font-semibold">默认能力包</CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>能力组成</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.bundles.map((bundle) => (
                <TableRow key={bundle.id}>
                  <TableCell>
                    <StatusBadge value={bundle.taskType} />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-neutral-950">{bundle.name}</div>
                    <div className="text-xs text-neutral-500">{bundle.code}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={bundle.status} />
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xl text-xs text-neutral-700">
                      {bundle.capabilitySummary}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
