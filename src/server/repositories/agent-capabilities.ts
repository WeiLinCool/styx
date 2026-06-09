import { and, asc, desc, eq } from 'drizzle-orm';

import { buildCapabilitySnapshot, resolveDefaultBundle } from '@/server/agent/capability-resolution';
import type {
  AgentCapabilityBundleRecord,
  AgentCapabilityKind,
  AgentCapabilityRecord,
  AgentCapabilitySnapshot,
  AgentCapabilityStatus,
  AgentTaskType,
  StoryboardTemplateAsset,
  WorkflowStoryboardCapabilityConfig,
  WorkflowStoryboardLayout,
} from '@/server/agent/types';
import { db, schema } from '@/server/db';
import {
  type AdminModuleData,
  ensureAdminReadSource,
} from './admin-shared';

export type AdminAgentCapabilityRow = {
  id: string;
  kind: AgentCapabilityKind;
  code: string;
  name: string;
  status: AgentCapabilityStatus;
  scope: string;
  configSummary: string;
};

export type AdminAgentCapabilityBundleRow = {
  id: string;
  code: string;
  taskType: AgentTaskType;
  name: string;
  status: AgentCapabilityStatus;
  capabilitySummary: string;
};

export type AdminAgentCapabilityData = AdminModuleData<AdminAgentCapabilityRow> & {
  bundles: AdminAgentCapabilityBundleRow[];
};

export type AdminStoryboardCapabilityConfigRecord = WorkflowStoryboardCapabilityConfig & {
  capabilityId: string;
  capabilityCode: string;
  capabilityName: string;
  capabilityStatus: AgentCapabilityStatus;
};

export class StoryboardCapabilityNotFoundError extends Error {
  constructor() {
    super('Storyboard capability was not found.');
    this.name = 'StoryboardCapabilityNotFoundError';
  }
}

export class StoryboardCapabilityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoryboardCapabilityValidationError';
  }
}

const DEFAULT_WORKFLOW_STORYBOARD_LAYOUT: WorkflowStoryboardLayout = {
  width: 1086,
  height: 1448,
  columns: 4,
  rows: 3,
};

const DEFAULT_WORKFLOW_STORYBOARD_PROMPT = [
  '任务：以管理员上传的 12 宫格教程底图为主图/底图，保持底图结构、尺寸、分镜位置、编号、构图、手部、石头、背景与所有原有效果完全不变。',
  '只将用户上传图案替换到所有允许替换图案的位置，禁止改动任何与图案无关的内容。',
  '请将用户原始工作流提示词作为补充约束，并严格遵守模板显影步骤、纸浆纸屑残留、湿亮反光和最终转印质感要求。',
  '',
  '当前工作流提示词：',
  '{{workflow_prompt}}',
].join('\n');

function createDefaultWorkflowStoryboardConfig(): Omit<
  WorkflowStoryboardCapabilityConfig,
  'code'
> {
  return {
    promptText: DEFAULT_WORKFLOW_STORYBOARD_PROMPT,
    templateAsset: null,
    layout: DEFAULT_WORKFLOW_STORYBOARD_LAYOUT,
    updatedAt: null,
    updatedByUserId: null,
  };
}

function storyboardSeedCapabilityRecord(): AgentCapabilityRecord {
  return seedAgentCapabilities.find(
    (capability) => capability.code === 'workflow-storyboard-template',
  ) as AgentCapabilityRecord;
}

function workflowDefaultBundleRecord(): AgentCapabilityBundleRecord {
  return seedAgentCapabilityBundles.find(
    (bundle) => bundle.code === 'workflow-default',
  ) as AgentCapabilityBundleRecord;
}

export const seedAgentCapabilities = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'model',
    code: 'pi-default',
    name: 'Pi 默认模型',
    status: 'enabled',
    config: { provider: 'pi', model: 'pi-default' },
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'skill',
    code: 'stone-script',
    name: '石头印画脚本 Skill',
    status: 'enabled',
    config: { prompt: '生成石头印画相关脚本。' },
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'mcp_server',
    code: 'asset-library',
    name: '素材库 MCP',
    status: 'enabled',
    config: { server: 'asset-library' },
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    kind: 'plugin',
    code: 'artifact-export',
    name: '产物导出 Plugin',
    status: 'enabled',
    config: { formats: ['text', 'json'] },
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    kind: 'skill',
    code: 'workflow-storyboard-template',
    name: '工作流分镜模板',
    status: 'enabled',
    config: createDefaultWorkflowStoryboardConfig(),
  },
] satisfies AgentCapabilityRecord[];

