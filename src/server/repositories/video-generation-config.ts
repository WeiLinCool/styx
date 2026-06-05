import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';

import { db, schema } from '@/server/db';
import type {
  VideoPlanConfig,
  VideoStylePreset,
} from '@/server/video/video-generation-policy';

export type { VideoPlanConfig, VideoStylePreset };

export type VideoStylePresetInput = {
  id?: string;
  code: string;
  name: string;
  prompt: string;
  enabled?: boolean;
  sortOrder?: number;
};

export type VideoPlanConfigInput = VideoPlanConfig;

export type VideoGenerationConfigRepository = {
  listEnabledVideoStylePresets(): Promise<VideoStylePreset[]>;
  listAdminVideoStylePresets(): Promise<VideoStylePreset[]>;
  upsertVideoStylePreset(input: VideoStylePresetInput): Promise<VideoStylePreset>;
  getVideoPlanConfigByVersionId(versionId: string): Promise<VideoPlanConfig | null>;
  upsertVideoPlanConfig?(
    planVersionId: string,
    input: VideoPlanConfigInput,
  ): Promise<VideoPlanConfig>;
};

type MemoryVideoPlanConfigRow = {
  planVersionId: string;
  config: VideoPlanConfigInput;
};

type MemoryRepositoryInput = {
  styles?: VideoStylePreset[];
  planConfigs?: MemoryVideoPlanConfigRow[];
};

