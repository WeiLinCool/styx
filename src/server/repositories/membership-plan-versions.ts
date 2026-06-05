import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db, schema } from '@/server/db';
import { ensureAdminReadSource, formatCurrency, formatIso } from './admin-shared';
import {
  getAdminPermissionResourceOverview,
  type AdminPermissionResourceOverview,
} from './permission-resources';
import {
  getVideoGenerationConfigRepository,
  type VideoPlanConfig,
} from './video-generation-config';

export type MembershipPlanVersionStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export type MembershipVersionBenefitInput = {
  code: string;
  name: string;
  kind: 'quota' | 'feature' | 'discount' | 'support';
  quantity: number | null;
  unit: string | null;
};

export type MembershipMediaLibraryPolicy = {
  storageQuotaBytes: number;
  allowUserUpload: boolean;
  allowPublicSharing: boolean;
};

export type MembershipPlanVersionRecord = {
  id: string;
  planId: string;
  planCode: string;
  versionNumber: number;
  status: MembershipPlanVersionStatus;
  effectiveFrom: string | null;
  publishedAt: string | null;
  displayName: string;
  description: string | null;
  billingPeriod: 'month' | 'year' | 'one_time';
  priceCents: number;
  currency: string;
  changeSummary: string | null;
  benefits: MembershipVersionBenefitInput[];
  mediaLibraryPolicy: MembershipMediaLibraryPolicy;
  videoGenerationPolicy: VideoPlanConfig | null;
  permissionCodes: string[];
};

export type MembershipPlanWorkspaceDto = {
  plan: { id: string; code: string; name: string };
  currentVersion: MembershipPlanVersionRecord | null;
  draftVersion: MembershipPlanVersionRecord | null;
  scheduledVersion: MembershipPlanVersionRecord | null;
  history: MembershipPlanVersionRecord[];
};

type DraftInput = {
  planId: string;
  displayName: string;
  description: string | null;
  billingPeriod: 'month' | 'year' | 'one_time';
  priceCents: number;
  currency: string;
  changeSummary: string | null;
  benefits: MembershipVersionBenefitInput[];
  mediaLibraryPolicy: MembershipMediaLibraryPolicy;
  videoGenerationPolicy: VideoPlanConfig | null;
  permissionCodes: string[];
};

type MutableVersionStore = {
  listVersionsByPlanCode(planCode: string): Promise<MembershipPlanVersionRecord[]>;
  listVersionsByPlanId(planId: string): Promise<MembershipPlanVersionRecord[]>;
  getVersionById(versionId: string): Promise<MembershipPlanVersionRecord | null>;
  saveDraft(input: DraftInput): Promise<MembershipPlanVersionRecord>;
  publishDraft(planId: string): Promise<MembershipPlanVersionRecord>;
  scheduleDraft(
    planId: string,
    input: { effectiveFrom: string },
  ): Promise<MembershipPlanVersionRecord>;
  duplicateVersionAsDraft(planId: string, versionId: string): Promise<MembershipPlanVersionRecord>;
};

type HarnessInput = {
  versions?: MembershipPlanVersionRecord[];
  plans?: Array<{ id: string; code: string; name: string }>;
};

export type AdminMembershipWorkspacePageData = {
  source: 'database' | 'seed';
  metrics: Array<{ label: string; value: string; hint: string; tone: 'default' | 'success' | 'warning' | 'danger' | 'info' }>;
  permissionOverview: AdminPermissionResourceOverview;
  plans: Array<{
    id: string;
    code: string;
    name: string;
    currentVersionLabel: string;
    nextVersionLabel: string;
    priceLabel: string;
  }>;
  workspace: MembershipPlanWorkspaceDto;
};

