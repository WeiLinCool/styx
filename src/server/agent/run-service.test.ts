import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryAgentRunRepository,
  type AgentRunEventInput,
  type AgentRunRepository,
} from '@/server/repositories/agent-runs';
import type { ResolvedChatModel } from '@/server/repositories/ai-models';
import type { DirectMediaArtifactCompletedPayload, AgentTaskType } from './types';
import type { ChatProviderMessage } from '@/server/ai/provider-adapters';
import { createDeterministicPiRuntime } from './pi-runtime';
import {
  AgentRunModelRequiredError,
  createAgentRunService,
} from './run-service';

function resolvedChatModel(overrides: Partial<ResolvedChatModel> = {}): ResolvedChatModel {
  return {
    id: 'seed-model-free',
    code: 'dev-free-chat',
    name: 'Development Free Chat',
    providerName: 'Development Provider',
    isDefault: true,
    entitlementLabel: 'Free',
    pricingSummary: '1 credit minimum',
    providerId: 'seed-provider-development',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-free-chat',
    pricing: {
      unit: 'token',
      promptCreditsPer1k: 1,
      completionCreditsPer1k: 2,
      minimumCredits: 1,
    },
    entitlement: { allowed: true, basis: 'none', label: 'Free', value: null },
    ...overrides,
  };
}

function directMediaPayload(payload: Record<string, unknown>): DirectMediaArtifactCompletedPayload {
  return payload as DirectMediaArtifactCompletedPayload;
}

test('createAndRunAgentRun completes run with deterministic Pi adapter output', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '帮我设计一个石头印画作品',
    input: {},
  });
  const run = result.run;

  assert.equal(run.status, 'running');
  assert.deepEqual(result.transientArtifacts, []);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const completed = await repository.getRunForUser(run.id, 'user-1');
  const events = await repository.listRunEvents(run.id);
  assert.equal(completed?.status, 'succeeded');
  assert.match(completed?.finalMessage ?? '', /及时下载保存/);
  assert.equal(run.capabilitySummary.provider, 'pi');
  assert.equal(completed?.artifacts.length, 1);
  assert.equal(completed?.artifacts[0]?.kind, 'image');
  assert.equal(completed?.artifacts[0]?.body, null);
  assert.equal(completed?.artifacts[0]?.url, null);
  assert.equal(completed?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
  assert.match(directMediaPayload(events[1]?.payload ?? {}).artifact.delivery.url, /^data:image\/svg\+xml;base64,/);
});

test('createAndRunAgentRun streams direct image artifact while persisting only summary data', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        return {
          finalMessage: '图片已生成，请及时下载保存。',
          artifacts: [
            {
              kind: 'image',
              title: '生成图片',
              body: 'data:image/png;base64,SHOULD_NOT_PERSIST',
              url: 'https://provider.example/generated.png',
              metadata: {
                mimeType: 'image/png',
                width: 1024,
                height: 1024,
              },
            },
          ],
        };
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '一只戴红围巾的小猫石头印画',
    input: { mode: 'generate', size: '1:1' },
  });

  assert.equal(result.run.status, 'running');
  assert.deepEqual(result.transientArtifacts, []);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const stored = await repository.getRunForUser(result.run.id, 'user-1');
  const events = await repository.listRunEvents(result.run.id);
  assert.equal(stored?.status, 'succeeded');
  assert.equal(stored?.artifacts.length, 1);
  assert.equal(stored?.artifacts[0]?.kind, 'image');
  assert.equal(stored?.artifacts[0]?.body, null);
  assert.equal(stored?.artifacts[0]?.url, null);
  assert.equal(stored?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
  assert.equal(stored?.artifacts[0]?.metadata.mimeType, 'image/png');
  assert.equal(
    directMediaPayload(events[1]?.payload ?? {}).artifact.delivery.url,
    'https://provider.example/generated.png',
  );
});

test('createAndRunAgentRun returns running image run and streams direct media completion', async () => {
  const repository = createMemoryAgentRunRepository();
  let unblockRuntime = () => {};
  const runtimeStarted = new Promise<void>((resolve) => {
    unblockRuntime = resolve;
  });
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        await runtimeStarted;
        return {
          finalMessage: '图片已生成',
          artifacts: [
            {
              kind: 'image',
              title: '生成图片',
              body: 'data:image/png;base64,abc',
              metadata: { mimeType: 'image/png', width: 1024, height: 1024 },
            },
          ],
        };
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山谷里的石头印画',
    input: { size: '1:1' },
  });

  assert.equal(result.run.status, 'running');
  assert.deepEqual(result.transientArtifacts, []);

  unblockRuntime();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const completed = await repository.getRunForUser(result.run.id, 'user-1');
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.artifacts[0]?.body, null);
  assert.equal(completed?.artifacts[0]?.url, null);
  assert.equal(completed?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['artifact_started', 'artifact_completed', 'run_completed'],
  );
  assert.equal(directMediaPayload(events[1]?.payload ?? {}).artifact.kind, 'image');
  assert.equal(directMediaPayload(events[1]?.payload ?? {}).artifact.delivery.url, 'data:image/png;base64,abc');
});

