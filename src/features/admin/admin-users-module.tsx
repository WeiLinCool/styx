'use client';

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type AdminColumn,
} from './module-page';
import { StatusBadge } from './status-badge';
import { AdminUserActions } from './admin-action-controls';
import type {
  AdminFilter,
  AdminMetric,
  AdminMetricTone,
} from '@/server/repositories/admin-shared';
import type { AdminUserRow } from '@/server/repositories/users';

const metricToneClassName: Record<AdminMetricTone, string> = {
  default: 'border-neutral-200 bg-white',
  success: 'border-emerald-200 bg-emerald-50',
  warning: 'border-amber-200 bg-amber-50',
  danger: 'border-red-200 bg-red-50',
  info: 'border-blue-200 bg-blue-50',
};

function DetailList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[11px] text-neutral-600"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

const columns: AdminColumn<AdminUserRow>[] = [
  {
    key: 'user',
    label: '用户',
    render: (user) => (
      <div>
        <div className="font-medium text-neutral-950">{user.displayName}</div>
        <div className="text-xs text-neutral-500">{user.primaryContact}</div>
      </div>
    ),
  },
  {
    key: 'state',
    label: '生命周期',
    render: (user) => <StatusBadge value={user.accountState} />,
  },
  {
    key: 'binding',
    label: '身份绑定',
    render: (user) => (
      <div className="space-y-1">
        <div className="text-xs font-medium text-neutral-700">{user.bindingState}</div>
        <DetailList items={user.identities} />
      </div>
    ),
  },
  {
    key: 'membership',
    label: '会员 / 积分',
    render: (user) => (
      <div>
        <div className="text-sm text-neutral-900">{user.membership}</div>
        <div className="text-xs text-neutral-500">{user.points} 积分</div>
      </div>
    ),
  },
  {
    key: 'activity',
    label: '活动 / 审计',
    render: (user) => (
      <div>
        <div className="text-xs text-neutral-700">{user.activity}</div>
        <div className="mt-1 text-xs text-neutral-500">{user.auditSummary}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (user) => (
      <AdminUserActions userId={user.id} currentPoints={user.points} />
    ),
  },
];

type AdminUsersModuleProps = {
  source: 'database' | 'seed';
  metrics: AdminMetric[];
  filters: AdminFilter[];
  records: AdminUserRow[];
};

export function AdminUsersModule({
  source,
  metrics,
  filters,
  records,
}: AdminUsersModuleProps) {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const visibleRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return records.filter((record) => {
      const matchFilter =
        activeFilter === 'all' || record.accountState === activeFilter;

      if (!matchFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystack = [
        record.displayName,
        record.primaryContact,
        record.accountState,
        record.bindingState,
        record.membership,
        record.activity,
        record.auditSummary,
        ...record.identities,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [activeFilter, records, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-950">用户管理</h2>
          <p className="mt-1 text-sm text-neutral-600">账号生命周期、身份绑定、真实积分余额、活动与审计摘要。</p>
        </div>
        <StatusBadge
          value={source === 'database' ? '数据库' : '种子数据'}
          tone={source === 'database' ? 'success' : 'warning'}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className={`rounded-lg border p-4 shadow-sm ${metricToneClassName[metric.tone]}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase text-neutral-500">{metric.label}</p>
              <StatusBadge value={metric.hint} tone={metric.tone} />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <Card className="gap-0 rounded-lg border-neutral-200 bg-white py-0 shadow-sm">
        <CardHeader className="gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <CardTitle className="text-sm font-semibold">用户队列</CardTitle>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索姓名、邮箱、手机或身份信息..."
                  className="h-9 rounded-md border-neutral-200 pl-8 text-sm"
                />
              </div>
              <Button type="button" variant="outline" className="h-9 rounded-md" disabled>
                <SlidersHorizontal className="h-4 w-4" />
                本地筛选
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((filter) => {
              const active = filter.value === activeFilter;

              return (
                <Button
                  key={filter.value}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className="h-7 rounded-md px-2 text-xs"
                  onClick={() => setActiveFilter(filter.value)}
                >
                  {filter.label}
                  {typeof filter.count === 'number' ? ` ${filter.count}` : ''}
                </Button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key} className={column.className}>
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-neutral-500">
                    当前筛选条件下暂无用户记录
                  </TableCell>
                </TableRow>
              ) : (
                visibleRecords.map((record) => (
                  <TableRow key={record.id}>
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        {column.render(record)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
