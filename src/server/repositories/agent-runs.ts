import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';

import type {
  AgentArtifactDto,
  AgentArtifactKind,
  AgentCapabilitySnapshot,
  AgentRunDto,
  AgentTaskType,
} from '@/server/agent/types';
import { db, schema } from '@/server/db';

export type CreateAgentRunInput = {
  userId: string;
  taskType: AgentTaskType;
  prompt: string;
  provider: string;
  model: string;
  capabilitySnapshot: AgentCapabilitySnapshot;
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

type StoredAgentRun = AgentRunDto & {
  userId: string;
  provider: string;
  model: string;
  capabilitySnapshot: AgentCapabilitySnapshot;
  input: Record<string, unknown>;
};

export type AgentRunRepository = {
  createRun(input: CreateAgentRunInput): Promise<AgentRunDto>;
  getRunForUser(id: string, userId: string): Promise<AgentRunDto | null>;
  listRunsForUser(userId: string): Promise<AgentRunDto[]>;
  markRunRunning(runId: string): Promise<AgentRunDto | null>;
  completeRun(
    runId: string,
    input: { finalMessage: string | null; artifacts: AgentArtifactInput[] },
  ): Promise<AgentRunDto | null>;
  failRun(runId: string, errorMessage: string): Promise<AgentRunDto | null>;
  recordEvent(runId: string, input: AgentRunEventInput): Promise<void>;
  addArtifact(runId: string, input: AgentArtifactInput): Promise<AgentRunDto | null>;
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

function toAgentRunDto(run: StoredAgentRun): AgentRunDto {
  return {
    id: run.id,
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

function touch(run: StoredAgentRun) {
  run.updatedAt = new Date().toISOString();
}

function toCapabilitySummary(snapshot: AgentCapabilitySnapshot) {
  return {
    provider: snapshot.provider,
    model: snapshot.model,
    capabilities: snapshot.capabilities.map((capability) => ({
      kind: capability.kind,
      code: capability.code,
      name: capability.name,
    })),
  };
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function toAgentRunDtoFromDatabase(input: {
  run: typeof schema.agentRuns.$inferSelect;
  artifacts: Array<typeof schema.agentArtifacts.$inferSelect>;
}): AgentRunDto {
  const snapshot = input.run.capabilitySnapshot as unknown as AgentCapabilitySnapshot;

  return {
    id: input.run.id,
    taskType: input.run.taskType,
    status: input.run.status,
    prompt: input.run.prompt,
    finalMessage: input.run.finalMessage,
    errorMessage: input.run.errorMessage,
    capabilitySummary: toCapabilitySummary(snapshot),
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
      const [run] = await database
        .insert(schema.agentRuns)
        .values({
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
        .where(eq(schema.agentRuns.id, id))
        .limit(1);

      if (!run || run.userId !== userId) {
        return null;
      }

      return getDatabaseRunDto(database, id);
    },
    async listRunsForUser(userId) {
      const runs = await database
        .select()
        .from(schema.agentRuns)
        .where(eq(schema.agentRuns.userId, userId))
        .orderBy(desc(schema.agentRuns.createdAt))
        .limit(100);

      const dtos = await Promise.all(runs.map((run) => getDatabaseRunDto(database, run.id)));
      return dtos.filter((run): run is AgentRunDto => Boolean(run));
    },
    async markRunRunning(runId) {
      await database
        .update(schema.agentRuns)
        .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
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
      await database
        .update(schema.agentRuns)
        .set({
          status: 'failed',
          errorMessage,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.agentRuns.id, runId));
      return getDatabaseRunDto(database, runId);
    },
    async recordEvent(runId, input) {
      await database.insert(schema.agentRunEvents).values({
        runId,
        type: input.type,
        message: input.message ?? null,
        metadata: input.metadata ?? {},
      });
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
  };
}

export function createMemoryAgentRunRepository(): AgentRunRepository {
  const runs = new Map<string, StoredAgentRun>();
  const events: AgentRunEventInput[] = [];

  return {
    async createRun(input) {
      const now = new Date().toISOString();
      const run: StoredAgentRun = {
        id: randomUUID(),
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
      return run?.userId === userId ? toAgentRunDto(run) : null;
    },
    async listRunsForUser(userId) {
      return Array.from(runs.values())
        .filter((run) => run.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toAgentRunDto);
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
    async completeRun(runId, input) {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      run.status = 'succeeded';
      run.finalMessage = input.finalMessage;
      run.errorMessage = null;
      run.artifacts.push(...input.artifacts.map(createArtifact));
      touch(run);
      return toAgentRunDto(run);
    },
    async failRun(runId, errorMessage) {
      const run = runs.get(runId);
      if (!run) {
        return null;
      }

      run.status = 'failed';
      run.errorMessage = errorMessage;
      touch(run);
      return toAgentRunDto(run);
    },
    async recordEvent(runId, input) {
      if (!runs.has(runId)) {
        return;
      }

      events.push({
        type: input.type,
        message: input.message ?? null,
        metadata: cloneRecord(input.metadata ?? {}),
      });
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
