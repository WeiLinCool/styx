import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import type {
  AgentArtifactDto,
  AgentArtifactKind,
  AgentCapabilitySnapshot,
  AgentRunDetailDto,
  AgentRunBillingDto,
  AgentRunDto,
  AgentRunSelectedModelDto,
  AgentRunStreamEventDto,
  AgentRunStreamEventType,
  AgentTaskType,
  AiUsage,
} from '@/server/agent/types';
import { db, schema } from '@/server/db';

export type CreateAgentRunInput = {
  userId: string;
  conversationId?: string | null;
  taskType: AgentTaskType;
  prompt: string;
  provider: string;
  model: string;
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  input: Record<string, unknown>;
};

export type AgentArtifactInput = {
  kind: AgentArtifactKind;
  title: string;
  body?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown>;
};

export type AgentRunEventInput = {
  type: string;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

export type AgentRunStreamEventInput = {
  eventType: AgentRunStreamEventType;
  payload?: Record<string, unknown>;
};

export type ListAgentRunsForUserOptions = {
  taskType?: AgentTaskType;
};

type StoredAgentRun = AgentRunDto & {
  userId: string;
  provider: string;
  model: string;
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  input: Record<string, unknown>;
  deletedAt?: string | null;
};

export type AgentRunFailureInput = {
  errorMessage: string;
  finalMessage?: string | null;
  artifacts?: AgentArtifactInput[];
  capabilitySnapshot?: AgentCapabilitySnapshot & Record<string, unknown>;
  input?: Record<string, unknown>;
};

export type AgentRunRepository = {
  createRun(input: CreateAgentRunInput): Promise<AgentRunDto>;
  getRunForUser(id: string, userId: string): Promise<AgentRunDto | null>;
  getRunDetailForUser(id: string, userId: string): Promise<AgentRunDetailDto | null>;
  listConversationRunsForUser(conversationId: string, userId: string): Promise<AgentRunDto[]>;
  listRunsForUser(userId: string, options?: ListAgentRunsForUserOptions): Promise<AgentRunDto[]>;
  softDeleteRunForUser(id: string, userId: string): Promise<AgentRunDto | null>;
  markRunRunning(runId: string): Promise<AgentRunDto | null>;
  patchRun(
    runId: string,
    input: {
      finalMessage?: string | null;
      errorMessage?: string | null;
      capabilitySnapshot?: AgentCapabilitySnapshot & Record<string, unknown>;
      input?: Record<string, unknown>;
    },
  ): Promise<AgentRunDto | null>;
  completeRun(
    runId: string,
    input: {
      finalMessage: string | null;
      artifacts: AgentArtifactInput[];
      capabilitySnapshot?: AgentCapabilitySnapshot & Record<string, unknown>;
      input?: Record<string, unknown>;
    },
  ): Promise<AgentRunDto | null>;
  failRun(runId: string, input: string | AgentRunFailureInput): Promise<AgentRunDto | null>;
  recordEvent(runId: string, input: AgentRunEventInput): Promise<void>;
  appendRunEvent(runId: string, input: AgentRunStreamEventInput): Promise<AgentRunStreamEventDto | null>;
  appendRunEvents(runId: string, input: AgentRunStreamEventInput[]): Promise<AgentRunStreamEventDto[]>;
  listRunEvents(runId: string): Promise<AgentRunStreamEventDto[]>;
  addArtifact(runId: string, input: AgentArtifactInput): Promise<AgentRunDto | null>;
  updateArtifactSaveState(
    runId: string,
    artifactId: string,
    input: Record<string, unknown>,
  ): Promise<AgentRunDto | null>;
};

function cloneRecord(record: Record<string, unknown>) {
  return structuredClone(record);
}

function cloneArtifact(artifact: AgentArtifactDto): AgentArtifactDto {
  return {
    ...artifact,
    metadata: cloneRecord(artifact.metadata),
  };
}

function toFailureInput(input: string | AgentRunFailureInput): AgentRunFailureInput {
  return typeof input === 'string' ? { errorMessage: input } : input;
}

function toAgentRunDto(run: StoredAgentRun): AgentRunDto {
  const metadata = extractRunMetadata(run.capabilitySnapshot, run.input);

  return {
    id: run.id,
    conversationId: run.conversationId ?? run.id,
    taskType: run.taskType,
    status: run.status,
    prompt: run.prompt,
    finalMessage: run.finalMessage,
    errorMessage: run.errorMessage,
    capabilitySummary: {
      provider: run.capabilitySummary.provider,
      model: run.capabilitySummary.model,
      capabilities: run.capabilitySummary.capabilities.map((capability) => ({ ...capability })),
    },
    selectedModel: metadata.selectedModel,
    usage: metadata.usage,
    billing: metadata.billing,
    artifacts: run.artifacts.map(cloneArtifact),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function createArtifact(input: AgentArtifactInput): AgentArtifactDto {
  return {
    id: randomUUID(),
    kind: input.kind,
    title: input.title,
    status: 'ready',
    body: input.body ?? null,
    url: input.url ?? null,
    metadata: cloneRecord(input.metadata ?? {}),
    createdAt: new Date().toISOString(),
  };
}

function mergeArtifactMetadata(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...cloneRecord(current),
    ...cloneRecord(patch),
  };
}

function touch(run: StoredAgentRun) {
  run.updatedAt = new Date().toISOString();
}

function toCapabilitySummary(snapshot: Partial<AgentCapabilitySnapshot>) {
  const capabilities = Array.isArray(snapshot.capabilities) ? snapshot.capabilities : [];

  return {
    provider: snapshot.provider ?? 'unknown',
    model: snapshot.model ?? 'unknown',
    capabilities: capabilities.map((capability) => ({
      kind: capability.kind,
      code: capability.code,
      name: capability.name,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readUsage(value: unknown): AiUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const promptTokens = readNumber(value.promptTokens);
  const completionTokens = readNumber(value.completionTokens);
  const totalTokens = readNumber(value.totalTokens);
  if (promptTokens === null || completionTokens === null || totalTokens === null) {
    return null;
  }

  return { promptTokens, completionTokens, totalTokens };
}

function readSelectedModel(value: unknown): AgentRunSelectedModelDto | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const code = readString(value.code);
  const name = readString(value.name);
  const providerName = readString(value.providerName);
  const entitlementLabel = readString(value.entitlementLabel);
  if (!id || !code || !name || !providerName || !entitlementLabel) {
    return null;
  }

  return { id, code, name, providerName, entitlementLabel };
}

function readLegacySelectedModel(snapshot: Record<string, unknown>): AgentRunSelectedModelDto | null {
  const id = readString(snapshot.modelId);
  const code = readString(snapshot.modelCode);
  const name = readString(snapshot.modelName);
  const providerName = readString(snapshot.providerName) ?? readString(snapshot.providerCode);
  const entitlement = isRecord(snapshot.entitlement) ? snapshot.entitlement : null;
  const entitlementLabel = readString(entitlement?.label);

  if (!id || !code || !name || !providerName || !entitlementLabel) {
    return null;
  }

  return { id, code, name, providerName, entitlementLabel };
}

function readBilling(value: unknown): AgentRunBillingDto | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = readString(value.status);
  if (
    status !== 'not_required' &&
    status !== 'pending' &&
    status !== 'billed' &&
    status !== 'failed'
  ) {
    return null;
  }

  return {
    status,
    creditCost: readNumber(value.creditCost),
    ledgerEntryId: readString(value.ledgerEntryId),
  };
}

function extractRunMetadata(
  capabilitySnapshot: Record<string, unknown>,
  input: Record<string, unknown>,
) {
  return {
    selectedModel:
      readSelectedModel(capabilitySnapshot.selectedModel) ??
      readSelectedModel(input.selectedModel) ??
      readLegacySelectedModel(capabilitySnapshot) ??
      readLegacySelectedModel(input),
    usage: readUsage(capabilitySnapshot.usage) ?? readUsage(input.usage),
    billing: readBilling(capabilitySnapshot.billing) ?? readBilling(input.billing),
  };
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function toStreamEventDto(event: {
  id: string;
  runId: string;
  sequence: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date | string;
}): AgentRunStreamEventDto {
  return {
    id: event.id,
    runId: event.runId,
    sequence: event.sequence,
    eventType: event.eventType as AgentRunStreamEventType,
    payload: cloneRecord(event.payload),
    createdAt: toIso(event.createdAt),
  };
}

function toAgentRunDtoFromDatabase(input: {
  run: typeof schema.agentRuns.$inferSelect;
  artifacts: Array<typeof schema.agentArtifacts.$inferSelect>;
}): AgentRunDto {
  const snapshot = input.run.capabilitySnapshot as unknown as AgentCapabilitySnapshot;
  const metadata = extractRunMetadata(input.run.capabilitySnapshot, input.run.input);

  return {
    id: input.run.id,
    conversationId: input.run.conversationId ?? input.run.id,
    taskType: input.run.taskType,
    status: input.run.status,
    prompt: input.run.prompt,
    finalMessage: input.run.finalMessage,
    errorMessage: input.run.errorMessage,
    capabilitySummary: toCapabilitySummary(snapshot),
    selectedModel: metadata.selectedModel,
    usage: metadata.usage,
    billing: metadata.billing,
    artifacts: input.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      status: artifact.status === 'failed' ? 'failed' : 'ready',
      body: artifact.body,
      url: artifact.url,
      metadata: artifact.metadata,
      createdAt: toIso(artifact.createdAt),
    })),
    createdAt: toIso(input.run.createdAt),
    updatedAt: toIso(input.run.updatedAt),
  };
}

type AgentDatabase = NonNullable<typeof db>;

async function getDatabaseRunDto(database: AgentDatabase, runId: string): Promise<AgentRunDto | null> {
  if (!database) {
    return null;
  }

  const [run] = await database
    .select()
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))
    .limit(1);

  if (!run) {
    return null;
  }

  const artifacts = await database
    .select()
    .from(schema.agentArtifacts)
    .where(eq(schema.agentArtifacts.runId, runId))
    .orderBy(desc(schema.agentArtifacts.createdAt));

  return toAgentRunDtoFromDatabase({ run, artifacts });
}

