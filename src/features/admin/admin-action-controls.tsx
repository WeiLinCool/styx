'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState, useTransition } from 'react';
import { CheckCircle2, Loader2, MoreHorizontal, Plus, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { readJsonResponse } from '@/lib/api-response';
import { adminApiRequest } from '@/lib/admin-api-client';
import { formatCredits } from '@/lib/credits';
import { cn } from '@/lib/utils';
import type { AdminWorkOrderQueueStatus } from '@/server/repositories/admin-activation-work-orders';
import type {
  AdminAiModelRow,
  AdminAiProviderRow,
} from '@/server/repositories/ai-models';
import { AdminAiConfigTestDialog } from './admin-ai-config-test-dialog';
import {
  EditAiModelDialog,
  EditAiProviderDialog,
} from './admin-ai-config-forms';

type ActionState = {
  tone: 'success' | 'error';
  message: string;
};

type AdminInlineAction = {
  label: string;
  url: string;
  body: Record<string, unknown>;
  successMessage: string;
  variant?: 'outline' | 'destructive';
};

type AdminOrderStatus = 'pending' | 'paid' | 'fulfilled' | 'cancelled' | 'refunded';

type SplitActions = {
  primary: AdminInlineAction[];
  secondary: AdminInlineAction[];
};

type AdminPointAdjustmentState = {
  amount: string;
  reason: string;
};

async function postAdminAction(url: string, body: Record<string, unknown>) {
  const response = await adminApiRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

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
  actions: AdminInlineAction[];
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

function CompactActionMenu({ actions }: { actions: AdminInlineAction[] }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [state, setState] = useState<ActionState | null>(null);
  const [, startTransition] = useTransition();

  async function runAction(action: AdminInlineAction) {
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
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="更多操作"
                title="更多操作"
                disabled={pendingAction !== null || actions.length === 0}
              >
                {pendingAction ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-3.5 w-3.5" />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            更多操作
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-32">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              variant={action.variant === 'destructive' ? 'destructive' : 'default'}
              disabled={pendingAction !== null}
              onSelect={(event) => {
                event.preventDefault();
                void runAction(action);
              }}
            >
              {pendingAction === action.label ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {state ? (
        <div
          className={cn(
            'max-w-44 text-right text-[11px]',
            state.tone === 'success' ? 'text-emerald-700' : 'text-red-700',
          )}
        >
          {state.message}
        </div>
      ) : null}
    </div>
  );
}

function SplitActionButtons({ actions }: { actions: SplitActions }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {actions.primary.length > 0 ? <ActionButtons actions={actions.primary} /> : null}
      {actions.secondary.length > 0 ? <CompactActionMenu actions={actions.secondary} /> : null}
    </div>
  );
}

export function AdminUserActions({
  userId,
  currentPoints,
}: {
  userId: string;
  currentPoints: number;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionState | null>(null);
  const [formState, setFormState] = useState<AdminPointAdjustmentState>({
    amount: '',
    reason: '',
  });
  const [, startTransition] = useTransition();
  const activationActions: SplitActions = {
    primary: [
      {
        label: '调整积分',
        url: '',
        body: {},
        successMessage: '',
      },
    ],
    secondary: [
      {
        label: '同步媒体额度',
        url: `/api/admin/users/${userId}/membership-media-policy`,
        body: {},
        successMessage: '媒体额度已按用户当前生效会员版本同步。',
      },
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
    ],
  };

  async function handlePointAdjustmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState(null);

    const amount = Number(formState.amount);

    try {
      await postAdminAction(`/api/admin/users/${userId}/points`, {
        amount,
        reason: formState.reason,
      });
      setState({ tone: 'success', message: '积分调整已写入。' });
      setDialogOpen(false);
      setFormState({ amount: '', reason: '' });
      startTransition(() => router.refresh());
    } catch (error) {
      setState({
        tone: 'error',
        message: error instanceof Error ? error.message : '后台操作失败。',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" size="sm" className="h-7 rounded-md px-2 text-xs">
              <Plus className="h-3.5 w-3.5" />
              调整积分
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>手动调整积分</DialogTitle>
              <DialogDescription>支持正负调整，变更原因必填，写入真实积分账本与审计日志。</DialogDescription>
            </DialogHeader>
            <div className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
              当前积分：{formatCredits(currentPoints)}
            </div>
            <form className="space-y-4" onSubmit={(event) => void handlePointAdjustmentSubmit(event)}>
              <div className="space-y-2">
                <Label htmlFor={`admin-points-amount-${userId}`}>调整值</Label>
                <Input
                  id={`admin-points-amount-${userId}`}
                  type="number"
                  step="0.01"
                  placeholder="例如 100、-50、0.5"
                  value={formState.amount}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, amount: event.target.value }))
                  }
                  disabled={pending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`admin-points-reason-${userId}`}>原因</Label>
                <Textarea
                  id={`admin-points-reason-${userId}`}
                  placeholder="请填写审计原因，例如：客服补偿、误扣修正。"
                  value={formState.reason}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, reason: event.target.value }))
                  }
                  disabled={pending}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={pending}
                >
                  取消
                </Button>
                <Button type="submit" disabled={pending || !formState.amount.trim() || !formState.reason.trim()}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  提交调整
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <CompactActionMenu actions={activationActions.secondary} />
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

  if (queueStatus === 'processing' && actions.length > 1) {
    return <SplitActionButtons actions={{ primary: [actions[0]], secondary: actions.slice(1) }} />;
  }

  return <ActionButtons actions={actions} />;
}

