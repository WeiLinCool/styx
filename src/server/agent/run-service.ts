import {
  calculateChatCreditCost,
  assertCanAffordMinimum as defaultAssertCanAffordMinimum,
  debitForAgentRun as defaultDebitForAgentRun,
} from '@/server/billing/credits';
import {
  createChatProviderAdapter as defaultCreateChatProviderAdapter,
  type ChatProviderAdapter,
} from '@/server/ai/provider-adapters';
import { resolveDefaultAgentCapabilityBundle } from '@/server/repositories/agent-capabilities';
import type { AgentRunRepository } from '@/server/repositories/agent-runs';
import {
  resolveChatModelForUser as defaultResolveChatModelForUser,
  type ResolvedChatModel,
} from '@/server/repositories/ai-models';
import type { AgentCapabilitySnapshot, AgentRunDto, AgentTaskType, AiUsage } from './types';
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

export class AgentRunModelRequiredError extends Error {
  constructor() {
    super('Chat modelId is required.');
    this.name = 'AgentRunModelRequiredError';
  }
}

type DebitForAgentRun = (input: {
  userId: string;
  runId: string;
  usage: AiUsage;
  pricing: ResolvedChatModel['pricing'];
  modelSnapshot: ResolvedChatModel;
  amount: number;
}) => Promise<{ entryId: string; balanceAfter: number }>;

export type CreateAgentRunServiceInput = {
  repository: AgentRunRepository;
  runtime: PiAgentRuntime;
  resolveChatModelForUser?: (userId: string, modelId: string) => Promise<ResolvedChatModel>;
  assertCanAffordMinimum?: (
    userId: string,
    pricing: ResolvedChatModel['pricing'],
  ) => Promise<void>;
  createChatProviderAdapter?: (model: ResolvedChatModel) => ChatProviderAdapter;
  debitForAgentRun?: DebitForAgentRun;
};

export type CreateAndRunAgentRunInput = {
  userId: string;
  taskType: AgentTaskType;
  prompt: string;
  modelId?: string;
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

function toSelectedModelSnapshot(model: ResolvedChatModel) {
  return {
    id: model.id,
    code: model.code,
    name: model.name,
    providerName: model.providerName,
    entitlementLabel: model.entitlement.label,
  };
}

function toChatCapabilitySnapshot(model: ResolvedChatModel): AgentCapabilitySnapshot & Record<string, unknown> {
  return {
    bundleId: `chat-model-${model.id}`,
    bundleCode: `chat-${model.code}`,
    provider: model.providerCode,
    model: model.model,
    capabilities: [
      {
        id: model.id,
        kind: 'model',
        code: model.code,
        name: model.name,
        config: {
          providerId: model.providerId,
          providerCode: model.providerCode,
          providerType: model.providerType,
          model: model.model,
        },
      },
    ],
    selectedModel: toSelectedModelSnapshot(model),
    billing: {
      status: 'pending',
      creditCost: null,
      ledgerEntryId: null,
    },
    entitlement: model.entitlement,
    pricing: model.pricing,
  };
}

function toChatRunInput(input: Record<string, unknown>, model: ResolvedChatModel) {
  return {
    ...cloneRecord(input),
    modelId: model.id,
    selectedModel: toSelectedModelSnapshot(model),
  };
}

export function createAgentRunService({
  repository,
  runtime,
  resolveChatModelForUser = defaultResolveChatModelForUser,
  assertCanAffordMinimum = defaultAssertCanAffordMinimum,
  createChatProviderAdapter = defaultCreateChatProviderAdapter,
  debitForAgentRun = defaultDebitForAgentRun,
}: CreateAgentRunServiceInput) {
  return {
    async createAndRunAgentRun(input: CreateAndRunAgentRunInput): Promise<AgentRunDto> {
      if (input.taskType === 'chat') {
        return createAndRunChatAgentRun({
          input,
          repository,
          resolveChatModelForUser,
          assertCanAffordMinimum,
          createChatProviderAdapter,
          debitForAgentRun,
        });
      }

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

async function createAndRunChatAgentRun(input: {
  input: CreateAndRunAgentRunInput;
  repository: AgentRunRepository;
  resolveChatModelForUser: (userId: string, modelId: string) => Promise<ResolvedChatModel>;
  assertCanAffordMinimum: (
    userId: string,
    pricing: ResolvedChatModel['pricing'],
  ) => Promise<void>;
  createChatProviderAdapter: (model: ResolvedChatModel) => ChatProviderAdapter;
  debitForAgentRun: DebitForAgentRun;
}) {
  const { repository, resolveChatModelForUser, assertCanAffordMinimum } = input;
  const request = input.input;
  if (!request.modelId) {
    throw new AgentRunModelRequiredError();
  }

  const model = await resolveChatModelForUser(request.userId, request.modelId);
  await assertCanAffordMinimum(request.userId, model.pricing);

  const capabilitySnapshot = toChatCapabilitySnapshot(model);
  const runInput = toChatRunInput(request.input, model);
  const created = await repository.createRun({
    userId: request.userId,
    taskType: request.taskType,
    prompt: request.prompt,
    provider: capabilitySnapshot.provider,
    model: capabilitySnapshot.model,
    capabilitySnapshot,
    input: runInput,
  });

  await recordEventIfSupported(repository, created.id, 'queued', 'Agent run queued', {
    taskType: request.taskType,
    modelId: model.id,
  });

  try {
    const running = requireUpdatedRun(await repository.markRunRunning(created.id), 'mark run running');
    await recordEventIfSupported(repository, running.id, 'running', 'Chat provider started', {
      provider: model.providerCode,
      model: model.model,
    });

    const providerResult = await input.createChatProviderAdapter(model).runChat({
      runId: running.id,
      userId: request.userId,
      model,
      messages: [{ role: 'user', content: request.prompt }],
    });
    const creditCost = calculateChatCreditCost({
      usage: providerResult.usage,
      pricing: model.pricing,
    });
    const debit = await input.debitForAgentRun({
      userId: request.userId,
      runId: running.id,
      usage: providerResult.usage,
      pricing: model.pricing,
      modelSnapshot: model,
      amount: creditCost,
    });
    const completedSnapshot = {
      ...capabilitySnapshot,
      usage: providerResult.usage,
      billing: {
        status: 'billed',
        creditCost,
        ledgerEntryId: debit.entryId,
      },
      rawMetadata: providerResult.rawMetadata,
    } satisfies AgentCapabilitySnapshot & Record<string, unknown>;

    const completed = requireUpdatedRun(
      await repository.completeRun(running.id, {
        finalMessage: providerResult.finalMessage,
        artifacts: [
          {
            kind: 'text',
            title: 'AI 回复',
            body: providerResult.finalMessage,
            metadata: {
              provider: model.providerCode,
              model: model.model,
              usage: providerResult.usage,
              billing: completedSnapshot.billing,
            },
          },
        ],
        capabilitySnapshot: completedSnapshot,
        input: {
          ...runInput,
          usage: providerResult.usage,
          billing: completedSnapshot.billing,
        },
      }),
      'complete run',
    );

    await recordEventIfSupported(repository, completed.id, 'succeeded', 'Agent run succeeded', {
      artifactCount: 1,
      creditCost,
      ledgerEntryId: debit.entryId,
    });

    return completed;
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    await recordEventIfSupported(repository, created.id, 'failed', errorMessage);
    return requireUpdatedRun(await repository.failRun(created.id, errorMessage), 'fail run');
  }
}
