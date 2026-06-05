import { Badge } from '@/components/ui/badge';
import { formatAccountStateLabel } from '@/features/account/account-state';
import { formatAdminStatus } from './admin-i18n';
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
  approved: 'success',
  rejected: 'danger',
  processing: 'info',
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

const statusLabels: Record<string, string> = {
  active: '已激活',
  pending_activation: '待激活',
  suspended: '已停用',
  archived: '已归档',
  approved: '已通过',
  rejected: '已拒绝',
  processing: '处理中',
  paid: '已支付',
  fulfilled: '已履约',
  pending: '待处理',
  cancelled: '已取消',
  refunded: '已退款',
  queued: '排队中',
  running: '进行中',
  succeeded: '已完成',
  failed: '失败',
  new: '新建',
  contacted: '已联系',
  qualified: '已达标',
  converted: '已转化',
  closed: '已关闭',
};

type StatusBadgeProps = {
  value: string;
  label?: string;
  tone?: DashboardTone;
  className?: string;
};

export function StatusBadge({ value, label, tone, className }: StatusBadgeProps) {
  const resolvedTone = tone ?? statusTone[value] ?? 'default';
  const accountStateLabel = formatAccountStateLabel(value);
  const resolvedLabel =
    label ??
    formatAdminStatus(value) ??
    statusLabels[value] ??
    (accountStateLabel === '未知状态' ? value : accountStateLabel);

  return (
    <Badge
      variant="outline"
      className={cn('rounded-md border px-1.5 py-0 text-[11px]', toneClassName[resolvedTone], className)}
    >
      {resolvedLabel}
    </Badge>
  );
}