export function AdminPasswordResetWorkOrderActions({
  workOrderId,
  queueStatus,
}: {
  workOrderId: string;
  queueStatus: 'pending' | 'processing' | 'closed' | 'archived';
}) {
  const actions =
    queueStatus === 'pending'
      ? [
          {
            label: '开始处理',
            url: `/api/admin/password-reset-work-orders/${workOrderId}/processing`,
            body: {},
            successMessage: '密码重置工单已进入处理中。',
          },
        ]
      : queueStatus === 'processing'
        ? [
            {
              label: '生成临时密码',
              url: `/api/admin/password-reset-work-orders/${workOrderId}/approve`,
              body: {},
              successMessage: '临时密码已生成，请复制后提供给用户。',
            },
          ]
        : queueStatus === 'closed'
          ? [
              {
                label: '归档',
                url: `/api/admin/password-reset-work-orders/${workOrderId}/archive`,
                body: {},
                successMessage: '密码重置工单已归档。',
              },
            ]
          : [];

  if (actions.length === 0) {
    return null;
  }

  return <ActionButtons actions={actions} />;
}

export function AdminSubscriptionWorkOrderActions({
  workOrderId,
  queueStatus,
  orderStatus,
}: {
  workOrderId: string;
  queueStatus: 'pending' | 'processing' | 'closed' | 'archived';
  orderStatus: string;
}) {
  const actions = getAdminSubscriptionWorkOrderActions(workOrderId, queueStatus, orderStatus);
  const blockingMessage = getAdminSubscriptionWorkOrderBlockingMessage(queueStatus, orderStatus);

  if (actions.length === 0 && !blockingMessage) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {actions.length > 0 ? <ActionButtons actions={actions} /> : null}
      {blockingMessage ? (
        <div className="max-w-64 text-right text-[11px] text-amber-700">{blockingMessage}</div>
      ) : null}
    </div>
  );
}

export function getAdminSubscriptionWorkOrderBlockingMessage(
  queueStatus: 'pending' | 'processing' | 'closed' | 'archived',
  orderStatus: string,
) {
  if ((queueStatus === 'pending' || queueStatus === 'processing') && orderStatus === 'pending') {
    return '请先到订单管理将关联订单标记为已支付，再回来通过并开通会员。';
  }

  return null;
}

export function getAdminSubscriptionWorkOrderActions(
  workOrderId: string,
  queueStatus: 'pending' | 'processing' | 'closed' | 'archived',
  orderStatus: string,
): AdminInlineAction[] {
  if (queueStatus === 'pending' || queueStatus === 'processing') {
    const actions: AdminInlineAction[] = [];

    if (orderStatus === 'paid' || orderStatus === 'fulfilled') {
      actions.push({
        label: '通过并开通',
        url: `/api/admin/subscription-work-orders/${workOrderId}/approve`,
        body: { decisionNote: '付款信息核销通过。' },
        successMessage: '会员订阅工单已通过，会员权益已开通或顺延。',
      });
    }

    actions.push({
      label: '拒绝并取消订单',
      url: `/api/admin/subscription-work-orders/${workOrderId}/reject`,
      body: { decisionNote: '付款信息未通过核销。' },
      successMessage: '会员订阅工单已拒绝，订单已取消。',
      variant: 'destructive' as const,
    });

    return actions;
  }

  if (queueStatus === 'closed') {
    return [
      {
        label: '归档',
        url: `/api/admin/subscription-work-orders/${workOrderId}/archive`,
        body: {},
        successMessage: '会员订阅工单已归档。',
      },
    ];
  }

  return [];
}

