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
import type {
  AdminAiModelRow,
  AdminAiProviderRow,
} from '@/server/repositories/ai-models';
import { AdminAiModelActions } from './admin-action-controls';
import { StatusBadge } from './status-badge';

const metricToneClassName: Record<AdminMetricTone, string> = {
  default: 'border-neutral-200 bg-white',
  success: 'border-emerald-200 bg-emerald-50',
  warning: 'border-amber-200 bg-amber-50',
  danger: 'border-red-200 bg-red-50',
  info: 'border-blue-200 bg-blue-50',
};

const credentialTone = {
  valid: 'success',
  invalid: 'danger',
  not_required: 'default',
} as const;

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

function modelMatchesQuickFilter(model: AdminAiModelRow, filter: string) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'chat') {
    return model.supportsChat;
  }

  if (filter === 'default') {
    return model.isDefaultChat;
  }

  return model.status === filter;
}

function modelMatchesKeyword(model: AdminAiModelRow, keyword: string) {
  if (!keyword) {
    return true;
  }

  const haystack = [
    model.name,
    model.code,
    model.model,
    model.status,
    model.supportsChat ? 'chat supports_chat 支持对话' : 'no_chat 不支持对话',
    model.isDefaultChat ? 'default 默认模型' : 'not_default 非默认',
    model.providerName,
    model.providerCode,
    model.providerType,
    model.providerStatus,
    model.entitlementSummary,
    model.pricingSummary,
    model.credential.status,
    model.credential.label,
    model.credential.detail,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(keyword);
}

type AiModelColumn = {
  key: string;
  label: string;
  className?: string;
  render: (record: AdminAiModelRow, providers: AdminAiProviderRow[]) => ReactNode;
};

const columns: AiModelColumn[] = [
  {
    key: 'model',
    label: '模型',
    render: (model) => (
      <div>
        <div className="font-medium text-neutral-950">{model.name}</div>
        <div className="text-xs text-neutral-500">{model.code}</div>
        <div className="mt-1 text-xs text-neutral-600">{model.model}</div>
      </div>
    ),
  },
  {
    key: 'provider',
    label: '供应商',
    render: (model) => (
      <div>
        <div className="text-sm font-medium text-neutral-900">{model.providerName}</div>
        <div className="text-xs text-neutral-500">{model.providerCode}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <StatusBadge value={model.providerType} />
          <StatusBadge value={model.providerStatus} />
        </div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '支持 / 默认',
    render: (model) => (
      <DetailList
        items={[
          model.status,
          model.supportsChat ? 'chat' : 'no chat',
          model.isDefaultChat ? 'default chat' : 'not default',
        ]}
      />
    ),
  },
  {
    key: 'entitlement',
    label: '权益要求',
    render: (model) => (
      <div className="max-w-xs text-xs text-neutral-700">{model.entitlementSummary}</div>
    ),
  },
  {
    key: 'pricing',
    label: '价格',
    render: (model) => (
      <div className="max-w-sm text-xs text-neutral-700">{model.pricingSummary}</div>
    ),
  },
  {
    key: 'credential',
    label: '凭据引用',
    render: (model) => (
      <div>
        <StatusBadge
          value={model.credential.status}
          tone={credentialTone[model.credential.status]}
        />
        <div className="mt-1 text-xs text-neutral-700">{model.credential.label}</div>
        <div className="mt-0.5 text-xs text-neutral-500">{model.credential.detail}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (model, providers) => <AdminAiModelActions model={model} providers={providers} />,
  },
];

type AdminAiModelsModuleProps = {
  source: 'database' | 'seed';
  metrics: AdminMetric[];
  filters: AdminFilter[];
  records: AdminAiModelRow[];
  providers: AdminAiProviderRow[];
};

export function AdminAiModelsModule({
  source,
  metrics,
  filters,
  records,
  providers,
}: AdminAiModelsModuleProps) {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [providerTypeFilter, setProviderTypeFilter] = useState('all');
  const [modelStatusFilter, setModelStatusFilter] = useState('all');
  const [credentialFilter, setCredentialFilter] = useState('all');

  const visibleRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return records.filter((record) => {
      if (!modelMatchesQuickFilter(record, activeFilter)) {
        return false;
      }

      if (providerFilter !== 'all' && record.providerId !== providerFilter) {
        return false;
      }

      if (providerTypeFilter !== 'all' && record.providerType !== providerTypeFilter) {
        return false;
      }

      if (modelStatusFilter !== 'all' && record.status !== modelStatusFilter) {
        return false;
      }

      if (credentialFilter !== 'all' && record.credential.status !== credentialFilter) {
        return false;
      }

      return modelMatchesKeyword(record, keyword);
    });
  }, [
    activeFilter,
    credentialFilter,
    modelStatusFilter,
    providerFilter,
    providerTypeFilter,
    records,
    search,
  ]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    activeFilter !== 'all' ||
    providerFilter !== 'all' ||
    providerTypeFilter !== 'all' ||
    modelStatusFilter !== 'all' ||
    credentialFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setActiveFilter('all');
    setProviderFilter('all');
    setProviderTypeFilter('all');
    setModelStatusFilter('all');
    setCredentialFilter('all');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-950">AI 模型</h2>
          <p className="mt-1 text-sm text-neutral-600">
            管理用户 Chat 使用的 AI 供应商、模型、默认状态、权益门槛、价格与凭据引用检查。
          </p>
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
            <div>
              <CardTitle className="text-sm font-semibold">模型队列</CardTitle>
              <p className="mt-1 text-xs text-neutral-500">
                当前显示 {visibleRecords.length}/{records.length} 个模型
              </p>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative w-full md:w-96">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-neutral-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索模型、供应商、状态、权益、价格或凭据..."
                  className="h-9 rounded-md border-neutral-200 pl-8 text-sm"
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
                  className="h-9 rounded-md text-neutral-600"
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
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white">
                <SelectValue placeholder="供应商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商</SelectItem>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={providerTypeFilter} onValueChange={setProviderTypeFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white">
                <SelectValue placeholder="供应商类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商类型</SelectItem>
                <SelectItem value="openai_compatible">openai_compatible</SelectItem>
                <SelectItem value="development">development</SelectItem>
              </SelectContent>
            </Select>

            <Select value={modelStatusFilter} onValueChange={setModelStatusFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white">
                <SelectValue placeholder="模型状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模型状态</SelectItem>
                <SelectItem value="enabled">enabled</SelectItem>
                <SelectItem value="disabled">disabled</SelectItem>
                <SelectItem value="archived">archived</SelectItem>
              </SelectContent>
            </Select>

            <Select value={credentialFilter} onValueChange={setCredentialFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-neutral-200 bg-white">
                <SelectValue placeholder="凭据状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部凭据状态</SelectItem>
                <SelectItem value="valid">valid</SelectItem>
                <SelectItem value="invalid">invalid</SelectItem>
                <SelectItem value="not_required">not_required</SelectItem>
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
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-neutral-500"
                  >
                    当前筛选条件下暂无 AI 模型记录
                  </TableCell>
                </TableRow>
              ) : (
                visibleRecords.map((record) => (
                  <TableRow key={record.id}>
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        {column.render(record, providers)}
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
