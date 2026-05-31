import {
  AdminAiProviderActions,
} from '@/features/admin/admin-action-controls';
import { AdminAiModelsModule } from '@/features/admin/admin-ai-models-module';
import {
  CreateAiModelDialog,
  CreateAiProviderDialog,
} from '@/features/admin/admin-ai-config-forms';
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
} from '@/server/repositories/ai-models';

export const dynamic = 'force-dynamic';

const credentialTone = {
  valid: 'success',
  invalid: 'danger',
  not_required: 'default',
} as const;

export default async function AdminAiModelsPage() {
  const data = await getAdminAiModels();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <CreateAiProviderDialog />
        <CreateAiModelDialog providers={data.providers} />
      </div>

      <AdminAiModelsModule
        source={data.source}
        metrics={data.metrics}
        filters={data.filters}
        records={data.records}
        providers={data.providers}
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
                <TableHead className="text-right">操作</TableHead>
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
                  <TableCell className="text-right">
                    <AdminAiProviderActions
                      provider={provider}
                      fallbackModelId={
                        data.records.find((record) => record.providerId === provider.id)?.id ?? null
                      }
                    />
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
