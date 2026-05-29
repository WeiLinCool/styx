import { resolveDefaultAgentCapabilityBundle } from '@/server/repositories/agent-capabilities';
import type { AgentRunRepository } from '@/server/repositories/agent-runs';
import type { AgentRunDto, AgentTaskType } from './types';
import {
  createUnconfiguredCapabilitySnapshot,
  type PiAgentRuntime,
} from './pi-runtime';

export class AgentCapabilityBundleNotFoundError extends Error {
  constructor(taskType: AgentTaskType) {
    super(`No default agent capability bundle configured for task type: ${taskType}`);
    this.name = 'AgentCapabilityBundleNotFoundError';
  }
}

export type CreateAgentRunServiceInput = {
  repository: AgentRunRepository;
  runtime: PiAgentRuntime;
};

export type CreateAndRunAgentRunInput = {
  userId: string;
  taskType: AgentTaskType;
  prompt: string;
  input: Record<string, unknown>;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cloneRecord(record: Record<string, unknown>) {
  return structuredClone(record);
}

async function recordEventIfSupported(
  repository: AgentRunRepository,
  runId: string,
  type: string,
  message?: string,
  metadata?: Record<string, unknown>,
) {
  if (typeof repository.recordEvent !== 'function') {
    return;
  }

  try {
    await repository.recordEvent(runId, {
      type,
      message: message ?? null,
      metadata: cloneRecord(metadata ?? {}),
    });
  } catch {
    // Run events are observational. State transitions should not depend on event persistence.
  }
}

function requireUpdatedRun(run: AgentRunDto | null, action: string): AgentRunDto {
  if (!run) {
    throw new Error(`Agent run repository returned null while trying to ${action}`);
  }

  return run;
}

export function createAgentRunService({ repository, runtime }: CreateAgentRunServiceInput) {
  return {
    async createAndRunAgentRun(input: CreateAndRunAgentRunInput): Promise<AgentRunDto> {
      const configuredSnapshot = await resolveDefaultAgentCapabilityBundle(input.taskType);
      const capabilitySnapshot =
        configuredSnapshot ?? createUnconfiguredCapabilitySnapshot(input.taskType);

      const created = await repository.createRun({
        userId: input.userId,
        taskType: input.taskType,
        prompt: input.prompt,
        provider: capabilitySnapshot.provider,
        model: capabilitySnapshot.model,
        capabilitySnapshot,
        input: input.input,
      });

      await recordEventIfSupported(repository, created.id, 'queued', 'Agent run queued', {
        taskType: input.taskType,
      });

      if (!configuredSnapshot) {
        const error = new AgentCapabilityBundleNotFoundError(input.taskType);
        await recordEventIfSupported(repository, created.id, 'failed', error.message, {
          reason: 'missing_default_capability_bundle',
        });
        return requireUpdatedRun(await repository.failRun(created.id, error.message), 'fail run');
      }

      try {
        const running = requireUpdatedRun(await repository.markRunRunning(created.id), 'mark run running');
        await recordEventIfSupported(repository, running.id, 'running', 'Agent runtime started', {
          provider: capabilitySnapshot.provider,
          model: capabilitySnapshot.model,
        });

        const result = await runtime.run({
          runId: running.id,
          userId: input.userId,
          taskType: input.taskType,
          prompt: input.prompt,
          provider: capabilitySnapshot.provider,
          model: capabilitySnapshot.model,
          capabilities: structuredClone(capabilitySnapshot.capabilities),
          input: cloneRecord(input.input),
        });

        const completed = requireUpdatedRun(
          await repository.completeRun(running.id, {
            finalMessage: result.finalMessage,
            artifacts: result.artifacts,
          }),
          'complete run',
        );
        await recordEventIfSupported(repository, completed.id, 'succeeded', 'Agent run succeeded', {
          artifactCount: result.artifacts.length,
        });

        return completed;
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        await recordEventIfSupported(repository, created.id, 'failed', errorMessage);
        return requireUpdatedRun(await repository.failRun(created.id, errorMessage), 'fail run');
      }
    },
  };
}
