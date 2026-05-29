import type { ReactNode } from 'react';
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
import type {
  AdminFilter,
  AdminMetric,
  AdminMetricTone,
} from '@/server/repositories/admin-shared';
import { StatusBadge } from './status-badge';

const metricToneClassName: Record<AdminMetricTone, string> = {
  default: 'border-neutral-200 bg-white',
  success: 'border-emerald-200 bg-emerald-50',
  warning: 'border-amber-200 bg-amber-50',
  danger: 'border-red-200 bg-red-50',
  info: 'border-blue-200 bg-blue-50',
};

export type AdminColumn<TRecord> = {
  key: string;
  label: string;
  className?: string;
  render: (record: TRecord) => ReactNode;
};

type AdminModulePageProps<TRecord extends { id: string }> = {
  title: string;
  description: string;
  source: 'database' | 'seed';
  metrics: AdminMetric[];
  filters: AdminFilter[];
  records: TRecord[];
  columns: AdminColumn<TRecord>[];
  searchPlaceholder: string;
  emptyLabel?: string;
};

export function AdminActionBar({ actions }: { actions: string[] }) {
  return (
    <div className="flex justify-end gap-1.5">
      {actions.map((action) => (
        <Button
          key={action}
          type="button"
          size="sm"
          variant="outline"
          disabled
          className="h-7 rounded-md px-2 text-xs"
        >
          {action}
        </Button>
      ))}
    </div>
  );
}

export function DetailList({ items }: { items: string[] }) {
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

export function AdminModulePage<TRecord extends { id: string }>({
  title,
  description,
  source,
  metrics,
  filters,
  records,
  columns,
  searchPlaceholder,
  emptyLabel = '暂无记录',
}: AdminModulePageProps<TRecord>) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-950">{title}</h2>
          <p className="mt-1 text-sm text-neutral-600">{description}</p>
        </div>
        <StatusBadge
          value={source === 'database' ? 'PostgreSQL' : '种子数据'}
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
            <CardTitle className="text-sm font-semibold">运营队列</CardTitle>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  disabled
                  placeholder={searchPlaceholder}
                  className="h-9 rounded-md border-neutral-200 pl-8 text-sm"
                />
              </div>
              <Button type="button" variant="outline" disabled className="h-9 rounded-md">
                <SlidersHorizontal className="h-4 w-4" />
                筛选
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                size="sm"
                variant="outline"
                disabled
                className="h-7 rounded-md px-2 text-xs"
              >
                {filter.label}
                {typeof filter.count === 'number' ? ` ${filter.count}` : ''}
              </Button>
            ))}
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
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-neutral-500">
                    {emptyLabel}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
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
