'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  AdminFilter,
  AdminMetric,
  AdminMetricTone,
} from '@/server/repositories/admin-shared';
import type {
  AdminAiModelRow,
  AdminAiProviderRow,
} from '@/server/repositories/ai-models';
import { AdminAiModelActions, AdminAiProviderActions } from './admin-action-controls';
import { formatAdminAiLabel, formatAdminAiText } from './admin-ai-labels';
import { StatusBadge } from './status-badge';

const metricToneClassName: Record<AdminMetricTone, string> = {
  default: 'border-border bg-card',
  success: 'border-success/30 bg-success-surface',
  warning: 'border-warning/30 bg-warning-surface',
  danger: 'border-destructive/30 bg-destructive/10',
  info: 'border-info/30 bg-info-surface',
};

const credentialTone = {
  valid: 'success',
  invalid: 'danger',
  not_required: 'default',
} as const;

const operationalStatusTone = {
  enabled: 'success',
  disabled: 'warning',
  archived: 'default',
} as const;

function DetailList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-md border border-border bg-secondary/70 px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function formatFilterLabel(filter: AdminFilter) {
  return filter.value === 'all' ? '全部' : formatAdminAiLabel(filter.value);
}

function providerMatchesKeyword(provider: AdminAiProviderRow, keyword: string) {
  if (!keyword) {
    return true;
  }

  return [
    provider.name,
    provider.code,
    provider.providerType,
    provider.status,
    provider.baseUrlLabel,
    provider.credential.status,
    provider.credential.label,
    provider.credential.detail,
  ]
    .join(' ')
    .toLowerCase()
    .includes(keyword);
}

