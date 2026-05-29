import {
  AdminModulePage,
  DetailList,
  type AdminColumn,
} from '@/features/admin/module-page';
import { AdminAiModelActions } from '@/features/admin/admin-action-controls';
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
  getAdminAiModels,
  type AdminAiModelRow,
} from '@/server/repositories/ai-models';

export const dynamic = 'force-dynamic';

const credentialTone = {
  valid: 'success',
  invalid: 'danger',
  not_required: 'default',
} as const;

const columns: AdminColumn<AdminAiModelRow>[] = [
  {
    key: 'model',
    label: '模型',
    render: (model) => (
      <div>
        <div className="font-medium text-neutral-950">{model.name}</div>
        <div className="text-xs text-neutral-500">{model.code}</div>
        <div className="mt-1 text-xs text-neutral-600">{model.model}</div>
      </div>
    ),
  },
  {
    key: 'provider',
    label: '供应商',
    render: (model) => (
      <div>
        <div className="text-sm font-medium text-neutral-900">{model.providerName}</div>
        <div className="text-xs text-neutral-500">{model.providerCode}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <StatusBadge value={model.providerType} />
          <StatusBadge value={model.providerStatus} />
        </div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '支持 / 默认',
    render: (model) => (
      <DetailList
        items={[
          model.status,
          model.supportsChat ? 'chat' : 'no chat',
          model.isDefaultChat ? 'default chat' : 'not default',
        ]}
      />
    ),
  },
  {
    key: 'entitlement',
    label: '权益要求',
    render: (model) => (
      <div className="max-w-xs text-xs text-neutral-700">{model.entitlementSummary}</div>
    ),
  },
  {
    key: 'pricing',
    label: '价格',
    render: (model) => (
      <div className="max-w-sm text-xs text-neutral-700">{model.pricingSummary}</div>
    ),
  },
  {
    key: 'credential',
    label: '凭据引用',
    render: (model) => (
      <div>
        <StatusBadge
          value={model.credential.status}
          tone={credentialTone[model.credential.status]}
        />
        <div className="mt-1 text-xs text-neutral-700">{model.credential.label}</div>
        <div className="mt-0.5 text-xs text-neutral-500">{model.credential.detail}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (model) => <AdminAiModelActions modelId={model.id} status={model.status} />,
  },
];

export default async function AdminAiModelsPage() {
  const data = await getAdminAiModels();

  return (
    <div className="space-y-4">
      <AdminModulePage
        title="AI 模型"
        description="管理用户 Chat 使用的 AI 供应商、模型、默认状态、权益门槛、价格与凭据引用检查。"
        source={data.source}
        metrics={data.metrics}
        filters={data.filters}
        records={data.records}
        columns={columns}
        searchPlaceholder="搜索模型、供应商、状态或权益..."
      />

      <Card className="gap-0 rounded-lg border-neutral-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-neutral-200 px-4 py-3">
          <CardTitle className="text-sm font-semibold">供应商配置</CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>供应商</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>凭据引用</TableHead>
                <TableHead className="text-right">模型</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.providers.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell>
                    <div className="font-medium text-neutral-950">{provider.name}</div>
                    <div className="text-xs text-neutral-500">{provider.code}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusBadge value={provider.providerType} />
                      <StatusBadge value={provider.status} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate text-xs text-neutral-700">
                      {provider.baseUrlLabel}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      value={provider.credential.status}
                      tone={credentialTone[provider.credential.status]}
                    />
                    <div className="mt-1 text-xs text-neutral-700">{provider.credential.label}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {provider.credential.detail}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs text-neutral-700">
                    {provider.enabledModelCount}/{provider.modelCount} enabled ·{' '}
                    {provider.chatModelCount} chat
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
