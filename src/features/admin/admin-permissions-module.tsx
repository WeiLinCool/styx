'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import type { MembershipPlanPermissionWorkspace } from '@/server/repositories/membership-plan-permissions';
import type { AdminPermissionResourceOverview } from '@/server/repositories/permission-resources';
import { StatusBadge } from './status-badge';
import { adminText } from './admin-i18n';

type AdminPermissionsModuleProps = {
  mode?: 'standalone' | 'embedded';
  selectedCodes?: string[];
  onSelectedCodesChange?: (codes: string[]) => void;
  data: {
    overview: AdminPermissionResourceOverview;
    workspace: MembershipPlanPermissionWorkspace;
  };
};

export function normalizePermissionCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .sort();
}

export function AdminPermissionsModule({
  mode = 'standalone',
  selectedCodes: controlledSelectedCodes,
  onSelectedCodesChange,
  data,
}: AdminPermissionsModuleProps) {
  const [workspace, setWorkspace] = useState(data.workspace);
  const [selectedPlanId, setSelectedPlanId] = useState(data.workspace.plan.id);
  const [internalSelectedCodes, setInternalSelectedCodes] = useState<string[]>(
    normalizePermissionCodes(data.workspace.selectedCodes),
  );
  const [search, setSearch] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [saving, setSaving] = useState(false);
  const embedded = mode === 'embedded';
  const selectedCodes = normalizePermissionCodes(controlledSelectedCodes ?? internalSelectedCodes);

  function updateSelectedCodes(next: string[]) {
    const normalized = normalizePermissionCodes(next);
    onSelectedCodesChange?.(normalized);
    if (controlledSelectedCodes === undefined) {
      setInternalSelectedCodes(normalized);
    }
  }

  const filteredModules = workspace.modules
    .map((module) => ({
      ...module,
      resources: module.resources.filter((resource) => {
        if (!search.trim()) {
          return true;
        }

        const query = search.trim().toLowerCase();
        return (
          resource.name.toLowerCase().includes(query) ||
          resource.code.toLowerCase().includes(query)
        );
      }),
    }))
    .filter((module) => module.resources.length > 0);

  async function loadPlan(planId: string) {
    setLoadingPlan(true);
    try {
      const response = await adminApiRequest(`/api/admin/permissions/plans/${planId}`, {
        cache: 'no-store',
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof payload?.error?.message === 'string' ? payload.error.message : '加载权限方案失败。',
        );
      }

      setWorkspace(payload);
      setSelectedPlanId(payload.plan.id);
      updateSelectedCodes(normalizePermissionCodes(payload.selectedCodes));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载权限方案失败。');
    } finally {
      setLoadingPlan(false);
    }
  }

  async function saveBindings() {
    setSaving(true);
    try {
      const response = await adminApiRequest(`/api/admin/permissions/plans/${selectedPlanId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ permissionCodes: selectedCodes }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof payload?.error?.message === 'string' ? payload.error.message : '保存权限绑定失败。',
        );
      }

      toast.success('权限绑定已保存');
      await loadPlan(selectedPlanId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存权限绑定失败。');
    } finally {
      setSaving(false);
    }
  }

  function toggleCode(code: string) {
    const current = selectedCodes;
    updateSelectedCodes(
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code].sort(),
    );
  }

  return (
    <div className="space-y-4">
      {embedded ? null : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.overview.metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">{metric.label}</p>
                <StatusBadge value={metric.hint} tone={metric.tone} />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{metric.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className={embedded ? 'space-y-4' : 'grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]'}>
        {embedded ? null : (
          <aside className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">会员方案</h3>
                <p className="mt-1 text-xs text-muted-foreground">选择要配置的方案。</p>
              </div>
              {loadingPlan ? <StatusBadge value={adminText.common.loading} tone="warning" /> : null}
            </div>
            <div className="space-y-2">
              {workspace.plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => void loadPlan(plan.id)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    selectedPlanId === plan.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <span>{plan.name}</span>
                  <span className="text-xs opacity-70">{plan.code}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{workspace.plan.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                勾选该会员方案可访问的菜单、页面、按钮和接口。
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索权限编码或名称"
                className="h-9 w-full md:w-72"
              />
              {embedded ? null : (
                <Button type="button" onClick={() => void saveBindings()} disabled={saving}>
                  {saving ? adminText.common.saving : adminText.common.save}
                </Button>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {filteredModules.map((module) => (
              <div key={module.key} className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{module.label}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">{module.key}</p>
                  </div>
                  <StatusBadge value={`${module.resources.length} 项`} tone="info" />
                </div>
                <div className="space-y-3">
                  {module.resources.map((resource) => {
                    const checked = selectedCodes.includes(resource.code);

                    return (
                      <label
                        key={resource.id}
                        className="flex items-start gap-3 rounded-md border border-border bg-secondary/20 p-3 text-sm hover:bg-secondary/50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCode(resource.code)}
                          className="mt-0.5 h-4 w-4 rounded border-border"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{resource.name}</span>
                            <StatusBadge value={resource.resourceType} tone="default" />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{resource.code}</div>
                          <div className="mt-2 text-xs text-muted-foreground">{resource.description}</div>
                          {resource.dependsOn.length > 0 ? (
                            <div className="mt-2 text-[11px] text-amber-700">
                              依赖: {resource.dependsOn.join(', ')}
                            </div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