function billingRuleSummary(provider: AdminAiProviderRow) {
  const rules = provider.billingRules;
  const items: string[] = [];

  if (rules.chat) {
    items.push(
      `对话 ${rules.chat.inputCreditsPer1k}/${rules.chat.cachedInputCreditsPer1k}/${rules.chat.cacheMissInputCreditsPer1k}/${rules.chat.outputCreditsPer1k} 积分/千 token，最低 ${rules.chat.minimumCredits}`,
    );
  }

  if (rules.image) {
    const detail =
      rules.image.mode === 'fixed'
        ? `固定 ${rules.image.fixedCredits ?? rules.image.minimumCredits} 积分`
        : rules.image.mode === 'per_image'
          ? `每图 ${rules.image.imageCredits ?? rules.image.minimumCredits} 积分`
          : `${rules.image.tokenCreditsPer1k ?? 0} 积分/千 token`;

    items.push(`图像 ${formatAdminAiLabel(rules.image.mode)}，${detail}，最低 ${rules.image.minimumCredits}`);
  }

  if (rules.video) {
    const detail =
      rules.video.mode === 'video_seconds'
        ? `${rules.video.secondsCredits ?? 0} 积分/秒`
        : `${rules.video.tokenCreditsPer1k ?? 0} 积分/千 token`;
    const multiplierCount = Object.keys(rules.video.resolutionMultipliers ?? {}).length;

    items.push(
      `视频 ${formatAdminAiLabel(rules.video.mode)}，${detail}，最低 ${rules.video.minimumCredits}${
        multiplierCount > 0 ? `，${multiplierCount} 个分辨率倍率` : ''
      }`,
    );
  }

  return items.length > 0 ? items : ['未配置计费规则'];
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

  if (filter === 'image') {
    return (
      model.supportsImageGeneration ||
      model.supportsImageEdit ||
      model.supportsImageUpscale
    );
  }

  if (filter === 'video') {
    return model.supportsVideoGeneration;
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
    model.supportsImageGeneration
      ? 'image generate supports_image_generation 图像生成'
      : 'no_image_generate 不支持图像生成',
    model.supportsImageEdit
      ? 'image edit supports_image_edit 图像编辑'
      : 'no_image_edit 不支持图像编辑',
    model.supportsImageUpscale
      ? 'image upscale supports_image_upscale 图像放大'
      : 'no_image_upscale 不支持图像放大',
    model.supportsVideoGeneration
      ? 'video generation supports_video_generation 视频生成'
      : 'no_video_generation 不支持视频生成',
    model.isDefaultImage ? 'default image 默认图像模型' : 'not_default_image 非默认图像模型',
    model.isDefaultVideo ? 'default video 默认视频模型' : 'not_default_video 非默认视频模型',
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
        <div className="font-medium text-foreground">{model.name}</div>
        <div className="text-xs text-muted-foreground">{model.code}</div>
        <div className="mt-1 text-xs text-muted-foreground">{model.model}</div>
      </div>
    ),
  },
  {
    key: 'provider',
    label: '供应商',
    render: (model) => (
      <div>
        <div className="text-sm font-medium text-foreground">{model.providerName}</div>
        <div className="text-xs text-muted-foreground">{model.providerCode}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <StatusBadge value={formatAdminAiLabel(model.providerType)} />
          <StatusBadge
            value={formatAdminAiLabel(model.providerStatus)}
            tone={operationalStatusTone[model.providerStatus]}
          />
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
          formatAdminAiLabel(model.status),
          model.supportsChat ? '支持对话' : '不支持对话',
          model.supportsImageGeneration ? '支持图像生成' : '不支持图像生成',
          model.supportsImageEdit ? '支持图像编辑' : '不支持图像编辑',
          model.supportsImageUpscale ? '支持图像放大' : '不支持图像放大',
          model.supportsVideoGeneration ? '支持视频生成' : '不支持视频生成',
          model.isDefaultChat ? '默认对话模型' : '非默认对话模型',
          model.isDefaultImage ? '默认图像模型' : '非默认图像模型',
          model.isDefaultVideo ? '默认视频模型' : '非默认视频模型',
        ]}
      />
    ),
  },
  {
    key: 'entitlement',
    label: '权益要求',
    render: (model) => (
      <div className="max-w-xs text-xs text-muted-foreground">
        {formatAdminAiText(model.entitlementSummary)}
      </div>
    ),
  },
  {
    key: 'pricing',
    label: '价格',
    render: (model) => (
      <div className="max-w-sm text-xs text-muted-foreground">
        {formatAdminAiText(model.pricingSummary)}
      </div>
    ),
  },
  {
    key: 'credential',
    label: '凭据引用',
    render: (model) => (
      <div>
        <StatusBadge
          value={formatAdminAiLabel(model.credential.status)}
          tone={credentialTone[model.credential.status]}
        />
        <div className="mt-1 text-xs text-muted-foreground">
          {formatAdminAiText(model.credential.label)}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {formatAdminAiText(model.credential.detail)}
        </div>
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
  const [collapsedProviderIds, setCollapsedProviderIds] = useState<Set<string>>(() => new Set());

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

  const providerGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const recordsByProvider = new Map<string, AdminAiModelRow[]>();

    for (const record of visibleRecords) {
      recordsByProvider.set(record.providerId, [
        ...(recordsByProvider.get(record.providerId) ?? []),
        record,
      ]);
    }

    return providers
      .filter((provider) => {
        if (providerFilter !== 'all' && provider.id !== providerFilter) {
          return false;
        }

        if (providerTypeFilter !== 'all' && provider.providerType !== providerTypeFilter) {
          return false;
        }

        if (credentialFilter !== 'all' && provider.credential.status !== credentialFilter) {
          return false;
        }

        const groupRecords = recordsByProvider.get(provider.id) ?? [];
        const matchesProviderKeyword = providerMatchesKeyword(provider, keyword);
        const hasModelLevelFilter =
          activeFilter !== 'all' || modelStatusFilter !== 'all' || keyword.length > 0;

        if (hasModelLevelFilter) {
          return groupRecords.length > 0 || matchesProviderKeyword;
        }

        return true;
      })
      .map((provider) => ({
        provider,
        records: recordsByProvider.get(provider.id) ?? [],
      }));
  }, [
    activeFilter,
    credentialFilter,
    modelStatusFilter,
    providerFilter,
    providerTypeFilter,
    providers,
    search,
    visibleRecords,
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

  const toggleProviderCollapsed = (providerId: string) => {
    setCollapsedProviderIds((current) => {
      const next = new Set(current);

      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }

      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">AI 模型</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            管理用户对话、图像、视频使用的 AI 供应商、模型、默认状态、权益门槛、价格与凭据引用检查。
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
              <p className="text-xs font-medium text-muted-foreground">
                {formatAdminAiText(metric.label)}
              </p>
              <StatusBadge value={formatAdminAiText(metric.hint)} tone={metric.tone} />
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
              <CardTitle className="text-sm font-semibold">供应商与模型</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                当前显示 {providerGroups.length}/{providers.length} 个供应商，{visibleRecords.length}/{records.length} 个模型
              </p>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative w-full md:w-96">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索模型、供应商、状态、权益、价格或凭据..."
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
                  {formatFilterLabel(filter)}
                  {typeof filter.count === 'number' ? ` ${filter.count}` : ''}
                </Button>
              );
            })}
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-input bg-background">
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
              <SelectTrigger className="h-9 w-full rounded-md border-input bg-background">
                <SelectValue placeholder="供应商类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商类型</SelectItem>
                <SelectItem value="openai_compatible">
                  {formatAdminAiLabel('openai_compatible')}
                </SelectItem>
                <SelectItem value="development">
                  {formatAdminAiLabel('development')}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={modelStatusFilter} onValueChange={setModelStatusFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-input bg-background">
                <SelectValue placeholder="模型状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模型状态</SelectItem>
                <SelectItem value="enabled">{formatAdminAiLabel('enabled')}</SelectItem>
                <SelectItem value="disabled">{formatAdminAiLabel('disabled')}</SelectItem>
                <SelectItem value="archived">{formatAdminAiLabel('archived')}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={credentialFilter} onValueChange={setCredentialFilter}>
              <SelectTrigger className="h-9 w-full rounded-md border-input bg-background">
                <SelectValue placeholder="凭据状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部凭据状态</SelectItem>
                <SelectItem value="valid">{formatAdminAiLabel('valid')}</SelectItem>
                <SelectItem value="invalid">{formatAdminAiLabel('invalid')}</SelectItem>
                <SelectItem value="not_required">
                  {formatAdminAiLabel('not_required')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-4">
          {providerGroups.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              当前筛选条件下暂无 AI 供应商或模型记录
            </div>
          ) : (
            providerGroups.map(({ provider, records: groupRecords }) => {
              const collapsed = collapsedProviderIds.has(provider.id);

              return (
                <Collapsible
                  key={provider.id}
                  open={!collapsed}
                  onOpenChange={() => toggleProviderCollapsed(provider.id)}
                  className="overflow-hidden rounded-lg border border-border bg-card shadow-sm ring-1 ring-border/60"
                >
                <div className="border-l-4 border-l-foreground bg-secondary/50">
                  <div className="flex flex-col gap-3 border-b border-border px-4 py-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <CollapsibleTrigger asChild>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="size-7 rounded-md"
                                aria-label={collapsed ? '展开供应商模型' : '收起供应商模型'}
                                title={collapsed ? '展开供应商模型' : '收起供应商模型'}
                              >
                                {collapsed ? (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={6}>
                            {collapsed ? '展开供应商模型' : '收起供应商模型'}
                          </TooltipContent>
                        </Tooltip>
                        <h3 className="text-sm font-semibold text-foreground">{provider.name}</h3>
                        <span className="text-xs text-muted-foreground">{provider.code}</span>
                        <StatusBadge value={formatAdminAiLabel(provider.providerType)} />
                        <StatusBadge
                          value={formatAdminAiLabel(provider.status)}
                          tone={operationalStatusTone[provider.status]}
                        />
                        <StatusBadge
                          value={collapsed ? '已收起' : '已展开'}
                          tone={collapsed ? 'default' : 'info'}
                        />
                      </div>
                      <div className="grid gap-2 text-xs text-muted-foreground lg:grid-cols-3">
                        <div>
                          <span className="text-muted-foreground">接口地址：</span>
                          <span className="break-all">
                            {formatAdminAiText(provider.baseUrlLabel)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">凭据：</span>
                          <StatusBadge
                            value={formatAdminAiLabel(provider.credential.status)}
                            tone={credentialTone[provider.credential.status]}
                          />
                          <span className="ml-1 break-all">
                            {formatAdminAiText(provider.credential.label)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">模型：</span>
                          已启用 {provider.enabledModelCount}/{provider.modelCount} · 当前显示{' '}
                          {groupRecords.length} · 对话 {provider.chatModelCount} · 视频{' '}
                          {provider.videoModelCount}
                        </div>
                      </div>
                      <DetailList items={billingRuleSummary(provider)} />
                    </div>
                    <AdminAiProviderActions provider={provider} />
                  </div>
                </div>

                <CollapsibleContent className="overflow-x-auto bg-card">
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
                      {groupRecords.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={columns.length}
                            className="h-20 text-center text-muted-foreground"
                          >
                            当前供应商下暂无符合条件的模型
                          </TableCell>
                        </TableRow>
                      ) : (
                        groupRecords.map((record) => (
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
                </CollapsibleContent>
                </Collapsible>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
