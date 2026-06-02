import { Badge } from '@/components/ui/badge';
import { formatAccountStateLabel } from '@/features/account/account-state';
import { cn } from '@/lib/utils';
import type { DashboardTone } from '@/server/repositories/admin-dashboard';

const toneClassName: Record<DashboardTone, string> = {
  default: 'border-neutral-200 bg-neutral-100 text-neutral-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
};

const statusTone: Record<string, DashboardTone> = {
  active: 'success',
  pending_activation: 'warning',
  suspended: 'danger',
  archived: 'default',
  paid: 'success',
  fulfilled: 'success',
  pending: 'warning',
  cancelled: 'default',
  refunded: 'default',
  queued: 'warning',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  new: 'info',
  contacted: 'warning',
  qualified: 'success',
  converted: 'success',
  closed: 'default',
};

type StatusBadgeProps = {
  value: string;
  tone?: DashboardTone;
  className?: string;
};

export function StatusBadge({ value, tone, className }: StatusBadgeProps) {
  const resolvedTone = tone ?? statusTone[value] ?? 'default';
  const label = value in statusTone ? formatAccountStateLabel(value) : value;

  return (
    <Badge
      variant="outline"
      className={cn('rounded-md border px-1.5 py-0 text-[11px]', toneClassName[resolvedTone], className)}
    >
      {label === '未知状态' ? value : label}
    </Badge>
  );
}