test('createAndRunAgentRun returns running video run and streams provider URL completion', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        return {
          finalMessage: '视频已生成',
          artifacts: [
            {
              kind: 'video',
              title: '生成视频',
              url: 'https://provider.example/video.mp4',
              metadata: {
                mimeType: 'video/mp4',
                filename: 'video.mp4',
                durationSeconds: 5,
                providerExpiresAt: '2026-06-01T10:00:00.000Z',
              },
            },
          ],
        };
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: '石头印画动起来',
    input: { duration: '5秒' },
  });

  assert.equal(result.run.status, 'running');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const completed = await repository.getRunForUser(result.run.id, 'user-1');
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
  assert.equal(events[1]?.eventType, 'artifact_completed');
  assert.equal(directMediaPayload(events[1]?.payload ?? {}).artifact.kind, 'video');
  assert.equal(directMediaPayload(events[1]?.payload ?? {}).artifact.delivery.mode, 'provider_url');
  assert.equal(
    directMediaPayload(events[1]?.payload ?? {}).artifact.delivery.url,
    'https://provider.example/video.mp4',
  );
});

test('createAndRunAgentRun records failure when runtime throws', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        throw new Error('pi unavailable');
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: 'hello',
    input: {},
  });
  const run = result.run;

  assert.equal(run.status, 'running');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const failed = await repository.getRunForUser(run.id, 'user-1');
  const events = await repository.listRunEvents(run.id);
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.errorMessage, 'pi unavailable');
  assert.equal(events.at(-1)?.eventType, 'run_failed');
});

test('createAndRunAgentRun marks media run failed when run_failed event persistence fails', async () => {
  const baseRepository = createMemoryAgentRunRepository();
  const repository: AgentRunRepository = {
    ...baseRepository,
    async appendRunEvent(runId, input) {
      if (input.eventType === 'run_failed') {
        throw new Error('stream event store unavailable');
      }
      return baseRepository.appendRunEvent(runId, input);
    },
  };
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        throw new Error('pi unavailable');
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: 'hello',
    input: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const failed = await repository.getRunForUser(result.run.id, 'user-1');
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.errorMessage, 'pi unavailable');
});

test('createAndRunAgentRun marks media run failed when artifact_completed event persistence fails', async () => {
  const baseRepository = createMemoryAgentRunRepository();
  const repository: AgentRunRepository = {
    ...baseRepository,
    async appendRunEvent(runId, input) {
      if (input.eventType === 'artifact_completed') {
        throw new Error('artifact event store unavailable');
      }

      return baseRepository.appendRunEvent(runId, input);
    },
    async appendRunEvents(runId, input) {
      const appended = [];
      for (const event of input) {
        const stored = await this.appendRunEvent(runId, event);
        if (stored) {
          appended.push(stored);
        }
      }
      return appended;
    },
  };
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        return {
          finalMessage: '图片已生成',
          artifacts: [
            {
              kind: 'image',
              title: '生成图片',
              body: 'data:image/png;base64,abc',
              metadata: { mimeType: 'image/png' },
            },
          ],
        };
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山谷里的石头印画',
    input: {},
  });

  assert.equal(result.run.status, 'running');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const failed = await repository.getRunForUser(result.run.id, 'user-1');
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.artifacts.length, 0);
  assert.equal(failed?.errorMessage, '图片或视频结果推送失败，请重试。');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['artifact_started', 'run_failed'],
  );
});

test('createAndRunAgentRun keeps completed run succeeded when succeeded event recording fails', async () => {
  const repository: AgentRunRepository = {
    ...createMemoryAgentRunRepository(),
    async recordEvent(_runId: string, input: AgentRunEventInput) {
      if (input.type === 'succeeded') {
        throw new Error('event store unavailable');
      }
    },
  };
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: 'hello',
    input: {},
  });
  const run = result.run;

  assert.equal(run.status, 'running');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const completed = await repository.getRunForUser(run.id, 'user-1');
  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.errorMessage, null);
});

test('createAndRunAgentRun keeps media run succeeded when run_completed event persistence fails', async () => {
  const baseRepository = createMemoryAgentRunRepository();
  const repository: AgentRunRepository = {
    ...baseRepository,
    async appendRunEvent(runId, input) {
      if (input.eventType === 'run_completed') {
        throw new Error('stream event store unavailable');
      }
      return baseRepository.appendRunEvent(runId, input);
    },
    async appendRunEvents(runId, input) {
      const appended = [];
      for (const event of input) {
        const stored = await this.appendRunEvent(runId, event);
        if (stored) {
          appended.push(stored);
        }
      }
      return appended;
    },
  };
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: 'hello',
    input: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const completed = await repository.getRunForUser(result.run.id, 'user-1');
  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.errorMessage, null);
});