export const seedAgentCapabilityBundles = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    code: 'chat-default',
    taskType: 'chat',
    name: 'Chat Default',
    status: 'enabled',
    capabilityIds: [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
    ],
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    code: 'image-default',
    taskType: 'image',
    name: 'Image Default',
    status: 'enabled',
    capabilityIds: [
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ],
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    code: 'video-default',
    taskType: 'video',
    name: 'Video Default',
    status: 'enabled',
    capabilityIds: [
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ],
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    code: 'workflow-default',
    taskType: 'workflow',
    name: 'Workflow Default',
    status: 'enabled',
    capabilityIds: [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
    ],
  },
] satisfies AgentCapabilityBundleRecord[];

export function getDefaultAgentCapabilityBundle(
  taskType: AgentTaskType,
): AgentCapabilitySnapshot | null {
  const bundle = resolveDefaultBundle(seedAgentCapabilityBundles, taskType);

  if (!bundle) {
    return null;
  }

  return buildCapabilitySnapshot({ bundle, capabilities: seedAgentCapabilities });
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function requireAgentCapabilityDatabase(operation: string) {
  if (!db || !process.env.DATABASE_URL) {
    if (isProduction()) {
      throw new Error(`DATABASE_URL is required for ${operation}.`);
    }

    return null;
  }

  return db;
}

export async function resolveDefaultAgentCapabilityBundle(
  taskType: AgentTaskType,
): Promise<AgentCapabilitySnapshot | null> {
  const database = requireAgentCapabilityDatabase('agent capability resolution');

  if (!database) {
    return getDefaultAgentCapabilityBundle(taskType);
  }

  if (taskType === 'workflow') {
    await ensureWorkflowStoryboardCapabilitySeed(database);
  }

  const [bundle] = await database
    .select()
    .from(schema.agentCapabilityBundles)
    .where(
      and(
        eq(schema.agentCapabilityBundles.taskType, taskType),
        eq(schema.agentCapabilityBundles.status, 'enabled'),
      ),
    )
    .orderBy(asc(schema.agentCapabilityBundles.createdAt))
    .limit(1);

  if (!bundle) {
    return null;
  }

  const rows = await database
    .select({
      capability: schema.agentCapabilities,
      item: schema.agentCapabilityBundleItems,
    })
    .from(schema.agentCapabilityBundleItems)
    .innerJoin(
      schema.agentCapabilities,
      eq(schema.agentCapabilities.id, schema.agentCapabilityBundleItems.capabilityId),
    )
    .where(eq(schema.agentCapabilityBundleItems.bundleId, bundle.id))
    .orderBy(asc(schema.agentCapabilityBundleItems.sortOrder));

  const bundleRecord: AgentCapabilityBundleRecord = {
    id: bundle.id,
    code: bundle.code,
    taskType: bundle.taskType,
    name: bundle.name,
    status: bundle.status,
    capabilityIds: rows.map(({ capability }) => capability.id),
  };
  const capabilities: AgentCapabilityRecord[] = rows.map(({ capability }) => ({
    id: capability.id,
    kind: capability.kind,
    code: capability.code,
    name: capability.name,
    status: capability.status,
    config: capability.config,
  }));

  return buildCapabilitySnapshot({ bundle: bundleRecord, capabilities });
}

export async function updateAgentCapabilityStatus(input: {
  capabilityId: string;
  status: AgentCapabilityStatus;
}): Promise<AdminAgentCapabilityRow> {
  const database = requireAgentCapabilityDatabase('agent capability status mutation');

  if (!database) {
    const seed = seedAgentCapabilities.find((capability) => capability.id === input.capabilityId);
    if (!seed) {
      throw new Error('Agent capability was not found.');
    }

    return {
      id: seed.id,
      kind: seed.kind,
      code: seed.code,
      name: seed.name,
      status: input.status,
      scope: 'global',
      configSummary: summarizeCapabilityConfig(seed.config, seed.code),
    };
  }

  const [updated] = await database
    .update(schema.agentCapabilities)
    .set({
      status: input.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.agentCapabilities.id, input.capabilityId))
    .returning({
      id: schema.agentCapabilities.id,
      kind: schema.agentCapabilities.kind,
      code: schema.agentCapabilities.code,
      name: schema.agentCapabilities.name,
      status: schema.agentCapabilities.status,
      scope: schema.agentCapabilities.scope,
      config: schema.agentCapabilities.config,
    });

  if (!updated) {
    throw new Error('Agent capability was not found.');
  }

  return {
    id: updated.id,
    kind: updated.kind,
    code: updated.code,
    name: updated.name,
    status: updated.status,
    scope: updated.scope,
    configSummary: summarizeCapabilityConfig(updated.config, updated.code),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoryboardTemplateAsset(value: unknown): value is StoryboardTemplateAsset {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.storageProvider === 'tencent_cos' &&
    typeof value.bucket === 'string' &&
    typeof value.region === 'string' &&
    typeof value.objectKey === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.byteSize === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    typeof value.originalFilename === 'string' &&
    typeof value.uploadedAt === 'string'
  );
}

function isWorkflowStoryboardLayout(value: unknown): value is WorkflowStoryboardLayout {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    value.columns === 4 &&
    value.rows === 3
  );
}

export function readStoryboardCapabilityConfig(
  snapshot: AgentCapabilitySnapshot,
): WorkflowStoryboardCapabilityConfig | null {
  const capability = snapshot.capabilities.find(
    (item) => item.code === 'workflow-storyboard-template',
  );

  if (!capability) {
    return null;
  }

  const config = isRecord(capability.config) ? capability.config : {};
  const defaults = createDefaultWorkflowStoryboardConfig();

  return {
    code: 'workflow-storyboard-template',
    ...normalizeStoryboardCapabilityConfigRecord(config),
  };
}

function normalizeStoryboardCapabilityConfigRecord(
  config: Record<string, unknown>,
): Omit<WorkflowStoryboardCapabilityConfig, 'code'> {
  const defaults = createDefaultWorkflowStoryboardConfig();

  return {
    promptText:
      typeof config.promptText === 'string' && config.promptText.trim().length > 0
        ? config.promptText
        : defaults.promptText,
    templateAsset: isStoryboardTemplateAsset(config.templateAsset)
      ? config.templateAsset
      : defaults.templateAsset,
    layout: isWorkflowStoryboardLayout(config.layout) ? config.layout : defaults.layout,
    updatedAt: typeof config.updatedAt === 'string' ? config.updatedAt : defaults.updatedAt,
    updatedByUserId:
      typeof config.updatedByUserId === 'string'
        ? config.updatedByUserId
        : defaults.updatedByUserId,
  };
}

function summarizeCapabilityConfig(config: Record<string, unknown>, code?: string) {
  if (code === 'workflow-storyboard-template') {
    const storyboard = normalizeStoryboardCapabilityConfigRecord(config);

    return [
      `提示词: ${storyboard.promptText.trim().length > 0 ? '已配置' : '缺失'}`,
      `模板: ${storyboard.templateAsset ? '已配置' : '缺失'}`,
      `尺寸: ${storyboard.layout.width}x${storyboard.layout.height}`,
      `布局: ${storyboard.layout.columns}x${storyboard.layout.rows}`,
    ].join(' · ');
  }

  const entries = Object.entries(config);

  if (entries.length === 0) {
    return '无配置';
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.join(', ')}`;
      }

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return `${key}: ${String(value)}`;
      }

      return `${key}: JSON`;
    })
    .join(' · ');
}

async function ensureWorkflowStoryboardCapabilitySeed(database: NonNullable<typeof db>) {
  const capability = storyboardSeedCapabilityRecord();
  const workflowBundle = workflowDefaultBundleRecord();

  const [existingCapability] = await database
    .select({ id: schema.agentCapabilities.id })
    .from(schema.agentCapabilities)
    .where(eq(schema.agentCapabilities.id, capability.id))
    .limit(1);

  if (!existingCapability) {
    await database
      .insert(schema.agentCapabilities)
      .values({
        id: capability.id,
        kind: capability.kind,
        code: capability.code,
        name: capability.name,
        status: capability.status,
        scope: 'global',
        config: structuredClone(capability.config),
        secretMetadata: {},
      })
      .onConflictDoNothing();
  }

  const [existingBundleItem] = await database
    .select({ capabilityId: schema.agentCapabilityBundleItems.capabilityId })
    .from(schema.agentCapabilityBundleItems)
    .where(
      and(
        eq(schema.agentCapabilityBundleItems.bundleId, workflowBundle.id),
        eq(schema.agentCapabilityBundleItems.capabilityId, capability.id),
      ),
    )
    .limit(1);

  if (!existingBundleItem) {
    await database
      .insert(schema.agentCapabilityBundleItems)
      .values({
        bundleId: workflowBundle.id,
        capabilityId: capability.id,
        sortOrder: 40,
      })
      .onConflictDoNothing();
  }
}

function buildAgentCapabilityAdminData(
  source: AdminModuleData<AdminAgentCapabilityRow>['source'],
  records: AdminAgentCapabilityRow[],
  bundles: AdminAgentCapabilityBundleRow[],
): AdminAgentCapabilityData {
  return {
    source,
    metrics: [
      { label: '能力数', value: String(records.length), hint: source === 'database' ? '数据库' : 'seed', tone: 'info' },
      {
        label: '启用',
        value: String(records.filter((record) => record.status === 'enabled').length),
        hint: 'enabled',
        tone: 'success',
      },
      {
        label: '停用',
        value: String(records.filter((record) => record.status === 'disabled').length),
        hint: 'disabled',
        tone: 'warning',
      },
      {
        label: '归档',
        value: String(records.filter((record) => record.status === 'archived').length),
        hint: 'archived',
        tone: 'default',
      },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      { label: 'Model', value: 'model', count: records.filter((record) => record.kind === 'model').length },
      { label: 'Skill', value: 'skill', count: records.filter((record) => record.kind === 'skill').length },
      { label: 'MCP', value: 'mcp_server', count: records.filter((record) => record.kind === 'mcp_server').length },
      { label: 'Plugin', value: 'plugin', count: records.filter((record) => record.kind === 'plugin').length },
      { label: 'Enabled', value: 'enabled', count: records.filter((record) => record.status === 'enabled').length },
    ],
    records,
    bundles,
  };
}

function summarizeBundleCapabilities(capabilityIds: string[]) {
  const capabilityById = new Map(seedAgentCapabilities.map((capability) => [capability.id, capability]));
  const labels: string[] = [];

  for (const capabilityId of capabilityIds) {
    const capability = capabilityById.get(capabilityId);
    if (capability) {
      labels.push(`${capability.kind}:${capability.code}`);
    }
  }

  return labels.join(' · ');
}

export function getSeedAgentCapabilityAdminData(): AdminAgentCapabilityData {
  const records = seedAgentCapabilities.map((capability) => ({
    id: capability.id,
    kind: capability.kind,
    code: capability.code,
    name: capability.name,
    status: capability.status,
    scope: 'global',
    configSummary: summarizeCapabilityConfig(capability.config, capability.code),
  }));

  const bundles = seedAgentCapabilityBundles.map((bundle) => ({
    id: bundle.id,
    code: bundle.code,
    taskType: bundle.taskType,
    name: bundle.name,
    status: bundle.status,
    capabilitySummary: summarizeBundleCapabilities(bundle.capabilityIds),
  }));

  return buildAgentCapabilityAdminData('seed', records, bundles);
}

export async function getAdminAgentCapabilities(): Promise<AdminAgentCapabilityData> {
  const database = ensureAdminReadSource('Agent capabilities');

  if (!database) {
    return getSeedAgentCapabilityAdminData();
  }

  await ensureWorkflowStoryboardCapabilitySeed(database);

  const rows = await database
    .select({
      id: schema.agentCapabilities.id,
      kind: schema.agentCapabilities.kind,
      code: schema.agentCapabilities.code,
      name: schema.agentCapabilities.name,
      status: schema.agentCapabilities.status,
      scope: schema.agentCapabilities.scope,
      config: schema.agentCapabilities.config,
    })
    .from(schema.agentCapabilities)
    .orderBy(desc(schema.agentCapabilities.updatedAt))
    .limit(100);

  const records = rows.map((capability) => ({
    id: capability.id,
    kind: capability.kind,
    code: capability.code,
    name: capability.name,
    status: capability.status,
    scope: capability.scope,
    configSummary: summarizeCapabilityConfig(capability.config, capability.code),
  }));

  const bundleRows = await database
    .select({
      bundle: schema.agentCapabilityBundles,
      capability: schema.agentCapabilities,
      item: schema.agentCapabilityBundleItems,
    })
    .from(schema.agentCapabilityBundles)
    .leftJoin(
      schema.agentCapabilityBundleItems,
      eq(schema.agentCapabilityBundleItems.bundleId, schema.agentCapabilityBundles.id),
    )
    .leftJoin(
      schema.agentCapabilities,
      eq(schema.agentCapabilities.id, schema.agentCapabilityBundleItems.capabilityId),
    )
    .orderBy(
      desc(schema.agentCapabilityBundles.updatedAt),
      asc(schema.agentCapabilityBundleItems.sortOrder),
    )
    .limit(400);

  const bundleMap = new Map<string, AdminAgentCapabilityBundleRow>();
  for (const row of bundleRows) {
    const existing = bundleMap.get(row.bundle.id);
    const capabilityLabel = row.capability
      ? `${row.capability.kind}:${row.capability.code}`
      : null;

    if (!existing) {
      bundleMap.set(row.bundle.id, {
        id: row.bundle.id,
        code: row.bundle.code,
        taskType: row.bundle.taskType,
        name: row.bundle.name,
        status: row.bundle.status,
        capabilitySummary: capabilityLabel ?? '未配置能力',
      });
      continue;
    }

    if (capabilityLabel) {
      existing.capabilitySummary =
        existing.capabilitySummary === '未配置能力'
          ? capabilityLabel
          : `${existing.capabilitySummary} · ${capabilityLabel}`;
    }
  }

  return buildAgentCapabilityAdminData('database', records, Array.from(bundleMap.values()));
}

export async function getAgentCapabilityStoryboardConfig(
  capabilityId: string,
): Promise<AdminStoryboardCapabilityConfigRecord> {
  const database = requireAgentCapabilityDatabase('agent capability storyboard config read');

  if (!database) {
    const capability = seedAgentCapabilities.find((item) => item.id === capabilityId);
    if (!capability || capability.code !== 'workflow-storyboard-template') {
      throw new StoryboardCapabilityNotFoundError();
    }

    const config = normalizeStoryboardCapabilityConfigRecord(capability.config);
    return {
      capabilityId: capability.id,
      capabilityCode: capability.code,
      capabilityName: capability.name,
      capabilityStatus: capability.status,
      code: 'workflow-storyboard-template',
      ...config,
    };
  }

  await ensureWorkflowStoryboardCapabilitySeed(database);

  const [capability] = await database
    .select({
      id: schema.agentCapabilities.id,
      code: schema.agentCapabilities.code,
      name: schema.agentCapabilities.name,
      status: schema.agentCapabilities.status,
      config: schema.agentCapabilities.config,
    })
    .from(schema.agentCapabilities)
    .where(eq(schema.agentCapabilities.id, capabilityId))
    .limit(1);

  if (!capability || capability.code !== 'workflow-storyboard-template') {
    throw new StoryboardCapabilityNotFoundError();
  }

  const config = normalizeStoryboardCapabilityConfigRecord(capability.config);
  return {
    capabilityId: capability.id,
    capabilityCode: capability.code,
    capabilityName: capability.name,
    capabilityStatus: capability.status,
    code: 'workflow-storyboard-template',
    ...config,
  };
}

export async function updateAgentCapabilityStoryboardConfig(input: {
  capabilityId: string;
  promptText: string;
  templateAsset?: StoryboardTemplateAsset;
  updatedByUserId: string;
}): Promise<AdminStoryboardCapabilityConfigRecord> {
  const database = requireAgentCapabilityDatabase('agent capability storyboard config mutation');

  if (!database) {
    throw new Error('DATABASE_URL is required for storyboard config mutation.');
  }

  await ensureWorkflowStoryboardCapabilitySeed(database);

  const existing = await getAgentCapabilityStoryboardConfig(input.capabilityId);
  const templateAsset = input.templateAsset ?? existing.templateAsset;
  if (!templateAsset) {
    throw new StoryboardCapabilityValidationError('工作流分镜模板未配置，请先上传模板图。');
  }

  const normalized: Omit<WorkflowStoryboardCapabilityConfig, 'code'> = {
    promptText: input.promptText.trim(),
    templateAsset,
    layout: {
      width: templateAsset.width,
      height: templateAsset.height,
      columns: existing.layout.columns,
      rows: existing.layout.rows,
    },
    updatedAt: new Date().toISOString(),
    updatedByUserId: input.updatedByUserId,
  };

  const [updated] = await database
    .update(schema.agentCapabilities)
    .set({
      config: normalized satisfies Omit<WorkflowStoryboardCapabilityConfig, 'code'>,
      updatedAt: new Date(),
    })
    .where(eq(schema.agentCapabilities.id, input.capabilityId))
    .returning({
      id: schema.agentCapabilities.id,
      code: schema.agentCapabilities.code,
      name: schema.agentCapabilities.name,
      status: schema.agentCapabilities.status,
      config: schema.agentCapabilities.config,
    });

  if (!updated || updated.code !== 'workflow-storyboard-template') {
    throw new StoryboardCapabilityNotFoundError();
  }

  const config = normalizeStoryboardCapabilityConfigRecord(updated.config);
  return {
    capabilityId: updated.id,
    capabilityCode: updated.code,
    capabilityName: updated.name,
    capabilityStatus: updated.status,
    code: 'workflow-storyboard-template',
    ...config,
  };
}
