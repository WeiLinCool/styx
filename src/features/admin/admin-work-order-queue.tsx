import Link from 'next/link';
import { KeyRound, Layers3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type AdminActivationWorkOrderQueue,
  type AdminWorkOrderQueueStatus,
} from '@/server/repositories/admin-activation-work-orders';
import {
  AdminActivationWorkOrderActions,
  AdminPasswordResetWorkOrderActions,
} from './admin-action-controls';
import { StatusBadge } from './status-badge';

const queueLabels: Record<AdminWorkOrderQueueStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  closed: '已办结',
  archived: '已归档',
};

const queueToneClassName: Record<AdminWorkOrderQueueStatus, string> = {
  pending: 'border-warning/30 bg-warning-surface',
  processing: 'border-info/30 bg-info-surface',
  closed: 'border-success/30 bg-success-surface',
  archived: 'border-border bg-card',
};

function QueueMetricCards({
  counts,
}: {
  counts: Record<AdminWorkOrderQueueStatus, number>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(queueLabels) as AdminWorkOrderQueueStatus[]).map((status) => (
        <div
          key={status}
          className={`rounded-lg border p-4 shadow-sm ${queueToneClassName[status]}`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">{queueLabels[status]}</p>
            <StatusBadge value={queueLabels[status]} />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {counts[status]}
          </p>
        </div>
      ))}
    </div>
  );
}

function buildQueueHref(status: AdminWorkOrderQueueStatus, page: number) {
  const params = new URLSearchParams({
    status,
    page: String(page),
  });

  return `/admin/users?${params.toString()}`;
}