function requireDb(operation: string) {
  if (!db || !process.env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is required for ${operation}.`);
  }

  return db;
}

function cloneBenefit(benefit: MembershipVersionBenefitInput): MembershipVersionBenefitInput {
  return {
    code: benefit.code,
    name: benefit.name,
    kind: benefit.kind,
    quantity: benefit.quantity,
    unit: benefit.unit,
  };
}

function cloneMediaPolicy(policy: MembershipMediaLibraryPolicy): MembershipMediaLibraryPolicy {
  return {
    storageQuotaBytes: policy.storageQuotaBytes,
    allowUserUpload: policy.allowUserUpload,
    allowPublicSharing: policy.allowPublicSharing,
  };
}

function cloneVideoPolicy(policy: VideoPlanConfig | null): VideoPlanConfig | null {
  return policy
    ? {
        enabled: policy.enabled,
        allowedDurations: [...policy.allowedDurations],
        allowedResolutions: [...policy.allowedResolutions],
        defaultDuration: policy.defaultDuration,
        defaultResolution: policy.defaultResolution,
      }
    : null;
}

function cloneVersion(version: MembershipPlanVersionRecord): MembershipPlanVersionRecord {
  return {
    ...version,
    benefits: version.benefits.map(cloneBenefit),
    mediaLibraryPolicy: cloneMediaPolicy(version.mediaLibraryPolicy),
    videoGenerationPolicy: cloneVideoPolicy(version.videoGenerationPolicy),
    permissionCodes: [...version.permissionCodes].sort(),
  };
}

function sortVersions(versions: MembershipPlanVersionRecord[]) {
  return [...versions].sort((left, right) => right.versionNumber - left.versionNumber);
}

function toMembershipPlanVersionRecord(params: {
  plan: { id: string; code: string };
  version: typeof schema.membershipPlanVersions.$inferSelect;
  benefits: MembershipVersionBenefitInput[];
  videoGenerationPolicy?: VideoPlanConfig | null;
  permissionCodes: string[];
}): MembershipPlanVersionRecord {
  return {
    id: params.version.id,
    planId: params.plan.id,
    planCode: params.plan.code,
    versionNumber: params.version.versionNumber,
    status: params.version.status,
    effectiveFrom: params.version.effectiveFrom ? params.version.effectiveFrom.toISOString() : null,
    publishedAt: params.version.publishedAt ? params.version.publishedAt.toISOString() : null,
    displayName: params.version.displayName,
    description: params.version.description,
    billingPeriod: params.version.billingPeriod,
    priceCents: params.version.priceCents,
    currency: params.version.currency,
    changeSummary: params.version.changeSummary,
    benefits: params.benefits.map(cloneBenefit),
    mediaLibraryPolicy: {
      storageQuotaBytes: params.version.mediaStorageQuotaBytes,
      allowUserUpload: params.version.mediaAllowUserUpload,
      allowPublicSharing: params.version.mediaAllowPublicSharing,
    },
    videoGenerationPolicy: cloneVideoPolicy(params.videoGenerationPolicy ?? null),
    permissionCodes: [...params.permissionCodes].sort(),
  };
}

function buildSeedPlans() {
  return [
    { id: 'seed:pro', code: 'pro-monthly', name: 'Pro Monthly' },
    { id: 'seed:team', code: 'team-yearly', name: 'Team Yearly' },
  ];
}

function buildSeedVersions(plans = buildSeedPlans()): MembershipPlanVersionRecord[] {
  const pro = plans.find((plan) => plan.code === 'pro-monthly') ?? plans[0]!;
  const team = plans.find((plan) => plan.code === 'team-yearly') ?? plans[1] ?? plans[0]!;

  return [
    {
      id: 'seed:pro-v1',
      planId: pro.id,
      planCode: pro.code,
      versionNumber: 1,
      status: 'published',
      effectiveFrom: '2026-06-01T00:00:00.000Z',
      publishedAt: '2026-06-01T00:00:00.000Z',
      displayName: 'Pro Monthly',
      description: '个人创作者月度方案。',
      billingPeriod: 'month',
      priceCents: 9900,
      currency: 'CNY',
      changeSummary: null,
      benefits: [
        {
          code: 'image-credits',
          name: 'Image generation credits',
          kind: 'quota',
          quantity: 500,
          unit: 'credit',
        },
      ],
      mediaLibraryPolicy: {
        storageQuotaBytes: 1073741824,
        allowUserUpload: true,
        allowPublicSharing: false,
      },
      videoGenerationPolicy: null,
      permissionCodes: ['action.user_center.copy_invite_code', 'page.user_center'],
    },
    {
      id: 'seed:team-v1',
      planId: team.id,
      planCode: team.code,
      versionNumber: 1,
      status: 'published',
      effectiveFrom: '2026-06-01T00:00:00.000Z',
      publishedAt: '2026-06-01T00:00:00.000Z',
      displayName: 'Team Yearly',
      description: '团队年度方案。',
      billingPeriod: 'year',
      priceCents: 99900,
      currency: 'CNY',
      changeSummary: null,
      benefits: [
        {
          code: 'video-minutes',
          name: 'Video generation minutes',
          kind: 'quota',
          quantity: 120,
          unit: 'minute',
        },
      ],
      mediaLibraryPolicy: {
        storageQuotaBytes: 2147483648,
        allowUserUpload: true,
        allowPublicSharing: true,
      },
      videoGenerationPolicy: null,
      permissionCodes: ['page.user_center'],
    },
  ];
}

function nextVersionNumber(versions: MembershipPlanVersionRecord[]) {
  return versions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
}

export function createMembershipPlanVersionHarness(input: HarnessInput = {}): MutableVersionStore {
  const plans = input.plans ?? buildSeedPlans();
  const versions = (input.versions ?? buildSeedVersions(plans)).map(cloneVersion);

  function findPlanById(planId: string) {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) {
      throw new Error(`Unknown membership plan id: ${planId}`);
    }

    return plan;
  }

  function listByPlanId(planId: string) {
    return sortVersions(versions.filter((version) => version.planId === planId));
  }

  function upsertVersion(record: MembershipPlanVersionRecord) {
    const index = versions.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      versions[index] = cloneVersion(record);
      return;
    }

    versions.push(cloneVersion(record));
  }

  return {
    async listVersionsByPlanCode(planCode: string) {
      return sortVersions(versions.filter((version) => version.planCode === planCode)).map(cloneVersion);
    },
    async listVersionsByPlanId(planId: string) {
      return listByPlanId(planId).map(cloneVersion);
    },
    async getVersionById(versionId: string) {
      const version = versions.find((item) => item.id === versionId);
      return version ? cloneVersion(version) : null;
    },
    async saveDraft(inputDraft) {
      const plan = findPlanById(inputDraft.planId);
      const planVersions = listByPlanId(inputDraft.planId);
      const existingDraft = planVersions.find((version) => version.status === 'draft');
      const versionNumber = existingDraft?.versionNumber ?? nextVersionNumber(planVersions);
      const draft: MembershipPlanVersionRecord = {
        id: existingDraft?.id ?? `${plan.id}:draft:${versionNumber}`,
        planId: plan.id,
        planCode: plan.code,
        versionNumber,
        status: 'draft',
        effectiveFrom: null,
        publishedAt: null,
        displayName: inputDraft.displayName,
        description: inputDraft.description,
        billingPeriod: inputDraft.billingPeriod,
        priceCents: inputDraft.priceCents,
        currency: inputDraft.currency,
        changeSummary: inputDraft.changeSummary,
        benefits: inputDraft.benefits.map(cloneBenefit),
        mediaLibraryPolicy: cloneMediaPolicy(inputDraft.mediaLibraryPolicy),
        videoGenerationPolicy: cloneVideoPolicy(inputDraft.videoGenerationPolicy),
        permissionCodes: [...new Set(inputDraft.permissionCodes)].sort(),
      };

      upsertVersion(draft);
      return cloneVersion(draft);
    },
    async publishDraft(planId) {
      const planVersions = listByPlanId(planId);
      const draft = planVersions.find((version) => version.status === 'draft');
      if (!draft) {
        throw new Error(`No draft version found for ${planId}`);
      }

      for (const version of planVersions) {
        if (version.status === 'published') {
          upsertVersion({ ...version, status: 'archived' });
        }
      }

      const published = {
        ...draft,
        status: 'published' as const,
        publishedAt: new Date().toISOString(),
      };
      upsertVersion(published);
      return cloneVersion(published);
    },
    async scheduleDraft(planId, inputSchedule) {
      const planVersions = listByPlanId(planId);
      const draft = planVersions.find((version) => version.status === 'draft');
      if (!draft) {
        throw new Error(`No draft version found for ${planId}`);
      }

      for (const version of planVersions) {
        if (version.status === 'scheduled') {
          upsertVersion({ ...version, status: 'archived' });
        }
      }

      const scheduled = {
        ...draft,
        status: 'scheduled' as const,
        effectiveFrom: inputSchedule.effectiveFrom,
      };
      upsertVersion(scheduled);
      return cloneVersion(scheduled);
    },
    async duplicateVersionAsDraft(planId, versionId) {
      const plan = findPlanById(planId);
      const planVersions = listByPlanId(planId);
      const source = planVersions.find((version) => version.id === versionId);
      if (!source) {
        throw new Error(`Unknown membership plan version id: ${versionId}`);
      }

      const existingDraft = planVersions.find((version) => version.status === 'draft');
      if (existingDraft) {
        upsertVersion({ ...existingDraft, status: 'archived' });
      }

      const duplicated: MembershipPlanVersionRecord = {
        ...cloneVersion(source),
        id: `${plan.id}:draft:${nextVersionNumber(planVersions)}`,
        planId: plan.id,
        planCode: plan.code,
        versionNumber: nextVersionNumber(planVersions),
        status: 'draft',
        effectiveFrom: null,
        publishedAt: null,
      };
      upsertVersion(duplicated);
      return cloneVersion(duplicated);
    },
  };
}

export async function saveMembershipPlanDraftWithLoader(
  input: DraftInput,
  loader: MutableVersionStore,
) {
  return loader.saveDraft(input);
}

export async function publishMembershipPlanDraft(
  planId: string,
  _input: { actorId: string },
  loader: MutableVersionStore,
) {
  return loader.publishDraft(planId);
}

export async function scheduleMembershipPlanDraft(
  planId: string,
  input: { effectiveFrom: string; actorId: string },
  loader: MutableVersionStore,
) {
  return loader.scheduleDraft(planId, { effectiveFrom: input.effectiveFrom });
}

export async function duplicateMembershipPlanVersionAsDraft(
  planId: string,
  versionId: string,
  loader: MutableVersionStore,
) {
  return loader.duplicateVersionAsDraft(planId, versionId);
}

export async function resolvePlanVersionForEntitlement(
  planCode: string,
  input: {
    now?: Date;
    loader: Pick<MutableVersionStore, 'listVersionsByPlanCode'>;
  },
) {
  const now = input.now ?? new Date();
  const versions = await input.loader.listVersionsByPlanCode(planCode);
  const eligible = versions
    .filter((version) => {
      if (version.status === 'published') {
        return true;
      }

      if (version.status !== 'scheduled' || !version.effectiveFrom) {
        return false;
      }

      return new Date(version.effectiveFrom).getTime() <= now.getTime();
    })
    .sort((left, right) => right.versionNumber - left.versionNumber);

  const current = eligible[0];
  if (!current) {
    const fallbackDraft = versions
      .filter((version) => version.status === 'draft')
      .sort((left, right) => right.versionNumber - left.versionNumber)[0];

    if (fallbackDraft) {
      return fallbackDraft;
    }

    throw new Error(`No published membership version found for ${planCode}`);
  }

  return current;
}

async function listVersionBenefits(versionIds: string[]) {
  if (versionIds.length === 0) {
    return new Map<string, MembershipVersionBenefitInput[]>();
  }

  const database = requireDb('membership plan version benefits');
  const rows = await database
    .select()
    .from(schema.membershipPlanVersionBenefits)
    .where(inArray(schema.membershipPlanVersionBenefits.versionId, versionIds))
    .orderBy(asc(schema.membershipPlanVersionBenefits.code));

  const grouped = new Map<string, MembershipVersionBenefitInput[]>();
  for (const row of rows) {
    const list = grouped.get(row.versionId) ?? [];
    list.push({
      code: row.code,
      name: row.name,
      kind: row.kind,
      quantity: row.quantity,
      unit: row.unit,
    });
    grouped.set(row.versionId, list);
  }

  return grouped;
}

async function listVersionPermissionCodes(versionIds: string[]) {
  if (versionIds.length === 0) {
    return new Map<string, string[]>();
  }

  const database = requireDb('membership plan version permissions');
  const rows = await database
    .select({
      versionId: schema.membershipPlanVersionPermissionBindings.versionId,
      code: schema.permissionResources.code,
    })
    .from(schema.membershipPlanVersionPermissionBindings)
    .innerJoin(
      schema.permissionResources,
      eq(
        schema.permissionResources.id,
        schema.membershipPlanVersionPermissionBindings.permissionResourceId,
      ),
    )
    .where(inArray(schema.membershipPlanVersionPermissionBindings.versionId, versionIds))
    .orderBy(asc(schema.permissionResources.code));

  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.versionId) ?? [];
    list.push(row.code);
    grouped.set(row.versionId, list);
  }

  return grouped;
}

async function listVersionVideoPolicies(versionIds: string[]) {
  const policies = new Map<string, VideoPlanConfig | null>();
  if (versionIds.length === 0) {
    return policies;
  }

  const repository = getVideoGenerationConfigRepository();
  await Promise.all(
    versionIds.map(async (versionId) => {
      policies.set(versionId, await repository.getVideoPlanConfigByVersionId(versionId));
    }),
  );

  return policies;
}

export async function listVersionsByPlanCode(planCode: string): Promise<MembershipPlanVersionRecord[]> {
  const database = requireDb('membership plan versions');
  const rows = await database
    .select({
      planId: schema.membershipPlans.id,
      planCode: schema.membershipPlans.code,
      version: schema.membershipPlanVersions,
    })
    .from(schema.membershipPlanVersions)
    .innerJoin(schema.membershipPlans, eq(schema.membershipPlans.id, schema.membershipPlanVersions.planId))
    .where(eq(schema.membershipPlans.code, planCode))
    .orderBy(desc(schema.membershipPlanVersions.versionNumber));

  const versionIds = rows.map((row) => row.version.id);
  const benefitsByVersion = await listVersionBenefits(versionIds);
  const permissionCodesByVersion = await listVersionPermissionCodes(versionIds);
  const videoPoliciesByVersion = await listVersionVideoPolicies(versionIds);

  return rows.map((row) =>
    toMembershipPlanVersionRecord({
      plan: { id: row.planId, code: row.planCode },
      version: row.version,
      benefits: benefitsByVersion.get(row.version.id) ?? [],
      videoGenerationPolicy: videoPoliciesByVersion.get(row.version.id) ?? null,
      permissionCodes: permissionCodesByVersion.get(row.version.id) ?? [],
    }),
  );
}

export const membershipPlanVersionRepository: Pick<MutableVersionStore, 'listVersionsByPlanCode'> = {
  listVersionsByPlanCode,
};

export async function getMembershipPlanVersionById(
  versionId: string,
): Promise<MembershipPlanVersionRecord | null> {
  const database = requireDb('membership plan version lookup');
  const [row] = await database
    .select({
      planId: schema.membershipPlans.id,
      planCode: schema.membershipPlans.code,
      version: schema.membershipPlanVersions,
    })
    .from(schema.membershipPlanVersions)
    .innerJoin(
      schema.membershipPlans,
      eq(schema.membershipPlans.id, schema.membershipPlanVersions.planId),
    )
    .where(eq(schema.membershipPlanVersions.id, versionId))
    .limit(1);

  if (!row) {
    return null;
  }

  const benefitsByVersion = await listVersionBenefits([row.version.id]);
  const permissionCodesByVersion = await listVersionPermissionCodes([row.version.id]);
  const videoPoliciesByVersion = await listVersionVideoPolicies([row.version.id]);

  return toMembershipPlanVersionRecord({
    plan: { id: row.planId, code: row.planCode },
    version: row.version,
    benefits: benefitsByVersion.get(row.version.id) ?? [],
    videoGenerationPolicy: videoPoliciesByVersion.get(row.version.id) ?? null,
    permissionCodes: permissionCodesByVersion.get(row.version.id) ?? [],
  });
}

export async function getMembershipPlanWorkspace(planId: string): Promise<MembershipPlanWorkspaceDto> {
  const database = requireDb('membership workspace');
  const plan = await database.query.membershipPlans.findFirst({
    where: eq(schema.membershipPlans.id, planId),
    columns: { id: true, code: true, name: true },
  });

  if (!plan) {
    throw new Error(`Unknown membership plan id: ${planId}`);
  }

  const versions = await database
    .select()
    .from(schema.membershipPlanVersions)
    .where(eq(schema.membershipPlanVersions.planId, planId))
    .orderBy(desc(schema.membershipPlanVersions.versionNumber));

  const versionIds = versions.map((version) => version.id);
  const benefitsByVersion = await listVersionBenefits(versionIds);
  const permissionCodesByVersion = await listVersionPermissionCodes(versionIds);
  const videoPoliciesByVersion = await listVersionVideoPolicies(versionIds);
  const records = versions.map((version) =>
    toMembershipPlanVersionRecord({
      plan,
      version,
      benefits: benefitsByVersion.get(version.id) ?? [],
      videoGenerationPolicy: videoPoliciesByVersion.get(version.id) ?? null,
      permissionCodes: permissionCodesByVersion.get(version.id) ?? [],
    }),
  );

  return {
    plan,
    currentVersion: records.find((version) => version.status === 'published') ?? null,
    draftVersion: records.find((version) => version.status === 'draft') ?? null,
    scheduledVersion: records.find((version) => version.status === 'scheduled') ?? null,
    history: records,
  };
}

export async function getAdminMembershipWorkspacePageData(): Promise<AdminMembershipWorkspacePageData> {
  const database = ensureAdminReadSource('membership workspace');
  if (!database) {
    const plans = buildSeedPlans();
    const loader = createMembershipPlanVersionHarness({ plans });
    const seedVersions = await Promise.all(plans.map((plan) => loader.listVersionsByPlanId(plan.id)));
    const workspace = {
      plan: plans[0]!,
      currentVersion: seedVersions[0]?.find((version) => version.status === 'published') ?? null,
      draftVersion: seedVersions[0]?.find((version) => version.status === 'draft') ?? null,
      scheduledVersion: seedVersions[0]?.find((version) => version.status === 'scheduled') ?? null,
      history: seedVersions[0] ?? [],
    } satisfies MembershipPlanWorkspaceDto;

    return {
      source: 'seed',
      metrics: [
        { label: '方案数', value: String(plans.length), hint: 'seed', tone: 'info' },
        {
          label: '已发布版本',
          value: String(seedVersions.flat().filter((version) => version.status === 'published').length),
          hint: 'published',
          tone: 'success',
        },
        {
          label: '待生效版本',
          value: String(seedVersions.flat().filter((version) => version.status === 'scheduled').length),
          hint: 'scheduled',
          tone: 'warning',
        },
        {
          label: '草稿',
          value: String(seedVersions.flat().filter((version) => version.status === 'draft').length),
          hint: 'draft',
          tone: 'default',
        },
      ],
      permissionOverview: await getAdminPermissionResourceOverview(),
      plans: plans.map((plan, index) => {
        const versions = seedVersions[index] ?? [];
        const currentVersion = versions.find((version) => version.status === 'published') ?? null;
        const nextVersion = versions.find((version) => version.status === 'scheduled' || version.status === 'draft') ?? null;
        return {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          currentVersionLabel: currentVersion ? `V${currentVersion.versionNumber}` : '未发布',
          nextVersionLabel: nextVersion ? `${nextVersion.status} V${nextVersion.versionNumber}` : '无',
          priceLabel: currentVersion ? formatCurrency(currentVersion.priceCents, currentVersion.currency) : '未设置',
        };
      }),
      workspace,
    };
  }

  const plans = await database
    .select({
      id: schema.membershipPlans.id,
      code: schema.membershipPlans.code,
      name: schema.membershipPlans.name,
    })
    .from(schema.membershipPlans)
    .orderBy(asc(schema.membershipPlans.sortOrder), asc(schema.membershipPlans.code));

  if (plans.length === 0) {
    throw new Error('No membership plans are available.');
  }

  const workspaces = await Promise.all(plans.map((plan) => getMembershipPlanWorkspace(plan.id)));
  const allVersions = workspaces.flatMap((workspace) => workspace.history);

  return {
    source: 'database',
    metrics: [
      { label: '方案数', value: String(plans.length), hint: 'database', tone: 'info' },
      {
        label: '已发布版本',
        value: String(allVersions.filter((version) => version.status === 'published').length),
        hint: 'published',
        tone: 'success',
      },
      {
        label: '待生效版本',
        value: String(allVersions.filter((version) => version.status === 'scheduled').length),
        hint: 'scheduled',
        tone: 'warning',
      },
      {
        label: '草稿',
        value: String(allVersions.filter((version) => version.status === 'draft').length),
        hint: 'draft',
        tone: 'default',
      },
    ],
    permissionOverview: await getAdminPermissionResourceOverview(),
    plans: workspaces.map((workspace) => ({
      id: workspace.plan.id,
      code: workspace.plan.code,
      name: workspace.plan.name,
      currentVersionLabel: workspace.currentVersion
        ? `V${workspace.currentVersion.versionNumber} · ${formatIso(workspace.currentVersion.publishedAt)}`
        : '未发布',
      nextVersionLabel: workspace.scheduledVersion
        ? `Scheduled V${workspace.scheduledVersion.versionNumber}`
        : workspace.draftVersion
          ? `Draft V${workspace.draftVersion.versionNumber}`
          : '无',
      priceLabel: workspace.currentVersion
        ? formatCurrency(workspace.currentVersion.priceCents, workspace.currentVersion.currency)
        : '未设置',
    })),
    workspace: workspaces[0]!,
  };
}

export async function createOrUpdateMembershipPlanDraft(
  input: DraftInput,
): Promise<MembershipPlanVersionRecord> {
  const database = requireDb('membership draft mutation');
  const workspace = await getMembershipPlanWorkspace(input.planId);
  const nextVersionNumber = workspace.history.reduce(
    (max, version) => Math.max(max, version.versionNumber),
    0,
  ) + (workspace.draftVersion ? 0 : 1);

  const [draft] = await database
    .insert(schema.membershipPlanVersions)
    .values({
      id: workspace.draftVersion?.id,
      planId: input.planId,
      versionNumber: workspace.draftVersion?.versionNumber ?? nextVersionNumber,
      status: 'draft',
      effectiveFrom: null,
      publishedAt: null,
      displayName: input.displayName,
      description: input.description,
      billingPeriod: input.billingPeriod,
      priceCents: input.priceCents,
      currency: input.currency,
      changeSummary: input.changeSummary,
      mediaStorageQuotaBytes: input.mediaLibraryPolicy.storageQuotaBytes,
      mediaAllowUserUpload: input.mediaLibraryPolicy.allowUserUpload,
      mediaAllowPublicSharing: input.mediaLibraryPolicy.allowPublicSharing,
      metadata: {
        source: 'admin_membership_workspace',
      },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.membershipPlanVersions.id,
      set: {
        displayName: input.displayName,
        description: input.description,
        billingPeriod: input.billingPeriod,
        priceCents: input.priceCents,
        currency: input.currency,
        changeSummary: input.changeSummary,
        mediaStorageQuotaBytes: input.mediaLibraryPolicy.storageQuotaBytes,
        mediaAllowUserUpload: input.mediaLibraryPolicy.allowUserUpload,
        mediaAllowPublicSharing: input.mediaLibraryPolicy.allowPublicSharing,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!draft) {
    throw new Error('Membership draft could not be saved.');
  }

  await database
    .delete(schema.membershipPlanVersionBenefits)
    .where(eq(schema.membershipPlanVersionBenefits.versionId, draft.id));
  await database
    .delete(schema.membershipPlanVersionPermissionBindings)
    .where(eq(schema.membershipPlanVersionPermissionBindings.versionId, draft.id));

  if (input.benefits.length > 0) {
    await database.insert(schema.membershipPlanVersionBenefits).values(
      input.benefits.map((benefit) => ({
        versionId: draft.id,
        code: benefit.code,
        name: benefit.name,
        kind: benefit.kind,
        quantity: benefit.quantity,
        unit: benefit.unit,
      })),
    );
  }

  if (input.permissionCodes.length > 0) {
    const resources = await database
      .select({
        id: schema.permissionResources.id,
        code: schema.permissionResources.code,
      })
      .from(schema.permissionResources)
      .where(inArray(schema.permissionResources.code, [...new Set(input.permissionCodes)]));

    await database.insert(schema.membershipPlanVersionPermissionBindings).values(
      resources.map((resource) => ({
        versionId: draft.id,
        permissionResourceId: resource.id,
      })),
    );
  }

  await persistMembershipVersionVideoGenerationPolicy(
    draft.id,
    input.videoGenerationPolicy,
  );

  const savedDraft = (await getMembershipPlanWorkspace(input.planId)).draftVersion;
  if (!savedDraft) {
    throw new Error(`Draft ${draft.id} could not be loaded after save.`);
  }

  return savedDraft;
}

export async function persistMembershipVersionVideoGenerationPolicy(
  versionId: string,
  policy: VideoPlanConfig | null,
  repository: {
    upsertVideoPlanConfig?: (versionId: string, policy: VideoPlanConfig) => Promise<VideoPlanConfig>;
    clearVideoPlanConfig?: (versionId: string) => Promise<void>;
  } = {},
) {
  if (!policy) {
    if (repository.clearVideoPlanConfig) {
      await repository.clearVideoPlanConfig(versionId);
      return;
    }

    const database = requireDb('video plan config clear');
    await database
      .delete(schema.membershipPlanVideoConfigs)
      .where(eq(schema.membershipPlanVideoConfigs.planVersionId, versionId));
    return;
  }

  const upsertVideoPlanConfig =
    repository.upsertVideoPlanConfig ?? getVideoGenerationConfigRepository().upsertVideoPlanConfig;
  if (!upsertVideoPlanConfig) {
    throw new Error('Video plan config repository does not support draft updates.');
  }
  await upsertVideoPlanConfig(versionId, policy);
}

export async function publishMembershipPlanDraftInDb(
  planId: string,
): Promise<MembershipPlanVersionRecord> {
  const database = requireDb('membership publish mutation');
  const workspace = await getMembershipPlanWorkspace(planId);
  const draft = workspace.draftVersion;
  if (!draft) {
    throw new Error(`No draft version found for ${planId}`);
  }

  await database
    .update(schema.membershipPlanVersions)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(
      and(
        eq(schema.membershipPlanVersions.planId, planId),
        eq(schema.membershipPlanVersions.status, 'published'),
      ),
    );

  const [published] = await database
    .update(schema.membershipPlanVersions)
    .set({
      status: 'published',
      publishedAt: new Date(),
      effectiveFrom: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.membershipPlanVersions.id, draft.id))
    .returning();

  if (!published) {
    throw new Error(`Draft ${draft.id} could not be published.`);
  }

  return (await getMembershipPlanWorkspace(planId)).currentVersion!;
}

export async function scheduleMembershipPlanDraftInDb(
  planId: string,
  input: { effectiveFrom: string; actorId: string },
): Promise<MembershipPlanVersionRecord> {
  const database = requireDb('membership schedule mutation');
  const workspace = await getMembershipPlanWorkspace(planId);
  const draft = workspace.draftVersion;
  if (!draft) {
    throw new Error(`No draft version found for ${planId}`);
  }

  await database
    .update(schema.membershipPlanVersions)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(
      and(
        eq(schema.membershipPlanVersions.planId, planId),
        eq(schema.membershipPlanVersions.status, 'scheduled'),
      ),
    );

  const [scheduled] = await database
    .update(schema.membershipPlanVersions)
    .set({
      status: 'scheduled',
      effectiveFrom: new Date(input.effectiveFrom),
      updatedAt: new Date(),
    })
    .where(eq(schema.membershipPlanVersions.id, draft.id))
    .returning();

  if (!scheduled) {
    throw new Error(`Draft ${draft.id} could not be scheduled.`);
  }

  return (await getMembershipPlanWorkspace(planId)).scheduledVersion!;
}

export async function duplicateMembershipPlanVersionAsDraftInDb(
  planId: string,
  versionId: string,
): Promise<MembershipPlanVersionRecord> {
  const workspace = await getMembershipPlanWorkspace(planId);
  const source = workspace.history.find((version) => version.id === versionId);
  if (!source) {
    throw new Error(`Unknown membership plan version id: ${versionId}`);
  }

  return createOrUpdateMembershipPlanDraft({
    planId,
    displayName: source.displayName,
    description: source.description,
    billingPeriod: source.billingPeriod,
    priceCents: source.priceCents,
    currency: source.currency,
    changeSummary: source.changeSummary,
    benefits: source.benefits,
    mediaLibraryPolicy: source.mediaLibraryPolicy,
    videoGenerationPolicy: source.videoGenerationPolicy,
    permissionCodes: source.permissionCodes,
  });
}