export function createDatabaseAgentRunRepository(): AgentRunRepository {
  if (!db || !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for database-backed agent run repository.');
  }
  const database = db;

  return {
    async createRun(input) {
      const runId = randomUUID();
      const [run] = await database
        .insert(schema.agentRuns)
        .values({
          id: runId,
          conversationId: input.conversationId ?? runId,
          userId: input.userId,
          taskType: input.taskType,
          prompt: input.prompt,
          provider: input.provider,
          model: input.model,
          capabilitySnapshot: input.capabilitySnapshot as unknown as Record<string, unknown>,
          input: input.input,
          status: 'queued',
        })
        .returning();

      const dto = await getDatabaseRunDto(database, run.id);
      if (!dto) {
        throw new Error('Created agent run could not be loaded.');
      }
      return dto;
    },
    async getRunForUser(id, userId) {
      const [run] = await database
        .select()
        .from(schema.agentRuns)
        .where(
          and(
            eq(schema.agentRuns.id, id),
            eq(schema.agentRuns.userId, userId),
            isNull(schema.agentRuns.deletedAt),
          ),
        )
        .limit(1);

      if (!run) {
        return null;
      }

      return getDatabaseRunDto(database, id);
    },
    async getRunDetailForUser(id, userId) {
      const [run] = await database
        .select()
        .from(schema.agentRuns)
        .where(
          and(
            eq(schema.agentRuns.id, id),
            eq(schema.agentRuns.userId, userId),
            isNull(schema.agentRuns.deletedAt),
          ),
        )
        .limit(1);

      if (!run) {
        return null;
      }

      const artifacts = await database
        .select()
        .from(schema.agentArtifacts)
        .where(eq(schema.agentArtifacts.runId, id))
        .orderBy(desc(schema.agentArtifacts.createdAt));

      const streamEvents = await database
        .select()
        .from(schema.agentRunStreamEvents)
        .where(eq(schema.agentRunStreamEvents.runId, id))
        .orderBy(asc(schema.agentRunStreamEvents.sequence), asc(schema.agentRunStreamEvents.createdAt));

      return {
        run: toAgentRunDtoFromDatabase({ run, artifacts }),
        events: streamEvents.map((event) => toStreamEventDto(event)),
        internal: {
          capabilitySnapshot: cloneRecord(run.capabilitySnapshot as Record<string, unknown>),
          input: cloneRecord(run.input as Record<string, unknown>),
        },
      };
    },
    async listConversationRunsForUser(conversationId, userId) {
      const runs = await database
        .select()
        .from(schema.agentRuns)
        .where(
          and(
            eq(schema.agentRuns.conversationId, conversationId),
            eq(schema.agentRuns.userId, userId),
            eq(schema.agentRuns.taskType, 'chat'),
            isNull(schema.agentRuns.deletedAt),
          ),
        )
        .orderBy(asc(schema.agentRuns.createdAt));

      const dtos = await Promise.all(runs.map((run) => getDatabaseRunDto(database, run.id)));
      return dtos.filter((run): run is AgentRunDto => Boolean(run));
    },
    async listRunsForUser(userId, options) {
      const conditions = [
        eq(schema.agentRuns.userId, userId),
        isNull(schema.agentRuns.deletedAt),
      ];
      if (options?.taskType) {
        conditions.push(eq(schema.agentRuns.taskType, options.taskType));
      }

      const runs = await database
        .select()
        .from(schema.agentRuns)
        .where(and(...conditions))
        .orderBy(desc(schema.agentRuns.createdAt))
        .limit(100);

      const dtos = await Promise.all(runs.map((run) => getDatabaseRunDto(database, run.id)));
      return dtos.filter((run): run is AgentRunDto => Boolean(run));
    },
    async softDeleteRunForUser(id, userId) {
      const [existing] = await database
        .select({ conversationId: schema.agentRuns.conversationId })
        .from(schema.agentRuns)
        .where(
          and(
            eq(schema.agentRuns.id, id),
            eq(schema.agentRuns.userId, userId),
            isNull(schema.agentRuns.deletedAt),
          ),
        )
        .limit(1);
      if (!existing) {
        return null;
      }

      const conversationId = existing.conversationId ?? id;
      const [run] = await database
        .update(schema.agentRuns)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.agentRuns.conversationId, conversationId),
            eq(schema.agentRuns.userId, userId),
            isNull(schema.agentRuns.deletedAt),
          ),
        )
        .returning();

      return run ? toAgentRunDtoFromDatabase({ run, artifacts: [] }) : null;
    },
    async markRunRunning(runId) {
      await database
        .update(schema.agentRuns)
        .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.agentRuns.id, runId));
      return getDatabaseRunDto(database, runId);
    },
    async patchRun(runId, input) {
      await database
        .update(schema.agentRuns)
        .set({
          ...(input.finalMessage !== undefined ? { finalMessage: input.finalMessage } : {}),
          ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
          ...(input.capabilitySnapshot
            ? { capabilitySnapshot: input.capabilitySnapshot as Record<string, unknown> }
            : {}),
          ...(input.input ? { input: input.input } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.agentRuns.id, runId));
      return getDatabaseRunDto(database, runId);
    },
    async completeRun(runId, input) {
      await database
        .update(schema.agentRuns)
        .set({
          status: 'succeeded',
          finalMessage: input.finalMessage,
          errorMessage: null,
          ...(input.capabilitySnapshot
            ? { capabilitySnapshot: input.capabilitySnapshot as Record<string, unknown> }
            : {}),
          ...(input.input ? { input: input.input } : {}),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.agentRuns.id, runId));

      if (input.artifacts.length > 0) {
        await database.insert(schema.agentArtifacts).values(
          input.artifacts.map((artifact) => ({
            runId,
            kind: artifact.kind,
            title: artifact.title,
            body: artifact.body ?? null,
            url: artifact.url ?? null,
            metadata: artifact.metadata ?? {},
            status: 'ready',
          })),
        );
      }

      return getDatabaseRunDto(database, runId);
    },
    async failRun(runId, errorMessage) {
      const failure = toFailureInput(errorMessage);
      await database
        .update(schema.agentRuns)
        .set({
          status: 'failed',
          errorMessage: failure.errorMessage,
          ...(failure.finalMessage !== undefined ? { finalMessage: failure.finalMessage } : {}),
          ...(failure.capabilitySnapshot
            ? { capabilitySnapshot: failure.capabilitySnapshot as Record<string, unknown> }
            : {}),
          ...(failure.input ? { input: failure.input } : {}),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.agentRuns.id, runId));
      if (failure.artifacts && failure.artifacts.length > 0) {
        await database.insert(schema.agentArtifacts).values(
          failure.artifacts.map((artifact) => ({
            runId,
            kind: artifact.kind,
            title: artifact.title,
            body: artifact.body ?? null,
            url: artifact.url ?? null,
            metadata: artifact.metadata ?? {},
            status: 'failed',
          })),
        );
      }
      return getDatabaseRunDto(database, runId);
    },
    async recordEvent(runId, input) {
      await database.insert(schema.agentRunLogEvents).values({
        runId,
        type: input.type,
        message: input.message ?? null,
        metadata: input.metadata ?? {},
      });
    },
    async appendRunEvent(runId, input) {
      const [lastEvent] = await database
        .select({ sequence: schema.agentRunStreamEvents.sequence })
        .from(schema.agentRunStreamEvents)
        .where(eq(schema.agentRunStreamEvents.runId, runId))
        .orderBy(desc(schema.agentRunStreamEvents.sequence))
        .limit(1);

      const sequence = (lastEvent?.sequence ?? 0) + 1;
      const [event] = await database
        .insert(schema.agentRunStreamEvents)
        .values({
          runId,
          sequence,
          eventType: input.eventType,
          payload: input.payload ?? {},
        })
        .returning();

      return event ? toStreamEventDto(event) : null;
    },
    async appendRunEvents(runId, input) {
      const appended: AgentRunStreamEventDto[] = [];
      for (const event of input) {
        const stored = await this.appendRunEvent(runId, event);
        if (stored) {
          appended.push(stored);
        }
      }
      return appended;
    },
    async listRunEvents(runId) {
      const events = await database
        .select()
        .from(schema.agentRunStreamEvents)
        .where(eq(schema.agentRunStreamEvents.runId, runId))
        .orderBy(asc(schema.agentRunStreamEvents.sequence), asc(schema.agentRunStreamEvents.createdAt));

      return events.map((event) => toStreamEventDto(event));
    },
    async addArtifact(runId, input) {
      await database.insert(schema.agentArtifacts).values({
        runId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        url: input.url ?? null,
        metadata: input.metadata ?? {},
        status: 'ready',
      });
      return getDatabaseRunDto(database, runId);
    },
    async updateArtifactSaveState(runId, artifactId, input) {
      const [artifact] = await database
        .select()
        .from(schema.agentArtifacts)
        .where(and(eq(schema.agentArtifacts.runId, runId), eq(schema.agentArtifacts.id, artifactId)))
        .limit(1);

      if (!artifact) {
        return null;
      }

      await database
        .update(schema.agentArtifacts)
        .set({
          metadata: mergeArtifactMetadata((artifact.metadata ?? {}) as Record<string, unknown>, input),
          updatedAt: new Date(),
        })
        .where(eq(schema.agentArtifacts.id, artifactId));

      return getDatabaseRunDto(database, runId);
    },
  };
}

