import {
  calculateChatCreditCost,
  assertCanAffordMinimum as defaultAssertCanAffordMinimum,
  debitForAgentRun as defaultDebitForAgentRun,
} from '@/server/billing/credits';
import {
  createChatProviderAdapter as defaultCreateChatProviderAdapter,
  type ChatProviderResult,
  type ChatProviderAdapter,
} from '@/server/ai/provider-adapters';
import { resolveDefaultAgentCapabilityBundle } from '@/server/repositories/agent-capabilities';
import type { AgentRunRepository } from '@/server/repositories/agent-runs';
import {
  resolveChatModelForUser as defaultResolveChatModelForUser,
  type ResolvedChatModel,
} from '@/server/repositories/ai-models';
import type {
  AgentCapabilitySnapshot,
  AgentRunDto,
  AgentTaskType,
  AiUsage,
  CreateAgentRunResult,
  TransientAgentArtifactDto,
} from './types';
import type { AgentArtifactInput } from '@/server/repositories/agent-runs';
import {
  createUnconfiguredCapabilitySnapshot,
  type PiAgentRuntime,
} from './pi-runtime';
import {
  createDirectMediaEventPayload,
  sanitizeDirectMediaArtifact,
  toDirectMediaResult,
} from './media-results';

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

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type MediaRunScheduler = {
  schedule(runId: string, task: () => Promise<void>): void;
  getActiveRunIds(): string[];
};

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
  conversationId?: string;
  input: Record<string, unknown>;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cloneRecord(record: Record<string, unknown>) {
  return structuredClone(record);
}

const MEDIA_ARTIFACT_KINDS = new Set(['image', 'video']);

function readArtifactString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function readArtifactNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTransientArtifact(artifact: AgentArtifactInput): TransientAgentArtifactDto | null {
  if (!MEDIA_ARTIFACT_KINDS.has(artifact.kind)) {
    return null;
  }

  const metadata = cloneRecord(artifact.metadata ?? {});
  const mimeType = readArtifactString(metadata, 'mimeType') ?? 'application/octet-stream';
  const dataUrl = artifact.body && artifact.body.startsWith('data:') ? artifact.body : undefined;
  const url = artifact.url && artifact.url.startsWith('data:') ? artifact.url : undefined;
  const payload = dataUrl ?? url;
  if (!payload) {
    return null;
  }

  const width = readArtifactNumber(metadata, 'width') ?? undefined;
  const height = readArtifactNumber(metadata, 'height') ?? undefined;
  const byteLength = readArtifactNumber(metadata, 'byteLength') ?? undefined;
  const model = readArtifactString(metadata, 'model') ?? undefined;

  return {
    kind: artifact.kind as TransientAgentArtifactDto['kind'],
    title: artifact.title,
    mimeType,
    dataUrl: payload,
    filename: readArtifactString(metadata, 'filename') ?? undefined,
    metadata: {
      ...metadata,
      transient: true,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(byteLength !== undefined ? { byteLength } : {}),
      ...(model !== undefined ? { model } : {}),
    },
  };
}

function toDurableArtifactSummary(artifact: AgentArtifactInput): AgentArtifactInput {
  if (!MEDIA_ARTIFACT_KINDS.has(artifact.kind)) {
    return artifact;
  }

  return {
    kind: artifact.kind,
    title: artifact.title,
    body: null,
    url: null,
    metadata: {
      ...cloneRecord(artifact.metadata ?? {}),
      transient: true,
    },
  };
}

function splitTransientArtifacts(artifacts: AgentArtifactInput[]) {
  return {
    durableArtifacts: artifacts.map(toDurableArtifactSummary),
    transientArtifacts: artifacts
      .map(toTransientArtifact)
      .filter((artifact): artifact is TransientAgentArtifactDto => artifact !== null),
  };
}

function isMediaTask(taskType: AgentTaskType) {
  return taskType === 'image' || taskType === 'video';
}

function hasUsableDirectMedia(artifacts: AgentArtifactInput[]) {
  return artifacts.some((artifact) => toDirectMediaResult(artifact));
}

function runResult(
  run: AgentRunDto,
  transientArtifacts: TransientAgentArtifactDto[] = [],
): CreateAgentRunResult {
  return { run, transientArtifacts };
}