function requireDb(operation: string) {
  if (!db || !process.env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is required for ${operation}.`);
  }

  return db;
}

function normalizeText(value: string, fieldName: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function normalizeStyle(input: VideoStylePresetInput): VideoStylePreset {
  return {
    id: input.id ?? randomUUID(),
    code: normalizeText(input.code, 'Video style code'),
    name: normalizeText(input.name, 'Video style name'),
    prompt: normalizeText(input.prompt, 'Video style prompt'),
    enabled: input.enabled ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
}

function cloneStyle(style: VideoStylePreset): VideoStylePreset {
  return { ...style };
}

function sortStyles(styles: VideoStylePreset[]) {
  return [...styles].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.code.localeCompare(right.code);
  });
}

function assertPositiveInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
}

export function normalizeVideoPlanConfig(input: VideoPlanConfigInput): VideoPlanConfig {
  if (input.allowedDurations.length === 0) {
    throw new Error('Allowed durations must include at least one option.');
  }
  if (input.allowedResolutions.length === 0) {
    throw new Error('Allowed resolutions must include at least one option.');
  }

  const allowedDurations = input.allowedDurations.map((duration) => {
    assertPositiveInteger(duration, 'Allowed duration');
    return duration;
  });
  assertPositiveInteger(input.defaultDuration, 'Default duration');
  if (!allowedDurations.includes(input.defaultDuration)) {
    throw new Error('Default duration must be included in allowed durations.');
  }

  const allowedResolutions = input.allowedResolutions.map((resolution) =>
    normalizeText(resolution, 'Allowed resolution'),
  );
  const defaultResolution = normalizeText(input.defaultResolution, 'Default resolution');
  if (!allowedResolutions.includes(defaultResolution)) {
    throw new Error('Default resolution must be included in allowed resolutions.');
  }

  return {
    enabled: input.enabled,
    allowedDurations: [...allowedDurations],
    allowedResolutions: [...allowedResolutions],
    defaultDuration: input.defaultDuration,
    defaultResolution,
  };
}

function clonePlanConfig(config: VideoPlanConfig): VideoPlanConfig {
  return {
    enabled: config.enabled,
    allowedDurations: [...config.allowedDurations],
    allowedResolutions: [...config.allowedResolutions],
    defaultDuration: config.defaultDuration,
    defaultResolution: config.defaultResolution,
  };
}

function toVideoStylePreset(row: typeof schema.videoStylePresets.$inferSelect): VideoStylePreset {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    prompt: row.prompt,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
  };
}

function toVideoPlanConfig(
  row: typeof schema.membershipPlanVideoConfigs.$inferSelect,
): VideoPlanConfig {
  return normalizeVideoPlanConfig({
    enabled: row.enabled,
    allowedDurations: row.allowedDurations,
    allowedResolutions: row.allowedResolutions,
    defaultDuration: row.defaultDuration,
    defaultResolution: row.defaultResolution,
  });
}

export function createDatabaseVideoGenerationConfigRepository(): VideoGenerationConfigRepository {
  return {
    async listEnabledVideoStylePresets() {
      const database = requireDb('video style preset listing');
      const rows = await database
        .select()
        .from(schema.videoStylePresets)
        .where(eq(schema.videoStylePresets.enabled, true))
        .orderBy(asc(schema.videoStylePresets.sortOrder), asc(schema.videoStylePresets.code));
      return rows.map(toVideoStylePreset);
    },
    async listAdminVideoStylePresets() {
      const database = requireDb('admin video style preset listing');
      const rows = await database
        .select()
        .from(schema.videoStylePresets)
        .orderBy(asc(schema.videoStylePresets.sortOrder), asc(schema.videoStylePresets.code));
      return rows.map(toVideoStylePreset);
    },
    async upsertVideoStylePreset(input) {
      const database = requireDb('video style preset upsert');
      const style = normalizeStyle(input);
      const [row] = await database
        .insert(schema.videoStylePresets)
        .values({
          id: style.id,
          code: style.code,
          name: style.name,
          prompt: style.prompt,
          enabled: style.enabled,
          sortOrder: style.sortOrder,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.videoStylePresets.code,
          set: {
            name: style.name,
            prompt: style.prompt,
            enabled: style.enabled,
            sortOrder: style.sortOrder,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!row) {
        throw new Error('Video style preset could not be saved.');
      }

      return toVideoStylePreset(row);
    },
    async getVideoPlanConfigByVersionId(versionId) {
      const database = requireDb('video plan config lookup');
      const [row] = await database
        .select()
        .from(schema.membershipPlanVideoConfigs)
        .where(eq(schema.membershipPlanVideoConfigs.planVersionId, versionId))
        .limit(1);

      return row ? toVideoPlanConfig(row) : null;
    },
    async upsertVideoPlanConfig(planVersionId, input) {
      const database = requireDb('video plan config upsert');
      const config = normalizeVideoPlanConfig(input);
      const [row] = await database
        .insert(schema.membershipPlanVideoConfigs)
        .values({
          planVersionId,
          enabled: config.enabled,
          allowedDurations: config.allowedDurations,
          allowedResolutions: config.allowedResolutions,
          defaultDuration: config.defaultDuration,
          defaultResolution: config.defaultResolution,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.membershipPlanVideoConfigs.planVersionId,
          set: {
            enabled: config.enabled,
            allowedDurations: config.allowedDurations,
            allowedResolutions: config.allowedResolutions,
            defaultDuration: config.defaultDuration,
            defaultResolution: config.defaultResolution,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!row) {
        throw new Error('Video plan config could not be saved.');
      }

      return toVideoPlanConfig(row);
    },
  };
}

export function createMemoryVideoGenerationConfigRepository(
  input: MemoryRepositoryInput = {},
): VideoGenerationConfigRepository {
  const stylesByCode = new Map<string, VideoStylePreset>();
  const configsByVersionId = new Map<string, VideoPlanConfig>();

  for (const style of input.styles ?? []) {
    const normalized = normalizeStyle(style);
    stylesByCode.set(normalized.code, normalized);
  }

  for (const row of input.planConfigs ?? []) {
    configsByVersionId.set(row.planVersionId, normalizeVideoPlanConfig(row.config));
  }

  return {
    async listEnabledVideoStylePresets() {
      return sortStyles([...stylesByCode.values()].filter((style) => style.enabled)).map(cloneStyle);
    },
    async listAdminVideoStylePresets() {
      return sortStyles([...stylesByCode.values()]).map(cloneStyle);
    },
    async upsertVideoStylePreset(input) {
      const style = normalizeStyle(input);
      const existing = stylesByCode.get(style.code);
      const stored = existing ? { ...style, id: existing.id } : style;
      stylesByCode.set(stored.code, stored);
      return cloneStyle(stored);
    },
    async getVideoPlanConfigByVersionId(versionId) {
      const config = configsByVersionId.get(versionId);
      return config ? clonePlanConfig(config) : null;
    },
    async upsertVideoPlanConfig(planVersionId, input) {
      const config = normalizeVideoPlanConfig(input);
      configsByVersionId.set(planVersionId, config);
      return clonePlanConfig(config);
    },
  };
}

const globalDevelopmentVideoGenerationConfigRepository = globalThis as typeof globalThis & {
  __styxVideoGenerationConfigRepository?: VideoGenerationConfigRepository;
};

export function getVideoGenerationConfigRepository(): VideoGenerationConfigRepository {
  if (process.env.DATABASE_URL) {
    return createDatabaseVideoGenerationConfigRepository();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required for video generation config repository in production.');
  }

  globalDevelopmentVideoGenerationConfigRepository.__styxVideoGenerationConfigRepository ??=
    createMemoryVideoGenerationConfigRepository();

  return globalDevelopmentVideoGenerationConfigRepository.__styxVideoGenerationConfigRepository;
}

export function listEnabledVideoStylePresets(): Promise<VideoStylePreset[]> {
  return getVideoGenerationConfigRepository().listEnabledVideoStylePresets();
}

export function listAdminVideoStylePresets(): Promise<VideoStylePreset[]> {
  return getVideoGenerationConfigRepository().listAdminVideoStylePresets();
}

export function upsertVideoStylePreset(
  input: VideoStylePresetInput,
): Promise<VideoStylePreset> {
  return getVideoGenerationConfigRepository().upsertVideoStylePreset(input);
}

export function getVideoPlanConfigByVersionId(
  versionId: string,
): Promise<VideoPlanConfig | null> {
  return getVideoGenerationConfigRepository().getVideoPlanConfigByVersionId(versionId);
}