export function createMemoryAgentRunRepository(): AgentRunRepository {
  const runs = new Map<string, StoredAgentRun>();
  const observationalEvents: AgentRunEventInput[] = [];
  const streamEvents = new Map<string, AgentRunStreamEventDto[]>();

  return {
    async createRun(input) {
      const now = new Date().toISOString();
      const runId = randomUUID();
      const run: StoredAgentRun = {
        id: runId,
        conversationId: input.conversationId ?? runId,
        userId: input.userId,
        taskType: input.taskType,
        status: 'queued',
        prompt: input.prompt,
        provider: input.provider,
        model: input.model,
        capabilitySnapshot: structuredClone(input.capabilitySnapshot),
        input: cloneRecord(input.input),
        finalMessage: null,
        errorMessage: null,
        capabilitySummary: {
          provider: input.provider,
          model: input.model,
          capabilities: input.capabilitySnapshot.capabilities.map((capability) => ({
            kind: capability.kind,
            code: capability.code,
            name: capability.name,
          })),
        },
        artifacts: [],
        createdAt: now,
        updatedAt: now,
      };

      runs.set(run.id, run);
      return toAgentRunDto(run);
    },
    async getRunForUser(id, userId) {
      const run = runs.get(id);
      return run?.userId === userId && !run.deletedAt ? toAgentRunDto(run) : null;
    },
    async getRunDetailForUser(id, userId) {
      const run = runs.get(id);
      if (!run || run.userId !== userId || run.deletedAt) {
        return null;
      }

      return {
        run: toAgentRunDto(run),
        events: [...(streamEvents.get(id) ?? [])],
        internal: {
          capabilitySnapshot: cloneRecord(run.capabilitySnapshot),
          input: cloneRecord(run.input),
        },
      };
    },
    async listConversationRunsForUser(conversationId, userId) {
      return Array.from(runs.values())
        .filter(
          (run) =>
            run.userId === userId &&
            run.taskType === 'chat' &&
            !run.deletedAt &&
            (run.conversationId ?? run.id) === conversationId,
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(toAgentRunDto);
    },
    async listRunsForUser(userId, options) {
      return Array.from(runs.values())
        .filter(
          (run) =>
            run.userId === userId &&
            !run.deletedAt &&
            (!options?.taskType || run.taskType === options.taskType),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toAgentRunDto);
    },
    async softDeleteRunForUser(id, userId) {
      const run = runs.get(id);
      if (!run || run.userId !== userId || run.deletedAt) {
        return null;
      }

      const conversationId = run.conversationId ?? run.id;
      for (const item of runs.values()) {
        if (item.userId === userId && (item.conversationId ?? item.id) === conversationId && !item.deletedAt) {
          item.deletedAt = new Date().toISOString();
          touch(item);
        }
      }
      return toAgentRunDto(run);
    },
    async markRunRunning(runId) {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      run.status = 'running';
      touch(run);
      return toAgentRunDto(run);
    },
    async patchRun(runId, input) {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      if (input.finalMessage !== undefined) {
        run.finalMessage = input.finalMessage;
      }
      if (input.errorMessage !== undefined) {
        run.errorMessage = input.errorMessage;
      }
      if (input.capabilitySnapshot) {
        run.capabilitySnapshot = structuredClone(input.capabilitySnapshot);
        run.capabilitySummary = toCapabilitySummary(input.capabilitySnapshot);
      }
      if (input.input) {
        run.input = cloneRecord(input.input);
      }
      touch(run);
      return toAgentRunDto(run);
    },
    async completeRun(runId, input) {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      run.status = 'succeeded';
      run.finalMessage = input.finalMessage;
      run.errorMessage = null;
      if (input.capabilitySnapshot) {
        run.capabilitySnapshot = structuredClone(input.capabilitySnapshot);
        run.capabilitySummary = toCapabilitySummary(input.capabilitySnapshot);
      }
      if (input.input) {
        run.input = cloneRecord(input.input);
      }
      run.artifacts.push(...input.artifacts.map(createArtifact));
      touch(run);
      return toAgentRunDto(run);
    },
    async failRun(runId, input) {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }
      const failure = toFailureInput(input);

      run.status = 'failed';
      run.finalMessage = failure.finalMessage ?? run.finalMessage;
      run.errorMessage = failure.errorMessage;
      if (failure.capabilitySnapshot) {
        run.capabilitySnapshot = structuredClone(failure.capabilitySnapshot);
        run.capabilitySummary = toCapabilitySummary(failure.capabilitySnapshot);
      }
      if (failure.input) {
        run.input = cloneRecord(failure.input);
      }
      if (failure.artifacts) {
        run.artifacts.push(...failure.artifacts.map(createArtifact));
      }
      touch(run);
      return toAgentRunDto(run);
    },
    async recordEvent(runId, input) {
      if (!runs.has(runId)) {
        return;
      }

      observationalEvents.push({
        type: input.type,
        message: input.message ?? null,
        metadata: cloneRecord(input.metadata ?? {}),
      });
    },
    async appendRunEvent(runId, input) {
      if (!runs.has(runId)) {
        return null;
      }
      const existing = streamEvents.get(runId) ?? [];
      const event: AgentRunStreamEventDto = {
        id: randomUUID(),
        runId,
        sequence: existing.length + 1,
        eventType: input.eventType,
        payload: cloneRecord(input.payload ?? {}),
        createdAt: new Date().toISOString(),
      };
      streamEvents.set(runId, [...existing, event]);
      return event;
    },
    async appendRunEvents(runId, input) {
      const appended: AgentRunStreamEventDto[] = [];
      for (const event of input) {
        const stored = await this.appendRunEvent(runId, event);
        if (stored) {
          appended.push(stored);
        }
      }
      return appended;
    },
    async listRunEvents(runId) {
      return [...(streamEvents.get(runId) ?? [])];
    },
    async addArtifact(runId, input) {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      run.artifacts.push(createArtifact(input));
      touch(run);
      return toAgentRunDto(run);
    },
    async updateArtifactSaveState(runId, artifactId, input) {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      const artifact = run.artifacts.find((item) => item.id === artifactId);
      if (!artifact) {
        return null;
      }

      artifact.metadata = mergeArtifactMetadata(artifact.metadata, input);
      touch(run);
      return toAgentRunDto(run);
    },
  };
}

const globalDevelopmentAgentRunRepository = globalThis as typeof globalThis & {
  __styxAgentRunRepository?: AgentRunRepository;
};

export function getAgentRunRepository(): AgentRunRepository {
  if (process.env.DATABASE_URL) {
    return createDatabaseAgentRunRepository();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required for agent run repository in production.');
  }

  // Temporary vertical-slice storage. This keeps runs shared across route invocations
  // in development/test until the database-backed repository replaces it.
  globalDevelopmentAgentRunRepository.__styxAgentRunRepository ??=
    createMemoryAgentRunRepository();
  return globalDevelopmentAgentRunRepository.__styxAgentRunRepository;
}