test('createAndRunAgentRun clones runtime request input and capabilities', async () => {
  const repository = createMemoryAgentRunRepository();
  const callerInput = { nested: { value: 'original' } };
  const service = createAgentRunService({
    repository,
    runtime: {
      async run(request) {
        request.input.nested = { value: 'mutated' };
        request.capabilities[0].name = 'Mutated Model';
        request.capabilities[0].config.model = 'mutated-model';

        return {
          finalMessage: 'done',
          artifacts: [],
        };
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: 'hello',
    input: callerInput,
  });

  assert.deepEqual(callerInput, { nested: { value: 'original' } });
  const run = result.run;
  assert.equal(run.capabilitySummary.model, 'pi-default');
  assert.equal(run.capabilitySummary.capabilities[0].name, 'Pi 默认模型');
});

test('createAndRunAgentRun returns failed unconfigured run when no default bundle exists', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'unsupported' as AgentTaskType,
    prompt: 'hello',
    input: {},
  });
  const run = result.run;

  assert.equal(run.status, 'failed');
  assert.equal(run.capabilitySummary.provider, 'unconfigured');
  assert.equal(run.capabilitySummary.model, 'unconfigured');
  assert.match(run.errorMessage ?? '', /No default agent capability bundle/);
});

test('createAndRunAgentRun rejects chat without modelId before creating a run', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'chat',
        prompt: 'hello',
        input: {},
      }),
    AgentRunModelRequiredError,
  );

  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('createAndRunAgentRun routes chat through selected model adapter and bills usage', async () => {
  const repository = createMemoryAgentRunRepository();
  const debits: Array<{ amount: number; runId: string; modelCode: string }> = [];
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveChatModelForUser: async (_userId, modelId) => {
      assert.equal(modelId, 'seed-model-free');
      return resolvedChatModel();
    },
    assertCanAffordMinimum: async (_userId, pricing) => {
      assert.equal(pricing.minimumCredits, 1);
    },
    createChatProviderAdapter: () => ({
      kind: 'development',
      async runChat(request) {
        assert.equal(request.model.id, 'seed-model-free');
        assert.deepEqual(request.messages, [{ role: 'user', content: 'hello' }]);
        return {
          finalMessage: 'provider response',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          rawMetadata: { developmentFallback: true },
        };
      },
    }),
    debitForAgentRun: async (input) => {
      debits.push({
        amount: input.amount,
        runId: input.runId,
        modelCode: input.modelSnapshot.code,
      });
      return { entryId: 'ledger-1', balanceAfter: 99 };
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
    input: {},
  });
  const run = result.run;

  assert.equal(run.status, 'running');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const completed = await repository.getRunForUser(run.id, 'user-1');
  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.finalMessage, 'provider response');
  assert.deepEqual(completed?.usage, { promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  assert.equal(completed?.selectedModel?.code, 'dev-free-chat');
  assert.equal(completed?.billing?.status, 'billed');
  assert.equal(completed?.billing?.creditCost, 1);
  assert.equal(completed?.billing?.ledgerEntryId, 'ledger-1');
  assert.equal(debits.length, 1);
  assert.equal(debits[0].modelCode, 'dev-free-chat');
});

test('createAndRunAgentRun returns running chat run immediately and persists stream events', async () => {
  const repository = createMemoryAgentRunRepository();
  let unblockFinal: (() => void) | null = null;
  const finalReached = new Promise<void>((resolve) => {
    unblockFinal = resolve;
  });
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveChatModelForUser: async () => resolvedChatModel(),
    assertCanAffordMinimum: async () => {},
    createChatProviderAdapter: () => ({
      kind: 'development',
      async runChat() {
        throw new Error('stream path should be used');
      },
      async *streamChat() {
        yield { type: 'delta', delta: 'hello ' };
        yield { type: 'delta', delta: 'world' };
        unblockFinal?.();
        yield {
          type: 'final',
          finalMessage: 'hello world',
          usage: { promptTokens: 5, completionTokens: 6, totalTokens: 11 },
          rawMetadata: { streamed: true },
        };
      },
    }),
    debitForAgentRun: async () => ({ entryId: 'ledger-1', balanceAfter: 88 }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
    input: {},
  });
  const run = result.run;

  assert.equal(run.status, 'running');
  await finalReached;
  await new Promise((resolve) => setTimeout(resolve, 0));

  const events = await repository.listRunEvents(run.id);
  const completed = await repository.getRunForUser(run.id, 'user-1');

  assert.deepEqual(
    events.map((event) => event.eventType),
    [
      'assistant_message_started',
      'assistant_delta',
      'assistant_delta',
      'assistant_message_completed',
      'billing_recorded',
      'run_completed',
    ],
  );
  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.finalMessage, 'hello world');
});