export function AdminWorkOrderQueue({ queue }: { queue: AdminActivationWorkOrderQueue }) {
  const totalPages = Math.max(1, Math.ceil(queue.total / queue.pageSize));

  return (
    <Card className="gap-0 rounded-lg border-border bg-card py-0 shadow-sm">
      <CardHeader className="gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold text-foreground">激活绑定工单</CardTitle>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            按状态管理客服处理队列，办结后可继续归档到历史记录。
          </p>
        </div>
        <StatusBadge
          value={`${queue.total} 条记录`}
          tone={queue.total > 0 ? 'warning' : 'success'}
        />
        <QueueMetricCards counts={queue.counts} />

        <Tabs value={queue.status} className="gap-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
            {(Object.keys(queueLabels) as AdminWorkOrderQueueStatus[]).map((status) => (
              <TabsTrigger key={status} value={status} asChild className="h-8 flex-none px-3">
                <Link href={buildQueueHref(status, 1)}>
                  {queueLabels[status]}
                  <span className="ml-1 text-xs text-muted-foreground">{queue.counts[status]}</span>
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="px-4 py-4">
        <div className="grid gap-3">
          {queue.records.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              当前状态下暂无激活绑定工单
            </div>
          ) : (
            queue.records.map((workOrder) => (
              <div
                key={workOrder.id}
                className="grid gap-3 rounded-md border border-border bg-secondary/40 p-3 lg:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {workOrder.code}
                    </span>
                    <StatusBadge value={queueLabels[workOrder.queueStatus]} />
                    {workOrder.outcome ? (
                      <StatusBadge
                        value={
                          workOrder.outcome === 'approved'
                            ? '通过'
                            : workOrder.outcome === 'rejected'
                              ? '拒绝'
                              : '过期'
                        }
                        tone={workOrder.outcome === 'approved' ? 'success' : 'warning'}
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{workOrder.userLabel}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    设备摘要：{workOrder.deviceSummary}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    创建：{workOrder.createdAt} · 过期：{workOrder.expiresAt}
                    {workOrder.closedAt ? ` · 办结：${workOrder.closedAt}` : ''}
                  </p>
                </div>
                <AdminActivationWorkOrderActions
                  workOrderId={workOrder.id}
                  queueStatus={workOrder.queueStatus}
                />
              </div>
            ))
          )}
        </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          第 {queue.page} / {totalPages} 页，共 {queue.total} 条
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md"
            disabled={queue.page <= 1}
            asChild={queue.page > 1}
          >
            {queue.page > 1 ? (
              <Link href={buildQueueHref(queue.status, queue.page - 1)}>上一页</Link>
            ) : (
              <span>上一页</span>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md"
            disabled={queue.page >= totalPages}
            asChild={queue.page < totalPages}
          >
            {queue.page < totalPages ? (
              <Link href={buildQueueHref(queue.status, queue.page + 1)}>下一页</Link>
            ) : (
              <span>下一页</span>
            )}
          </Button>
        </div>
      </div>
      </CardContent>
    </Card>
  );
}

type PasswordResetQueue = {
  counts: Record<'pending' | 'processing' | 'closed' | 'archived', number>;
  page: number;
  pageSize: number;
  total: number;
  status: 'pending' | 'processing' | 'closed' | 'archived';
  records: {
    id: string;
    phone: string;
    userLabel: string;
    reason: string;
    queueStatus: 'pending' | 'processing' | 'closed' | 'archived';
    temporaryPassword: string | null;
    createdAt: string;
    processedAt: string | null;
    archivedAt: string | null;
  }[];
};

function buildPasswordResetQueueHref(status: 'pending' | 'processing' | 'closed' | 'archived', page: number) {
  const params = new URLSearchParams({
    resetStatus: status,
    resetPage: String(page),
  });

  return `/admin/users?${params.toString()}`;
}

export function AdminPasswordResetWorkOrderQueue({ queue }: { queue: PasswordResetQueue }) {
  const totalPages = Math.max(1, Math.ceil(queue.total / queue.pageSize));

  return (
    <Card className="gap-0 rounded-lg border-border bg-card py-0 shadow-sm">
      <CardHeader className="gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold text-foreground">密码重置工单</CardTitle>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            客服审核后生成临时密码，用户下次登录必须立即重置正式密码。
          </p>
        </div>
        <StatusBadge value={`${queue.total} 条记录`} tone={queue.total > 0 ? 'warning' : 'success'} />
        <QueueMetricCards counts={queue.counts} />

        <Tabs value={queue.status} className="gap-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
            {(Object.keys(queueLabels) as AdminWorkOrderQueueStatus[]).map((status) => (
              <TabsTrigger key={status} value={status} asChild className="h-8 flex-none px-3">
                <Link href={buildPasswordResetQueueHref(status, 1)}>
                  {queueLabels[status]}
                  <span className="ml-1 text-xs text-muted-foreground">{queue.counts[status]}</span>
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="px-4 py-4">
        <div className="grid gap-3">
          {queue.records.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              当前状态下暂无密码重置工单
            </div>
          ) : (
            queue.records.map((workOrder) => (
              <div
                key={workOrder.id}
                className="grid gap-3 rounded-md border border-border bg-secondary/40 p-3 lg:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={queueLabels[workOrder.queueStatus]} />
                    {workOrder.temporaryPassword ? (
                      <StatusBadge value={`临时密码 ${workOrder.temporaryPassword}`} tone="warning" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{workOrder.userLabel}</p>
                  <p className="mt-1 text-xs text-muted-foreground">手机号：{workOrder.phone}</p>
                  <p className="mt-1 text-xs text-muted-foreground">原因：{workOrder.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    创建：{workOrder.createdAt}
                    {workOrder.processedAt ? ` · 处理：${workOrder.processedAt}` : ''}
                    {workOrder.archivedAt ? ` · 归档：${workOrder.archivedAt}` : ''}
                  </p>
                </div>
                <AdminPasswordResetWorkOrderActions
                  workOrderId={workOrder.id}
                  queueStatus={workOrder.queueStatus}
                />
              </div>
            ))
          )}
        </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          第 {queue.page} / {totalPages} 页，共 {queue.total} 条
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md"
            disabled={queue.page <= 1}
            asChild={queue.page > 1}
          >
            {queue.page > 1 ? (
              <Link href={buildPasswordResetQueueHref(queue.status, queue.page - 1)}>上一页</Link>
            ) : (
              <span>上一页</span>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md"
            disabled={queue.page >= totalPages}
            asChild={queue.page < totalPages}
          >
            {queue.page < totalPages ? (
              <Link href={buildPasswordResetQueueHref(queue.status, queue.page + 1)}>下一页</Link>
            ) : (
              <span>下一页</span>
            )}
          </Button>
        </div>
      </div>
      </CardContent>
    </Card>
  );
}
