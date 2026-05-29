'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AdminWorkOrderQueueStatus } from '@/server/repositories/admin-activation-work-orders';

type ActionState = {
  tone: 'success' | 'error';
  message: string;
};

async function postAdminAction(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : '后台操作失败。';
    throw new Error(message);
  }

  return payload;
}

function ActionButtons({
  actions,
}: {
  actions: {
    label: string;
    url: string;
    body: Record<string, unknown>;
    successMessage: string;
    variant?: 'outline' | 'destructive';
  }[];
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [state, setState] = useState<ActionState | null>(null);
  const [, startTransition] = useTransition();

  async function runAction(action: (typeof actions)[number]) {
    setPendingAction(action.label);
    setState(null);

    try {
      await postAdminAction(action.url, action.body);
      setState({ tone: 'success', message: action.successMessage });
      startTransition(() => router.refresh());
    } catch (error) {
      setState({
        tone: 'error',
        message: error instanceof Error ? error.message : '后台操作失败。',
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        {actions.map((action) => {
          const isPending = pendingAction === action.label;

          return (
            <Button
              key={action.label}
              type="button"
              size="sm"
              variant={action.variant ?? 'outline'}
              disabled={pendingAction !== null}
              className="h-7 rounded-md px-2 text-xs"
              onClick={() => void runAction(action)}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {action.label}
            </Button>
          );
        })}
      </div>
      {state ? (
        <div
          className={cn(
            'flex max-w-64 items-center gap-1 text-right text-[11px]',
            state.tone === 'success' ? 'text-emerald-700' : 'text-red-700',
          )}
        >
          {state.tone === 'success' ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span>{state.message}</span>
        </div>
      ) : null}
    </div>
  );
}

export function AdminUserActions({ userId }: { userId: string }) {
  return (
    <ActionButtons
      actions={[
        {
          label: '重发激活',
          url: `/api/admin/users/${userId}/activation`,
          body: { purpose: 'account_activation' },
          successMessage: '激活 token 已重发。',
        },
        {
          label: '直接激活',
          url: `/api/admin/users/${userId}/activate`,
          body: { reason: '客服后台操作' },
          successMessage: '账号已激活。',
        },
        {
          label: '停用',
          url: `/api/admin/users/${userId}/suspend`,
          body: { reason: '客服后台操作' },
          successMessage: '账号已停用。',
          variant: 'destructive',
        },
      ]}
    />
  );
}

export function AdminActivationWorkOrderActions({
  workOrderId,
  queueStatus,
}: {
  workOrderId: string;
  queueStatus: AdminWorkOrderQueueStatus;
}) {
  const actions =
    queueStatus === 'pending'
      ? [
          {
            label: '开始处理',
            url: `/api/admin/activation-work-orders/${workOrderId}/processing`,
            body: {},
            successMessage: '激活工单已进入处理中。',
          },
        ]
      : queueStatus === 'processing'
        ? [
            {
              label: '通过并办结',
              url: `/api/admin/activation-work-orders/${workOrderId}/approve`,
              body: { reason: '客服审核通过' },
              successMessage: '激活工单已办结，账号已激活。',
            },
            {
              label: '拒绝并办结',
              url: `/api/admin/activation-work-orders/${workOrderId}/reject`,
              body: { reason: '客服审核拒绝' },
              successMessage: '激活工单已拒绝并办结。',
              variant: 'destructive' as const,
            },
          ]
        : queueStatus === 'closed'
          ? [
              {
                label: '归档',
                url: `/api/admin/activation-work-orders/${workOrderId}/archive`,
                body: {},
                successMessage: '激活工单已归档。',
              },
            ]
          : [];

  if (actions.length === 0) {
    return null;
  }

  return (
    <ActionButtons
      actions={actions}
    />
  );
}

export function AdminOrderActions({ orderId }: { orderId: string }) {
  return (
    <ActionButtons
      actions={[
        {
          label: '标记已支付',
          url: `/api/admin/orders/${orderId}/status`,
          body: { action: 'update_status', status: 'paid', note: '客服标记为已支付。' },
          successMessage: '订单已标记为已支付。',
        },
        {
          label: '标记履约',
          url: `/api/admin/orders/${orderId}/status`,
          body: {
            action: 'update_status',
            status: 'fulfilled',
            note: '客服标记为已履约。',
          },
          successMessage: '订单已标记为已履约。',
        },
        {
          label: '取消',
          url: `/api/admin/orders/${orderId}/status`,
          body: { action: 'update_status', status: 'cancelled', note: '客服取消订单。' },
          successMessage: '订单已取消。',
          variant: 'destructive',
        },
        {
          label: '备注',
          url: `/api/admin/orders/${orderId}/status`,
          body: { action: 'add_note', note: '客服已复核。' },
          successMessage: '订单备注已添加。',
        },
      ]}
    />
  );
}

export function AdminAiJobActions({ jobId }: { jobId: string }) {
  return (
    <ActionButtons
      actions={[
        {
          label: '复核',
          url: `/api/admin/ai-jobs/${jobId}/review`,
          body: { action: 'review', note: '客服已复核。' },
          successMessage: 'AI 任务已复核。',
        },
        {
          label: '重跑',
          url: `/api/admin/ai-jobs/${jobId}/review`,
          body: { action: 'rerun', note: '客服加入重跑队列。' },
          successMessage: 'AI 任务已加入队列。',
        },
        {
          label: '解决',
          url: `/api/admin/ai-jobs/${jobId}/review`,
          body: { action: 'mark_resolved', note: '客服标记为已解决。' },
          successMessage: 'AI 任务已解决。',
        },
        {
          label: '取消',
          url: `/api/admin/ai-jobs/${jobId}/review`,
          body: { action: 'cancel', note: '客服取消任务。' },
          successMessage: 'AI 任务已取消。',
          variant: 'destructive',
        },
      ]}
    />
  );
}

export function AdminAgentCapabilityActions({
  capabilityId,
  status,
}: {
  capabilityId: string;
  status: 'enabled' | 'disabled' | 'archived';
}) {
  const actions = [
    status !== 'enabled'
      ? {
          label: '启用',
          url: `/api/admin/agent-capabilities/${capabilityId}/status`,
          body: { status: 'enabled' },
          successMessage: 'Agent 能力已启用。',
        }
      : null,
    status !== 'disabled'
      ? {
          label: '停用',
          url: `/api/admin/agent-capabilities/${capabilityId}/status`,
          body: { status: 'disabled' },
          successMessage: 'Agent 能力已停用。',
          variant: 'destructive' as const,
        }
      : null,
    status !== 'archived'
      ? {
          label: '归档',
          url: `/api/admin/agent-capabilities/${capabilityId}/status`,
          body: { status: 'archived' },
          successMessage: 'Agent 能力已归档。',
          variant: 'destructive' as const,
        }
      : null,
  ].filter((action): action is NonNullable<typeof action> => Boolean(action));

  return <ActionButtons actions={actions} />;
}
