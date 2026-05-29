'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
        : 'Admin action failed.';
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
        message: error instanceof Error ? error.message : 'Admin action failed.',
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
          label: 'Reissue activation',
          url: `/api/admin/users/${userId}/activation`,
          body: { purpose: 'account_activation' },
          successMessage: 'Activation token reissued.',
        },
        {
          label: 'Activate',
          url: `/api/admin/users/${userId}/activate`,
          body: { reason: 'admin_action' },
          successMessage: 'Account activated.',
        },
        {
          label: 'Suspend',
          url: `/api/admin/users/${userId}/suspend`,
          body: { reason: 'admin_action' },
          successMessage: 'Account suspended.',
          variant: 'destructive',
        },
      ]}
    />
  );
}

export function AdminOrderActions({ orderId }: { orderId: string }) {
  return (
    <ActionButtons
      actions={[
        {
          label: 'Mark paid',
          url: `/api/admin/orders/${orderId}/status`,
          body: { action: 'update_status', status: 'paid', note: 'Marked paid by admin.' },
          successMessage: 'Order marked paid.',
        },
        {
          label: 'Fulfill',
          url: `/api/admin/orders/${orderId}/status`,
          body: {
            action: 'update_status',
            status: 'fulfilled',
            note: 'Fulfilled by admin.',
          },
          successMessage: 'Order fulfilled.',
        },
        {
          label: 'Cancel',
          url: `/api/admin/orders/${orderId}/status`,
          body: { action: 'update_status', status: 'cancelled', note: 'Cancelled by admin.' },
          successMessage: 'Order cancelled.',
          variant: 'destructive',
        },
        {
          label: 'Add note',
          url: `/api/admin/orders/${orderId}/status`,
          body: { action: 'add_note', note: 'Reviewed by admin.' },
          successMessage: 'Order note added.',
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
          label: 'Review',
          url: `/api/admin/ai-jobs/${jobId}/review`,
          body: { action: 'review', note: 'Reviewed by admin.' },
          successMessage: 'AI job reviewed.',
        },
        {
          label: 'Rerun',
          url: `/api/admin/ai-jobs/${jobId}/review`,
          body: { action: 'rerun', note: 'Queued for rerun by admin.' },
          successMessage: 'AI job queued.',
        },
        {
          label: 'Resolve',
          url: `/api/admin/ai-jobs/${jobId}/review`,
          body: { action: 'mark_resolved', note: 'Marked resolved by admin.' },
          successMessage: 'AI job resolved.',
        },
        {
          label: 'Cancel',
          url: `/api/admin/ai-jobs/${jobId}/review`,
          body: { action: 'cancel', note: 'Cancelled by admin.' },
          successMessage: 'AI job cancelled.',
          variant: 'destructive',
        },
      ]}
    />
  );
}
