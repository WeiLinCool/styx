'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import { AdminModuleGuide } from './admin-module-guide';
import { AdminPermissionsModule } from './admin-permissions-module';
import { StatusBadge } from './status-badge';
import type {
  AdminMembershipWorkspacePageData,
  MembershipPlanWorkspaceDto,
  MembershipPlanVersionRecord,
  MembershipVersionBenefitInput,
} from '@/server/repositories/membership-plan-versions';
import type { MembershipPlanPermissionWorkspace } from '@/server/repositories/membership-plan-permissions';

type AdminMembershipConfigModuleProps = {
  data: AdminMembershipWorkspacePageData;
};

type BenefitDraft = MembershipVersionBenefitInput;

type DraftFormState = {
  displayName: string;
  description: string;
  billingPeriod: 'month' | 'year' | 'one_time';
  priceCents: string;
  currency: string;
  changeSummary: string;
  benefits: BenefitDraft[];
  permissionCodes: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasErrorMessage(value: unknown): value is { error?: { message?: string } } {
  return isRecord(value) && 'error' in value;
}

function MembershipMetricCards({
  metrics,
}: {
  metrics: AdminMembershipWorkspacePageData['metrics'];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">{metric.label}</p>
            <StatusBadge value={metric.hint} tone={metric.tone} />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{metric.value}</p>
        </div>
      ))}
    </div>
  );
}

function buildFormState(version: MembershipPlanVersionRecord | null): DraftFormState {
  return {
    displayName: version?.displayName ?? '',
    description: version?.description ?? '',
    billingPeriod: version?.billingPeriod ?? 'month',
    priceCents: String(version?.priceCents ?? 0),
    currency: version?.currency ?? 'CNY',
    changeSummary: version?.changeSummary ?? '',
    benefits: version?.benefits.map((benefit) => ({ ...benefit })) ?? [],
    permissionCodes: [...(version?.permissionCodes ?? [])],
  };
}

async function readWorkspace(planId: string): Promise<MembershipPlanWorkspaceDto> {
  const response = await adminApiRequest(`/api/admin/memberships/plans/${planId}/workspace`, {
    cache: 'no-store',
  });
  const payload = await readJsonResponse<MembershipPlanWorkspaceDto | { error?: { message?: string } }>(
    response,
  );
  if (!response.ok || !payload || hasErrorMessage(payload)) {
    throw new Error(
      payload && hasErrorMessage(payload) && typeof payload.error?.message === 'string'
        ? payload.error.message
        : '加载会员方案工作台失败。',
    );
  }

  return payload;
}

