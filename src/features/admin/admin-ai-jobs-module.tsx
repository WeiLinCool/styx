'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type { AdminAiJobRow } from '@/server/repositories/ai-jobs';
import { AdminAiJobActions } from './admin-action-controls';
import { StatusBadge } from './status-badge';
import { adminText } from './admin-i18n';

const metricToneClassName: Record<AdminMetricTone, string> = {
  default: 'border-border bg-card',
  success: 'border-success/30 bg-success-surface',
  warning: 'border-warning/30 bg-warning-surface',
  danger: 'border-destructive/30 bg-destructive/10',
  info: 'border-info/30 bg-info-surface',
};

type AiJobColumn = {
  key: string;
  label: string;
  className?: string;
  render: (record: AdminAiJobRow) => ReactNode;
};

const columns: AiJobColumn[] = [
  {
    key: 'job',
    label: '任务',
    render: (job) => (
      <div>
        <div className="font-medium text-foreground">{job.type}</div>
        <div className="text-xs text-muted-foreground">{job.user}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <StatusBadge value={job.sourceKind} />
          <span className="text-xs text-muted-foreground">{job.createdAt}</span>
        </div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '状态',
    render: (job) => <StatusBadge value={job.status} />,
  },
  {
    key: 'prompt',
    label: '提示词',
    render: (job) => <div className="max-w-xs text-xs text-muted-foreground">{job.promptSummary}</div>,
  },
  {
    key: 'provider',
    label: '供应商',
    render: (job) => (
      <div>
        <div className="text-sm text-foreground">{job.provider}</div>
        <div className="text-xs text-muted-foreground">{job.model}</div>
      </div>
    ),
  },
  {
    key: 'output',
    label: '输出 / 错误',
    render: (job) => (
      <div>
        <div className="text-xs text-muted-foreground">{job.outputReference}</div>
        <div className="mt-1 text-xs text-muted-foreground">{job.errorSummary}</div>
        <div className="mt-1 text-xs text-muted-foreground/80">{job.duration}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
      render: (job) =>
      job.sourceKind === 'ai_job' ? (
        <AdminAiJobActions jobId={job.id} />
      ) : (
        <div className="text-xs text-muted-foreground">Agent 运行记录</div>
      ),
  },
];

type AdminAiJobsModuleProps = {
  source: 'database' | 'seed';
  metrics: AdminMetric[];
  filters: AdminFilter[];
  records: AdminAiJobRow[];
};

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function jobMatchesQuickFilter(job: AdminAiJobRow, filter: string) {
  if (filter === 'all') {
    return true;
  }

  return job.type === filter || job.status === filter;
}

function jobMatchesKeyword(job: AdminAiJobRow, keyword: string) {
  if (!keyword) {
    return true;
  }

  const haystack = [
    job.id,
    job.sourceKind,
    job.type,
    job.status,
    job.user,
    job.promptSummary,
    job.provider,
    job.model,
    job.outputReference,
    job.errorSummary,
    job.createdAt,
    job.duration,
    ...job.actions,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(keyword);
}

export function AdminAiJobsModule({
  source,
  metrics,
  filters,
  records,
}: AdminAiJobsModuleProps) {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');

  const filterOptions = useMemo(
    () => ({
      types: uniqueSorted(records.map((record) => record.type)),
      statuses: uniqueSorted(records.map((record) => record.status)),
      providers: uniqueSorted(records.map((record) => record.provider)),
    }),
    [records],
  );

  const visibleRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return records.filter((record) => {
      if (!jobMatchesQuickFilter(record, activeFilter)) {
        return false;
      }

      if (sourceFilter !== 'all' && record.sourceKind !== sourceFilter) {
        return false;
      }

      if (typeFilter !== 'all' && record.type !== typeFilter) {
        return false;
      }

      if (statusFilter !== 'all' && record.status !== statusFilter) {
        return false;
      }

      if (providerFilter !== 'all' && record.provider !== providerFilter) {
        return false;
      }

      return jobMatchesKeyword(record, keyword);
    });
  }, [activeFilter, providerFilter, records, search, sourceFilter, statusFilter, typeFilter]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    activeFilter !== 'all' ||
    sourceFilter !== 'all' ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    providerFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setActiveFilter('all');
    setSourceFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
    setProviderFilter('all');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">AI 任务</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AI 任务与 Agent 运行记录的类型、用户、输入、供应商模型、能力快照、输出引用、错误与复跑入口。
          </p>
        </div>
        <StatusBadge
          value={source === 'database' ? adminText.source.database : adminText.source.seed}
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
              <p className="text-xs font-medium uppercase text-muted-foreground">{metric.label}</p>
              <StatusBadge value={metric.hint} tone={metric.tone} />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <Card className="gap-0 rounded-lg border-border bg-card py-0 shadow-sm">
        <CardHeader className="gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">任务队列</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                当前显示 {visibleRecords.length}/{records.length} 个任务
              </p>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative w-full md:w-96">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索提示词、用户、供应商、模型、输出、错误或状态..."
                  className="h-9 rounded-md border-input bg-background pl-8 text-sm"
                />
              </div>
              <Button type="button" variant="outline" className="h-9 rounded-md" disabled>
                <SlidersHorizontal className="h-4 w-4" />
                本地筛选
              </Button>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-md text-muted-foreground"
                  onClick={resetFilters}
                >
                  <X className="h-4 w-4" />
                  重置
                </Button>
              ) : null}
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

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-input bg-background">
                <SelectValue placeholder="记录来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                <SelectItem value="ai_job">AI 任务</SelectItem>
                <SelectItem value="agent_run">Agent 运行记录</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-input bg-background">
                <SelectValue placeholder="任务类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部任务类型</SelectItem>
                {filterOptions.types.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-input bg-background">
                <SelectValue placeholder="任务状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部任务状态</SelectItem>
                {filterOptions.statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-input bg-background">
                <SelectValue placeholder="供应商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商</SelectItem>
                {filterOptions.providers.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    当前筛选条件下暂无 AI 任务记录
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