test('createAndRunAgentRun sends prior conversation messages to chat provider', async () => {
  const repository = createMemoryAgentRunRepository();
  let messages: ChatProviderMessage[] = [];
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveChatModelForUser: async () => resolvedChatModel(),
    assertCanAffordMinimum: async () => {},
    createChatProviderAdapter: () => ({
      kind: 'development',
      async runChat(request) {
        messages = request.messages;
        return {
          finalMessage: 'second response',
          usage: { promptTokens: 8, completionTokens: 9, totalTokens: 17 },
          rawMetadata: {},
        };
      },
    }),
    debitForAgentRun: async () => ({ entryId: 'ledger-1', balanceAfter: 88 }),
  });

  const first = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'first prompt',
    modelId: 'seed-model-free',
    input: {},
  });
  const firstRun = first.run;
  await new Promise((resolve) => setTimeout(resolve, 0));

  await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'second prompt',
    modelId: 'seed-model-free',
    conversationId: firstRun.conversationId ?? undefined,
    input: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(messages, [
    { role: 'user', content: 'first prompt' },
    { role: 'assistant', content: 'second response' },
    { role: 'user', content: 'second prompt' },
  ]);
});

test('createAndRunAgentRun persists failed billing metadata when debit fails after provider success', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveChatModelForUser: async () => resolvedChatModel(),
    assertCanAffordMinimum: async () => {},
    createChatProviderAdapter: () => ({
      kind: 'development',
      async runChat() {
        return {
          finalMessage: 'provider response before billing failed',
          usage: { promptTokens: 11, completionTokens: 22, totalTokens: 33 },
          rawMetadata: { completionId: 'completion-1' },
        };
      },
    }),
    debitForAgentRun: async () => {
      throw new Error('ledger unavailable');
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
    input: {},
  });
  const run = result.run;

  assert.equal(run.status, 'running');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const failed = await repository.getRunForUser(run.id, 'user-1');
  const events = await repository.listRunEvents(run.id);
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.finalMessage, 'provider response before billing failed');
  assert.deepEqual(failed?.usage, { promptTokens: 11, completionTokens: 22, totalTokens: 33 });
  assert.equal(failed?.selectedModel?.code, 'dev-free-chat');
  assert.equal(failed?.billing?.status, 'failed');
  assert.equal(failed?.billing?.creditCost, 1);
  assert.equal(failed?.billing?.ledgerEntryId, null);
  assert.equal(failed?.artifacts.length, 1);
  assert.equal(failed?.artifacts[0].body, 'provider response before billing failed');
  assert.equal(events.at(-1)?.eventType, 'run_failed');
});

test('createAndRunAgentRun marks billing failed when provider fails after run creation', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveChatModelForUser: async () => resolvedChatModel(),
    assertCanAffordMinimum: async () => {},
    createChatProviderAdapter: () => ({
      kind: 'development',
      async runChat() {
        throw new Error('provider unavailable');
      },
    }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
    input: {},
  });
  const run = result.run;

  assert.equal(run.status, 'running');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const failed = await repository.getRunForUser(run.id, 'user-1');
  const events = await repository.listRunEvents(run.id);
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.usage, null);
  assert.equal(failed?.selectedModel?.code, 'dev-free-chat');
  assert.equal(failed?.billing?.status, 'failed');
  assert.equal(failed?.billing?.creditCost, null);
  assert.equal(failed?.billing?.ledgerEntryId, null);
  assert.equal(events.at(-1)?.eventType, 'run_failed');
});

test('createAndRunAgentRun does not call provider when model resolution fails', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveChatModelForUser: async () => {
      throw new Error('Model entitlement is required.');
    },
    assertCanAffordMinimum: async () => {
      throw new Error('credit preflight should not run');
    },
    createChatProviderAdapter: () => ({
      kind: 'development',
      async runChat() {
        providerCalled = true;
        throw new Error('provider should not run');
      },
    }),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'chat',
        prompt: 'hello',
        modelId: 'seed-model-pro',
        input: {},
      }),
    /Model entitlement is required/,
  );

  assert.equal(providerCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('createAndRunAgentRun does not call provider when credits are insufficient', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveChatModelForUser: async () => resolvedChatModel(),
    assertCanAffordMinimum: async () => {
      throw new Error('Insufficient credits.');
    },
    createChatProviderAdapter: () => ({
      kind: 'development',
      async runChat() {
        providerCalled = true;
        throw new Error('provider should not run');
      },
    }),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'chat',
        prompt: 'hello',
        modelId: 'seed-model-free',
        input: {},
      }),
    /Insufficient credits/,
  );

  assert.equal(providerCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});