async function postAdminJson<T>(url: string, body?: Record<string, unknown>) {
  const response = await adminApiRequest(url, {
    method: 'POST',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await readJsonResponse<T | { error?: { message?: string } }>(response);
  if (!response.ok || !payload || (hasErrorMessage(payload) && payload.error)) {
    throw new Error(
      payload && hasErrorMessage(payload) && typeof payload.error?.message === 'string'
        ? payload.error.message
        : '后台操作失败。',
    );
  }

  return payload as T;
}

async function putAdminJson<T>(url: string, body: Record<string, unknown>) {
  const response = await adminApiRequest(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse<T | { error?: { message?: string } }>(response);
  if (!response.ok || !payload || (hasErrorMessage(payload) && payload.error)) {
    throw new Error(
      payload && hasErrorMessage(payload) && typeof payload.error?.message === 'string'
        ? payload.error.message
        : '后台操作失败。',
    );
  }

  return payload as T;
}

export function AdminMembershipConfigModule({ data }: AdminMembershipConfigModuleProps) {
  const [workspace, setWorkspace] = useState(data.workspace);
  const [selectedPlanId, setSelectedPlanId] = useState(data.workspace.plan.id);
  const [tab, setTab] = useState<'pricing' | 'benefits' | 'permissions'>('pricing');
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [duplicatingVersionId, setDuplicatingVersionId] = useState<string | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');

  const editableVersion = workspace.draftVersion ?? workspace.currentVersion;
  const [formState, setFormState] = useState<DraftFormState>(buildFormState(editableVersion));

  useEffect(() => {
    setFormState(buildFormState(workspace.draftVersion ?? workspace.currentVersion));
  }, [workspace]);

  const current = workspace.currentVersion;
  const scheduled = workspace.scheduledVersion;

  const permissionWorkspace: MembershipPlanPermissionWorkspace = useMemo(
    () => ({
      plan: workspace.plan,
      plans: [workspace.plan],
      selectedCodes: formState.permissionCodes,
      modules: data.permissionOverview.records.reduce<MembershipPlanPermissionWorkspace['modules']>(
        (groups, resource) => {
          const existing = groups.find((group) => group.key === resource.module);
          const entry = {
            id: resource.id,
            code: resource.code,
            name: resource.name,
            resourceType: resource.resourceType,
            description: resource.description,
            routePattern: resource.routePattern,
            actionKey: resource.actionKey,
            dependsOn: resource.dependsOn,
            recommendedWith: resource.recommendedWith,
          };

          if (existing) {
            existing.resources.push(entry);
            return groups;
          }

          return [...groups, { key: resource.module, label: resource.module, resources: [entry] }];
        },
        [],
      ),
    }),
    [data.permissionOverview.records, formState.permissionCodes, workspace.plan],
  );

  async function refreshWorkspace(planId = selectedPlanId) {
    const next = await readWorkspace(planId);
    setWorkspace(next);
  }

  async function loadPlan(planId: string) {
    if (planId === selectedPlanId) {
      return;
    }

    setLoadingPlan(true);
    try {
      const next = await readWorkspace(planId);
      setWorkspace(next);
      setSelectedPlanId(planId);
      setFormState(buildFormState(next.draftVersion ?? next.currentVersion));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载会员方案工作台失败。');
    } finally {
      setLoadingPlan(false);
    }
  }

  function updateBenefit(index: number, patch: Partial<BenefitDraft>) {
    setFormState((currentState) => ({
      ...currentState,
      benefits: currentState.benefits.map((benefit, benefitIndex) =>
        benefitIndex === index ? { ...benefit, ...patch } : benefit,
      ),
    }));
  }

  async function saveDraft() {
    setSavingDraft(true);
    try {
      await putAdminJson(`/api/admin/memberships/plans/${selectedPlanId}/draft`, {
        displayName: formState.displayName,
        description: formState.description || null,
        billingPeriod: formState.billingPeriod,
        priceCents: Number(formState.priceCents || 0),
        currency: formState.currency,
        changeSummary: formState.changeSummary || null,
        permissionCodes: formState.permissionCodes,
        benefits: formState.benefits.map((benefit) => ({
          ...benefit,
          quantity: benefit.quantity === null ? null : Number(benefit.quantity),
        })),
      });
      toast.success('会员草稿已保存。');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存会员草稿失败。');
    } finally {
      setSavingDraft(false);
    }
  }

  async function publishNow() {
    setPublishing(true);
    try {
      await postAdminJson(`/api/admin/memberships/plans/${selectedPlanId}/publish`);
      toast.success('会员版本已发布。');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发布会员版本失败。');
    } finally {
      setPublishing(false);
    }
  }

  async function schedulePublish() {
    setScheduling(true);
    try {
      await postAdminJson(`/api/admin/memberships/plans/${selectedPlanId}/schedule`, {
        effectiveFrom: new Date(scheduleValue).toISOString(),
      });
      toast.success('会员版本已预定生效。');
      setScheduleDialogOpen(false);
      setScheduleValue('');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '预定生效失败。');
    } finally {
      setScheduling(false);
    }
  }

  async function duplicateVersion(versionId: string) {
    setDuplicatingVersionId(versionId);
    try {
      await postAdminJson(
        `/api/admin/memberships/plans/${selectedPlanId}/history/${versionId}/duplicate`,
      );
      toast.success('已从历史版本复制为新草稿。');
      await refreshWorkspace();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '复制历史版本失败。');
    } finally {
      setDuplicatingVersionId(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminModuleGuide
        title="第一次配置会员方案"
        description="会员方案以版本方式管理。管理员编辑的是下一版价格、权益和权限绑定；已生效用户会保留当前周期的历史版本，只有新开通和续费才会进入新版本。"
        steps={[
          '先选择要维护的会员方案，确认当前发布版本、预定生效版本和正在编辑的草稿是否一致。',
          '在草稿中完成价格、权益规则和权限绑定调整，必要时填写本次变更说明。',
          '发布时选择立即生效或预定生效时间；发布后只影响新开通和后续续费，不覆盖已生效用户当期权益。',
        ]}
        risks={[
          '删除权限或权益不会回收当前周期内已生效用户的能力，需确认下个续费周期的预期变化。',
          '调整价格后，续费用户将按新版本价格结算，必要时先通知运营和客服。',
          '同一方案同一时间只能保留一个待生效版本，避免续费结算出现版本歧义。',
        ]}
      />

      <MembershipMetricCards metrics={data.metrics} />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">会员方案</h3>
              <p className="mt-1 text-xs text-muted-foreground">选择要维护的版本化会员方案。</p>
            </div>
            {loadingPlan ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="space-y-2">
            {data.plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => void loadPlan(plan.id)}
                className={`w-full rounded-md border px-3 py-3 text-left ${
                  selectedPlanId === plan.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-secondary'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{plan.name}</div>
                  <span className="text-[11px] opacity-70">{plan.code}</span>
                </div>
                <div className="mt-2 space-y-1 text-xs opacity-80">
                  <div>当前: {plan.currentVersionLabel}</div>
                  <div>下一版: {plan.nextVersionLabel}</div>
                  <div>价格: {plan.priceLabel}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-4">
          <Card className="rounded-lg border-border bg-card shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{workspace.plan.name}</CardTitle>
                  <CardDescription className="mt-1 text-xs leading-5 text-muted-foreground">
                    方案编码：{workspace.plan.code}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {current ? (
                    <StatusBadge value={`Published V${current.versionNumber}`} tone="success" />
                  ) : null}
                  {scheduled ? (
                    <StatusBadge value={`Scheduled V${scheduled.versionNumber}`} tone="warning" />
                  ) : null}
                  {editableVersion ? (
                    <StatusBadge
                      value={`${editableVersion.status} V${editableVersion.versionNumber}`}
                      tone="info"
                    />
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">当前发布</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {current ? `${current.displayName} · ¥${current.priceCents / 100}` : '未发布'}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">草稿</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {workspace.draftVersion
                      ? `${workspace.draftVersion.displayName} · V${workspace.draftVersion.versionNumber}`
                      : '当前直接基于已发布版本编辑'}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">预定生效</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {scheduled?.effectiveFrom ?? '未设置'}
                  </div>
                </div>
              </div>

              <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="gap-4">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                  <TabsTrigger value="pricing" className="h-8 px-3">
                    基础信息与价格
                  </TabsTrigger>
                  <TabsTrigger value="benefits" className="h-8 px-3">
                    权益规则
                  </TabsTrigger>
                  <TabsTrigger value="permissions" className="h-8 px-3">
                    权限绑定
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="pricing" className="mt-0">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">展示名称</label>
                      <Input
                        value={formState.displayName}
                        onChange={(event) =>
                          setFormState((currentState) => ({
                            ...currentState,
                            displayName: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">价格（分）</label>
                      <Input
                        type="number"
                        value={formState.priceCents}
                        onChange={(event) =>
                          setFormState((currentState) => ({
                            ...currentState,
                            priceCents: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">计费周期</label>
                      <Input
                        value={formState.billingPeriod}
                        onChange={(event) =>
                          setFormState((currentState) => ({
                            ...currentState,
                            billingPeriod: event.target.value as DraftFormState['billingPeriod'],
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">币种</label>
                      <Input
                        value={formState.currency}
                        onChange={(event) =>
                          setFormState((currentState) => ({
                            ...currentState,
                            currency: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">方案描述</label>
                      <Textarea
                        value={formState.description}
                        onChange={(event) =>
                          setFormState((currentState) => ({
                            ...currentState,
                            description: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-medium text-muted-foreground">版本说明</label>
                      <Textarea
                        value={formState.changeSummary}
                        onChange={(event) =>
                          setFormState((currentState) => ({
                            ...currentState,
                            changeSummary: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="benefits" className="mt-0">
                  <div className="space-y-3">
                    {formState.benefits.map((benefit, index) => (
                      <div key={`${benefit.code}-${index}`} className="rounded-md border border-border bg-card p-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            value={benefit.name}
                            onChange={(event) => updateBenefit(index, { name: event.target.value })}
                            placeholder="权益名称"
                          />
                          <Input
                            value={benefit.code}
                            onChange={(event) => updateBenefit(index, { code: event.target.value })}
                            placeholder="权益编码"
                          />
                          <Input
                            value={benefit.kind}
                            onChange={(event) =>
                              updateBenefit(index, {
                                kind: event.target.value as BenefitDraft['kind'],
                              })
                            }
                            placeholder="权益类型"
                          />
                          <Input
                            type="number"
                            value={benefit.quantity ?? ''}
                            onChange={(event) =>
                              updateBenefit(index, {
                                quantity: event.target.value ? Number(event.target.value) : null,
                              })
                            }
                            placeholder="数量"
                          />
                          <Input
                            value={benefit.unit ?? ''}
                            onChange={(event) => updateBenefit(index, { unit: event.target.value || null })}
                            placeholder="单位"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setFormState((currentState) => ({
                                ...currentState,
                                benefits: currentState.benefits.filter((_, benefitIndex) => benefitIndex !== index),
                              }))
                            }
                          >
                            删除权益
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setFormState((currentState) => ({
                          ...currentState,
                          benefits: [
                            ...currentState.benefits,
                            {
                              code: '',
                              name: '',
                              kind: 'quota',
                              quantity: null,
                              unit: null,
                            },
                          ],
                        }))
                      }
                    >
                      新增权益
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="permissions" className="mt-0">
                  <AdminPermissionsModule
                    mode="embedded"
                    selectedCodes={formState.permissionCodes}
                    onSelectedCodesChange={(codes) =>
                      setFormState((currentState) => ({
                        ...currentState,
                        permissionCodes: codes,
                      }))
                    }
                    data={{
                      overview: data.permissionOverview,
                      workspace: permissionWorkspace,
                    }}
                  />
                </TabsContent>
              </Tabs>

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" onClick={() => void saveDraft()} disabled={savingDraft}>
                  {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  保存草稿
                </Button>
                <Button type="button" onClick={() => void publishNow()} disabled={publishing || savingDraft}>
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  立即发布
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setScheduleDialogOpen(true)}
                  disabled={scheduling || savingDraft}
                >
                  预定生效
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle>历史版本</CardTitle>
              <CardDescription className="text-xs leading-5 text-muted-foreground">
                已发布、预定和历史归档版本。v1 通过复制历史版本生成新草稿进行回滚。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspace.history.length ? (
                workspace.history.map((version) => (
                  <div key={version.id} className="rounded-md border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-foreground">
                        V{version.versionNumber} · {version.displayName}
                      </div>
                      <StatusBadge value={version.status} tone="default" />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      生效: {version.effectiveFrom ?? '未设置'} · 发布: {version.publishedAt ?? '未发布'}
                    </div>
                    {version.changeSummary ? (
                      <div className="mt-2 text-xs text-muted-foreground">{version.changeSummary}</div>
                    ) : null}
                    <div className="mt-3 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={duplicatingVersionId === version.id}
                        onClick={() => void duplicateVersion(version.id)}
                      >
                        {duplicatingVersionId === version.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        复制为新草稿
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  暂无历史版本。
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>预定会员版本生效时间</DialogTitle>
            <DialogDescription>
              发布后的新版本只影响新开通和续费用户，不会覆盖当前周期已生效的用户权益。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">生效时间</label>
            <Input
              type="datetime-local"
              value={scheduleValue}
              onChange={(event) => setScheduleValue(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setScheduleDialogOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void schedulePublish()}
              disabled={!scheduleValue || scheduling}
            >
              {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认预定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