function createMediaRunScheduler(): MediaRunScheduler {
  const activeRuns = new Map<string, Promise<void>>();

  return {
    schedule(runId, task) {
      const scheduled = Promise.resolve().then(task);
      activeRuns.set(runId, scheduled);
      const cleanup = () => {
        if (activeRuns.get(runId) === scheduled) {
          activeRuns.delete(runId);
        }
      };
      scheduled.then(cleanup, cleanup);
    },
    getActiveRunIds() {
      return [...activeRuns.keys()];
    },
  };
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

async function appendRunEventIfSupported(
  repository: AgentRunRepository,
  runId: string,
  input: Parameters<AgentRunRepository['appendRunEvent']>[1],
) {
  try {
    await repository.appendRunEvent(runId, input);
  } catch {
    // Stream events are best-effort. Durable run state remains the source of truth.
  }
}

async function appendRunEventsIfSupported(
  repository: AgentRunRepository,
  runId: string,
  input: Parameters<AgentRunRepository['appendRunEvents']>[1],
) {
  try {
    await repository.appendRunEvents(runId, input);
  } catch {
    // Stream events are best-effort. Durable run state remains the source of truth.
  }
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

function toChatProviderMessages(runs: AgentRunDto[], nextPrompt: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const run of runs) {
    messages.push({ role: 'user', content: run.prompt });
    if (run.finalMessage) {
      messages.push({ role: 'assistant', content: run.finalMessage });
    }
  }
  messages.push({ role: 'user', content: nextPrompt });
  return messages;
}

function toFailedChatSnapshot(input: {
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  providerResult?: ChatProviderResult;
  creditCost?: number | null;
  errorMessage: string;
}) {
  return {
    ...input.capabilitySnapshot,
    ...(input.providerResult
      ? {
          usage: input.providerResult.usage,
          rawMetadata: input.providerResult.rawMetadata,
        }
      : {}),
    billing: {
      status: 'failed',
      creditCost: input.creditCost ?? null,
      ledgerEntryId: null,
    },
    failure: {
      message: input.errorMessage,
    },
  } satisfies AgentCapabilitySnapshot & Record<string, unknown>;
}

function providerArtifact(input: {
  model: ResolvedChatModel;
  providerResult: ChatProviderResult;
  billing: Record<string, unknown>;
}) {
  return {
    kind: 'text' as const,
    title: 'AI 回复',
    body: input.providerResult.finalMessage,
    metadata: {
      provider: input.model.providerCode,
      model: input.model.model,
      usage: input.providerResult.usage,
      billing: input.billing,
    },
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
  const mediaRunScheduler = createMediaRunScheduler();

  return {
    async createAndRunAgentRun(input: CreateAndRunAgentRunInput): Promise<CreateAgentRunResult> {
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
        return runResult(requireUpdatedRun(await repository.failRun(created.id, error.message), 'fail run'));
      }

      if (isMediaTask(input.taskType)) {
        const running = requireUpdatedRun(await repository.markRunRunning(created.id), 'mark run running');
        await recordEventIfSupported(repository, running.id, 'running', 'Agent runtime started', {
          provider: capabilitySnapshot.provider,
          model: capabilitySnapshot.model,
        });

        mediaRunScheduler.schedule(running.id, async () => {
          try {
            await runMediaOrchestration({
              repository,
              runtime,
              request: input,
              capabilitySnapshot,
              running,
            });
          } catch (error) {
            await failMediaRun(repository, running.id, toErrorMessage(error));
          }
        });

        return runResult(running);
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
        const { durableArtifacts, transientArtifacts } = splitTransientArtifacts(result.artifacts);

        const completed = requireUpdatedRun(
          await repository.completeRun(running.id, {
            finalMessage: result.finalMessage,
            artifacts: durableArtifacts,
          }),
          'complete run',
        );
        await recordEventIfSupported(repository, completed.id, 'succeeded', 'Agent run succeeded', {
          artifactCount: result.artifacts.length,
        });

        return runResult(completed, transientArtifacts);
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        await recordEventIfSupported(repository, created.id, 'failed', errorMessage);
        return runResult(requireUpdatedRun(await repository.failRun(created.id, errorMessage), 'fail run'));
      }
    },
  };
}

async function failMediaRun(repository: AgentRunRepository, runId: string, errorMessage: string) {
  await recordEventIfSupported(repository, runId, 'failed', errorMessage);
  await repository.failRun(runId, errorMessage);
  await appendRunEventIfSupported(repository, runId, {
    eventType: 'run_failed',
    payload: {
      message: errorMessage,
      failedAt: new Date().toISOString(),
    },
  });
}

async function runMediaOrchestration(input: {
  repository: AgentRunRepository;
  runtime: PiAgentRuntime;
  request: CreateAndRunAgentRunInput;
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  running: AgentRunDto;
}) {
  await appendRunEventIfSupported(input.repository, input.running.id, {
    eventType: 'artifact_started',
    payload: {
      taskType: input.request.taskType,
      startedAt: new Date().toISOString(),
    },
  });

  const result = await input.runtime.run({
    runId: input.running.id,
    userId: input.request.userId,
    taskType: input.request.taskType,
    prompt: input.request.prompt,
    provider: input.capabilitySnapshot.provider,
    model: input.capabilitySnapshot.model,
    capabilities: structuredClone(input.capabilitySnapshot.capabilities),
    input: cloneRecord(input.request.input),
  });

  if (!hasUsableDirectMedia(result.artifacts)) {
    throw new Error('模型任务完成，但没有返回可展示的图片或视频。');
  }

  const directMediaResults = result.artifacts
    .map(toDirectMediaResult)
    .filter((artifact): artifact is NonNullable<ReturnType<typeof toDirectMediaResult>> => artifact !== null);

  await appendRunEventsIfSupported(
    input.repository,
    input.running.id,
    directMediaResults.map((artifact) => ({
      eventType: 'artifact_completed',
      payload: createDirectMediaEventPayload(artifact),
    })),
  );

  const completed = requireUpdatedRun(
    await input.repository.completeRun(input.running.id, {
      finalMessage: result.finalMessage,
      artifacts: result.artifacts.map(sanitizeDirectMediaArtifact),
    }),
    'complete run',
  );

  await appendRunEventIfSupported(input.repository, completed.id, {
    eventType: 'run_completed',
    payload: {
      finalMessage: result.finalMessage,
      artifactCount: directMediaResults.length,
      storageStatus: 'provider_direct',
      completedAt: new Date().toISOString(),
    },
  });

  await recordEventIfSupported(input.repository, completed.id, 'succeeded', 'Agent run succeeded', {
    artifactCount: directMediaResults.length,
    storageStatus: 'provider_direct',
  });
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
}): Promise<CreateAgentRunResult> {
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
    conversationId: request.conversationId,
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

  const running = requireUpdatedRun(await repository.markRunRunning(created.id), 'mark run running');
  await recordEventIfSupported(repository, running.id, 'running', 'Chat provider started', {
    provider: model.providerCode,
    model: model.model,
  });
  void runChatOrchestration({
    repository,
    model,
    request,
    runInput,
    capabilitySnapshot,
    running,
    createChatProviderAdapter: input.createChatProviderAdapter,
    debitForAgentRun: input.debitForAgentRun,
  }).catch(async (error) => {
    const errorMessage = toErrorMessage(error);
    const failedSnapshot = toFailedChatSnapshot({ capabilitySnapshot, errorMessage });
    await recordEventIfSupported(repository, running.id, 'failed', errorMessage);
    await repository.appendRunEvent(running.id, {
      eventType: 'run_failed',
      payload: {
        message: errorMessage,
        failedAt: new Date().toISOString(),
      },
    });
    await repository.failRun(running.id, {
      errorMessage,
      capabilitySnapshot: failedSnapshot,
      input: {
        ...runInput,
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
  });

  return runResult(running);
}

async function runChatOrchestration(input: {
  repository: AgentRunRepository;
  model: ResolvedChatModel;
  request: CreateAndRunAgentRunInput;
  runInput: Record<string, unknown>;
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  running: AgentRunDto;
  createChatProviderAdapter: (model: ResolvedChatModel) => ChatProviderAdapter;
  debitForAgentRun: DebitForAgentRun;
}) {
  const adapter = input.createChatProviderAdapter(input.model);
  const priorRuns = input.running.conversationId
    ? await input.repository.listConversationRunsForUser(input.running.conversationId, input.request.userId)
    : [];
  const priorCompletedRuns = priorRuns.filter((run) => run.id !== input.running.id && run.status === 'succeeded');
  const messages = toChatProviderMessages(priorCompletedRuns, input.request.prompt);
  await input.repository.appendRunEvent(input.running.id, {
    eventType: 'assistant_message_started',
    payload: {
      messageId: `${input.running.id}-assistant`,
      role: 'assistant',
    },
  });
  const providerResult = adapter.streamChat
    ? await collectStreamedChatResult({
        repository: input.repository,
        runId: input.running.id,
        adapter,
        model: input.model,
        userId: input.request.userId,
        messages,
      })
    : await adapter.runChat({
        runId: input.running.id,
        userId: input.request.userId,
        model: input.model,
        messages,
      });

  await input.repository.appendRunEvents(input.running.id, [
    {
      eventType: 'assistant_message_completed',
      payload: {
        messageId: `${input.running.id}-assistant`,
        finalLength: providerResult.finalMessage.length,
      },
    },
  ]);

  const creditCost = calculateChatCreditCost({
    usage: providerResult.usage,
    pricing: input.model.pricing,
  });
  let debit: { entryId: string; balanceAfter: number };
  try {
    debit = await input.debitForAgentRun({
      userId: input.request.userId,
      runId: input.running.id,
      usage: providerResult.usage,
      pricing: input.model.pricing,
      modelSnapshot: input.model,
      amount: creditCost,
    });
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const failedSnapshot = toFailedChatSnapshot({
      capabilitySnapshot: input.capabilitySnapshot,
      providerResult,
      creditCost,
      errorMessage,
    });
    await input.repository.appendRunEvent(input.running.id, {
      eventType: 'run_failed',
      payload: {
        message: errorMessage,
        failedAt: new Date().toISOString(),
      },
    });
    await input.repository.failRun(input.running.id, {
      errorMessage,
      finalMessage: providerResult.finalMessage,
      artifacts: [
        providerArtifact({
          model: input.model,
          providerResult,
          billing: failedSnapshot.billing as Record<string, unknown>,
        }),
      ],
      capabilitySnapshot: failedSnapshot,
      input: {
        ...input.runInput,
        usage: providerResult.usage,
        billing: failedSnapshot.billing as Record<string, unknown>,
      },
    });
    return;
  }
  await input.repository.appendRunEvent(input.running.id, {
    eventType: 'billing_recorded',
    payload: {
      creditCost,
      ledgerEntryId: debit.entryId,
      balanceAfter: debit.balanceAfter,
    },
  });

  const completedSnapshot = {
    ...input.capabilitySnapshot,
    usage: providerResult.usage,
    billing: {
      status: 'billed',
      creditCost,
      ledgerEntryId: debit.entryId,
    },
    rawMetadata: providerResult.rawMetadata,
  } satisfies AgentCapabilitySnapshot & Record<string, unknown>;

  const completed = requireUpdatedRun(
    await input.repository.completeRun(input.running.id, {
      finalMessage: providerResult.finalMessage,
      artifacts: [providerArtifact({ model: input.model, providerResult, billing: completedSnapshot.billing })],
      capabilitySnapshot: completedSnapshot,
      input: {
        ...input.runInput,
        usage: providerResult.usage,
        billing: completedSnapshot.billing,
      },
    }),
    'complete run',
  );

  await input.repository.appendRunEvent(completed.id, {
    eventType: 'run_completed',
    payload: {
      finalMessage: providerResult.finalMessage,
      usage: providerResult.usage,
      completedAt: new Date().toISOString(),
    },
  });

  await recordEventIfSupported(input.repository, completed.id, 'succeeded', 'Agent run succeeded', {
    artifactCount: 1,
    creditCost,
    ledgerEntryId: debit.entryId,
  });
}

async function collectStreamedChatResult(input: {
  repository: AgentRunRepository;
  runId: string;
  adapter: ChatProviderAdapter;
  model: ResolvedChatModel;
  userId: string;
  messages: ChatMessage[];
}) {
  const stream = input.adapter.streamChat?.({
    runId: input.runId,
    userId: input.userId,
    model: input.model,
    messages: input.messages,
  });
  if (!stream) {
    return input.adapter.runChat({
      runId: input.runId,
      userId: input.userId,
      model: input.model,
      messages: input.messages,
    });
  }

  let finalMessage = '';
  let usage: AiUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let rawMetadata: Record<string, unknown> = {};
  for await (const event of stream) {
    if (event.type === 'delta') {
      finalMessage += event.delta;
      await input.repository.appendRunEvent(input.runId, {
        eventType: 'assistant_delta',
        payload: {
          messageId: `${input.runId}-assistant`,
          delta: event.delta,
        },
      });
      continue;
    }

    finalMessage = event.finalMessage;
    usage = event.usage;
    rawMetadata = event.rawMetadata;
  }

  return { finalMessage, usage, rawMetadata };
}