export function getAdminOrderActions(
  orderId: string,
  status: AdminOrderStatus,
  isMembershipSubscription = false,
): AdminInlineAction[] {
  const actions: AdminInlineAction[] = [];
  const membershipSubscriptionOrder = isMembershipSubscription;

  if (status === 'pending') {
    actions.push({
      label: '标记已支付',
      url: `/api/admin/orders/${orderId}/status`,
      body: { action: 'update_status', status: 'paid', note: '客服标记为已支付。' },
      successMessage: '订单已标记为已支付。',
    });
  }

  if (status === 'paid' && !membershipSubscriptionOrder) {
    actions.push({
      label: '标记履约',
      url: `/api/admin/orders/${orderId}/status`,
      body: {
        action: 'update_status',
        status: 'fulfilled',
        note: '客服标记为已履约。',
      },
      successMessage: '订单已标记为已履约。',
    });
  }

  if ((status === 'pending' || status === 'paid') && !membershipSubscriptionOrder) {
    actions.push({
      label: '取消',
      url: `/api/admin/orders/${orderId}/status`,
      body: { action: 'update_status', status: 'cancelled', note: '客服取消订单。' },
      successMessage: '订单已取消。',
      variant: 'destructive',
    });
  }

  actions.push({
    label: '备注',
    url: `/api/admin/orders/${orderId}/status`,
    body: { action: 'add_note', note: '客服已复核。' },
    successMessage: '订单备注已添加。',
  });

  return actions;
}

export function AdminOrderActions({
  orderId,
  status,
  isMembershipSubscription,
}: {
  orderId: string;
  status: AdminOrderStatus;
  isMembershipSubscription: boolean;
}) {
  return (
    <ActionButtons
      actions={getAdminOrderActions(orderId, status, isMembershipSubscription)}
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

export function AdminAiModelActions({
  model,
  providers,
}: {
  model: AdminAiModelRow;
  providers: AdminAiProviderRow[];
}) {
  const actions =
    model.status === 'enabled'
      ? [
          {
            label: '停用',
            url: `/api/admin/ai-models/${model.id}/status`,
            body: { status: 'disabled' },
            successMessage: 'AI 模型已停用。',
            variant: 'destructive' as const,
          },
          ...(model.supportsChat && !model.isDefaultChat
            ? [
                {
                  label: '设为默认',
                  url: `/api/admin/ai-models/${model.id}/default`,
                  body: {},
                  successMessage: '默认 Chat 模型已更新。',
                },
              ]
            : []),
        ]
      : [
          {
            label: '启用',
            url: `/api/admin/ai-models/${model.id}/status`,
            body: { status: 'enabled' },
            successMessage: 'AI 模型已启用。',
          },
        ];

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1">
        <EditAiModelDialog model={model} providers={providers} compact />
        <AdminAiConfigTestDialog
          title="测试模型"
          description="对当前模型发起最小测试请求，确认供应商、上游模型名与真实扣费闭环可用。"
          triggerLabel="测试模型"
          url={`/api/admin/ai-models/${model.id}/test`}
          body={{}}
          compact
        />
        <CompactActionMenu actions={actions} />
      </div>
    </div>
  );
}

export function AdminAiProviderActions({
  provider,
}: {
  provider: AdminAiProviderRow;
}) {
  const actions =
    provider.status === 'enabled'
      ? [
          {
            label: '停用',
            url: `/api/admin/ai-providers/${provider.id}/status`,
            body: { status: 'disabled' },
            successMessage: 'AI 供应商已停用。',
            variant: 'destructive' as const,
          },
        ]
      : [
          {
            label: '启用',
            url: `/api/admin/ai-providers/${provider.id}/status`,
            body: { status: 'enabled' },
            successMessage: 'AI 供应商已启用。',
          },
        ];

  return (
    <div className="flex items-start justify-end gap-1">
      <EditAiProviderDialog provider={provider} compact />
      <CompactActionMenu actions={actions} />
    </div>
  );
}
