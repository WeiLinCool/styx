import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryAgentRunRepository,
  type AgentRunEventInput,
  type AgentRunRepository,
} from '@/server/repositories/agent-runs';
import type { ResolvedChatModel } from '@/server/repositories/ai-models';
import type { AgentTaskType } from './types';
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

test('createAndRunAgentRun completes run with deterministic Pi adapter output', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '帮我设计一个石头印画作品',
    input: {},
  });

  assert.equal(run.status, 'succeeded');
  assert.match(run.finalMessage ?? '', /石头印画作品/);
  assert.equal(run.capabilitySummary.provider, 'pi');
  assert.equal(run.artifacts.length, 1);
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

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: 'hello',
    input: {},
  });

  assert.equal(run.status, 'failed');
  assert.equal(run.errorMessage, 'pi unavailable');
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

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: 'hello',
    input: {},
  });

  assert.equal(run.status, 'succeeded');
  assert.equal(run.errorMessage, null);
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

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: 'hello',
    input: callerInput,
  });

  assert.deepEqual(callerInput, { nested: { value: 'original' } });
  assert.equal(run.capabilitySummary.model, 'pi-default');
  assert.equal(run.capabilitySummary.capabilities[0].name, 'Pi 默认模型');
});

test('createAndRunAgentRun returns failed unconfigured run when no default bundle exists', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'unsupported' as AgentTaskType,
    prompt: 'hello',
    input: {},
  });

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

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
    input: {},
  });

  assert.equal(run.status, 'succeeded');
  assert.equal(run.finalMessage, 'provider response');
  assert.deepEqual(run.usage, { promptTokens: 10, completionTokens: 20, totalTokens: 30 });
  assert.equal(run.selectedModel?.code, 'dev-free-chat');
  assert.equal(run.billing?.status, 'billed');
  assert.equal(run.billing?.creditCost, 1);
  assert.equal(run.billing?.ledgerEntryId, 'ledger-1');
  assert.equal(debits.length, 1);
  assert.equal(debits[0].modelCode, 'dev-free-chat');
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

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
    input: {},
  });

  assert.equal(run.status, 'failed');
  assert.equal(run.finalMessage, 'provider response before billing failed');
  assert.deepEqual(run.usage, { promptTokens: 11, completionTokens: 22, totalTokens: 33 });
  assert.equal(run.selectedModel?.code, 'dev-free-chat');
  assert.equal(run.billing?.status, 'failed');
  assert.equal(run.billing?.creditCost, 1);
  assert.equal(run.billing?.ledgerEntryId, null);
  assert.equal(run.artifacts.length, 1);
  assert.equal(run.artifacts[0].body, 'provider response before billing failed');
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

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
    input: {},
  });

  assert.equal(run.status, 'failed');
  assert.equal(run.usage, null);
  assert.equal(run.selectedModel?.code, 'dev-free-chat');
  assert.equal(run.billing?.status, 'failed');
  assert.equal(run.billing?.creditCost, null);
  assert.equal(run.billing?.ledgerEntryId, null);
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
