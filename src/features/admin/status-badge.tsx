import { Badge } from '@/components/ui/badge';
import { formatAccountStateLabel } from '@/features/account/account-state';
import { cn } from '@/lib/utils';
import type { DashboardTone } from '@/server/repositories/admin-dashboard';

const toneClassName: Record<DashboardTone, string> = {
  default: 'border-border bg-secondary/80 text-secondary-foreground',
  success: 'border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/20 bg-amber-500/12 text-amber-700 dark:text-amber-300',
  danger: 'border-red-500/20 bg-red-500/12 text-red-700 dark:text-red-300',
  info: 'border-blue-500/20 bg-blue-500/12 text-blue-700 dark:text-blue-300',
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
