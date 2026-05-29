import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type AdminActivationWorkOrderQueue,
  type AdminWorkOrderQueueStatus,
} from '@/server/repositories/admin-activation-work-orders';
import { AdminActivationWorkOrderActions } from './admin-action-controls';
import { StatusBadge } from './status-badge';

const queueLabels: Record<AdminWorkOrderQueueStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  closed: '已办结',
  archived: '已归档',
};

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
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-950">激活绑定工单</h2>
          <p className="mt-1 text-sm text-neutral-600">
            按状态管理客服处理队列，办结后可继续归档到历史记录。
          </p>
        </div>
        <StatusBadge
          value={`${queue.total} 条记录`}
          tone={queue.total > 0 ? 'warning' : 'success'}
        />
      </div>

      <Tabs value={queue.status} className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {(Object.keys(queueLabels) as AdminWorkOrderQueueStatus[]).map((status) => (
            <TabsTrigger key={status} value={status} asChild className="h-8 flex-none px-3">
              <Link href={buildQueueHref(status, 1)}>
                {queueLabels[status]}
                <span className="ml-1 text-xs text-neutral-500">{queue.counts[status]}</span>
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4 grid gap-3">
        {queue.records.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500">
            当前状态下暂无激活绑定工单
          </div>
        ) : (
          queue.records.map((workOrder) => (
            <div
              key={workOrder.id}
              className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 lg:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-neutral-950">
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
                <p className="mt-1 text-sm text-neutral-700">{workOrder.userLabel}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  设备摘要：{workOrder.deviceSummary}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
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

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
        <p className="text-xs text-neutral-500">
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
    </section>
  );
}
