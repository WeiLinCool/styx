import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryAgentRunRepository,
  type AgentRunEventInput,
  type AgentRunRepository,
} from '@/server/repositories/agent-runs';
import {
  ModelEntitlementRequiredError,
  ModelNotAvailableError,
  type ResolvedChatModel,
  type ResolvedImageModel,
} from '@/server/repositories/ai-models';
import type { AgentTaskType } from './types';
import type { ChatProviderMessage } from '@/server/ai/provider-adapters';
import { ProviderRequestError } from '@/server/ai/provider-adapters';
import { calculateImageCreditCost, InsufficientCreditsError } from '@/server/billing/credits';
import { createDeterministicPiRuntime } from './pi-runtime';
import {
  AgentRunImageSourceRequiredError,
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

function resolvedImageModel(overrides: Partial<ResolvedImageModel> = {}): ResolvedImageModel {
  return {
    ...resolvedChatModel({
      id: 'seed-model-free-image',
      code: 'dev-free-image',
      name: 'Development Free Image',
      model: 'development-free-image',
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 1,
        completionCreditsPer1k: 0,
        minimumCredits: 1,
      },
    }),
    supportedModes: ['generate', 'edit'],
    ...overrides,
  };
}

test('createAndRunAgentRun rejects image without modelId before legacy runtime fallback', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'image',
        prompt: '帮我设计一个石头印画作品',
        input: {},
      }),
    AgentRunModelRequiredError,
  );

  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('createAndRunAgentRun returns transient image artifact while persisting only summary data', async () => {
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
    taskType: 'workflow',
    prompt: '一只戴红围巾的小猫石头印画',
    input: { mode: 'generate', size: '1:1' },
  });

  assert.equal(result.run.status, 'succeeded');
  assert.equal(result.run.artifacts.length, 1);
  assert.equal(result.run.artifacts[0]?.kind, 'image');
  assert.equal(result.run.artifacts[0]?.body, null);
  assert.equal(result.run.artifacts[0]?.url, null);
  assert.equal(result.run.artifacts[0]?.metadata.transient, true);
  assert.equal(result.run.artifacts[0]?.metadata.mimeType, 'image/png');
  assert.equal(result.transientArtifacts.length, 1);
  assert.equal(result.transientArtifacts[0]?.kind, 'image');
  assert.equal(result.transientArtifacts[0]?.dataUrl, 'data:image/png;base64,SHOULD_NOT_PERSIST');
  assert.equal(result.transientArtifacts[0]?.metadata.transient, true);

  const stored = await repository.getRunForUser(result.run.id, 'user-1');
  assert.equal(stored?.artifacts[0]?.body, null);
  assert.equal(stored?.artifacts[0]?.url, null);
});

test('createAndRunAgentRun returns transient image artifact from provider URL output', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        return {
          finalMessage: 'Generated 1 image.',
          artifacts: [
            {
              kind: 'image',
              title: 'Generated image',
              url: 'https://provider.example/generated.png',
              metadata: {
                mimeType: 'image/png',
              },
            },
          ],
        };
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
    prompt: '一张石印风格插画',
    input: { mode: 'generate', size: '1:1' },
  });

  assert.equal(result.run.status, 'succeeded');
  assert.equal(result.transientArtifacts.length, 1);
  assert.equal(result.transientArtifacts[0]?.dataUrl, 'https://provider.example/generated.png');
  assert.equal(result.run.artifacts[0]?.url, null);
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
    taskType: 'workflow',
    prompt: 'hello',
    input: {},
  });
  const run = result.run;

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

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
    prompt: 'hello',
    input: {},
  });
  const run = result.run;

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

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
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

test('calculateImageCreditCost uses pricing minimum', () => {
  assert.equal(
    calculateImageCreditCost({
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 99,
        completionCreditsPer1k: 99,
        minimumCredits: 5,
      },
    }),
    5,
  );
});

test('image run resolves selected model, returns transient image, persists no media, and bills minimum credits', async () => {
  const debits: Array<{ amount: number; metadata: Record<string, unknown> }> = [];
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async (_userId, modelId, mode) => {
      assert.equal(modelId, 'model-1');
      assert.equal(mode, 'generate');
      return resolvedImageModel({
        id: 'model-1',
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 99,
          completionCreditsPer1k: 99,
          minimumCredits: 7,
        },
      });
    },
    assertCanAffordMinimum: async (_userId, pricing) => {
      assert.equal(pricing.minimumCredits, 7);
    },
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage(request) {
        assert.equal(request.model.id, 'model-1');
        assert.equal(request.mode, 'generate');
        assert.equal(request.sourceImageDataUrl, undefined);
        return {
          finalMessage: '图片已生成',
          artifacts: [
            {
              kind: 'image',
              title: '生成图',
              body: 'data:image/png;base64,RESULT',
              url: null,
              metadata: { mimeType: 'image/png', filename: 'result.png' },
            },
          ],
          rawMetadata: { provider: 'test' },
        };
      },
    }),
    debitForImageAgentRun: async (input) => {
      debits.push({ amount: input.amount, metadata: input.metadata });
      return { entryId: 'ledger-1', balanceAfter: 100 };
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山水',
    modelId: 'model-1',
    input: { mode: 'generate', size: '1024x1024' },
  });

  assert.equal(result.run.status, 'succeeded');
  assert.equal(result.transientArtifacts[0]?.dataUrl, 'data:image/png;base64,RESULT');
  assert.equal(result.run.artifacts[0]?.body, null);
  assert.equal(result.run.artifacts[0]?.url, null);
  assert.equal(result.run.selectedModel?.code, 'dev-free-image');
  assert.equal(result.run.billing?.status, 'billed');
  assert.equal(result.run.billing?.creditCost, 7);
  assert.equal(result.run.billing?.ledgerEntryId, 'ledger-1');
  assert.equal(debits.length, 1);
  assert.equal(debits[0]?.amount, 7);

  const stored = await repository.getRunForUser(result.run.id, 'user-1');
  assert.equal(stored?.artifacts[0]?.body, null);
  assert.equal(stored?.artifacts[0]?.url, null);
});

test('image run rejects unsupported selected model before creating a run', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async (_userId, modelId, mode) => {
      assert.equal(modelId, 'model-upscale');
      assert.equal(mode, 'upscale');
      throw new ModelNotAvailableError();
    },
    assertCanAffordMinimum: async () => {
      throw new Error('credit preflight should not run');
    },
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        providerCalled = true;
        throw new Error('provider should not run');
      },
    }),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'image',
        prompt: '放大图片',
        modelId: 'model-upscale',
        input: {
          mode: 'upscale',
          sourceImageDataUrl: 'data:image/png;base64,SOURCE',
        },
      }),
    ModelNotAvailableError,
  );

  assert.equal(providerCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('image run rejects entitlement errors before creating a run or calling provider', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerCalled = false;
  let debitCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async (_userId, modelId, mode) => {
      assert.equal(modelId, 'model-pro-image');
      assert.equal(mode, 'generate');
      throw new ModelEntitlementRequiredError();
    },
    assertCanAffordMinimum: async () => {
      throw new Error('credit preflight should not run');
    },
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        providerCalled = true;
        throw new Error('provider should not run');
      },
    }),
    debitForImageAgentRun: async () => {
      debitCalled = true;
      throw new Error('debit should not run');
    },
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'image',
        prompt: '山水',
        modelId: 'model-pro-image',
        input: { mode: 'generate' },
      }),
    ModelEntitlementRequiredError,
  );

  assert.equal(providerCalled, false);
  assert.equal(debitCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('image run rejects insufficient credits before creating a run or calling provider', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerCalled = false;
  let debitCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () =>
      resolvedImageModel({
        id: 'model-expensive-image',
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 0,
          completionCreditsPer1k: 0,
          minimumCredits: 50,
        },
      }),
    assertCanAffordMinimum: async (_userId, pricing) => {
      assert.equal(pricing.minimumCredits, 50);
      throw new InsufficientCreditsError();
    },
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        providerCalled = true;
        throw new Error('provider should not run');
      },
    }),
    debitForImageAgentRun: async () => {
      debitCalled = true;
      throw new Error('debit should not run');
    },
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'image',
        prompt: '山水',
        modelId: 'model-expensive-image',
        input: { mode: 'generate' },
      }),
    InsufficientCreditsError,
  );

  assert.equal(providerCalled, false);
  assert.equal(debitCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('image run records failed billing metadata when provider fails after run creation', async () => {
  const repository = createMemoryAgentRunRepository();
  let debitCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () => resolvedImageModel({ id: 'model-provider-fails' }),
    assertCanAffordMinimum: async () => {},
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        throw new ProviderRequestError('image provider unavailable');
      },
    }),
    debitForImageAgentRun: async () => {
      debitCalled = true;
      throw new Error('debit should not run');
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山水',
    modelId: 'model-provider-fails',
    input: { mode: 'generate' },
  });

  assert.equal(result.run.status, 'failed');
  assert.equal(result.run.errorMessage, 'image provider unavailable');
  assert.equal(result.run.selectedModel?.code, 'dev-free-image');
  assert.equal(result.run.billing?.status, 'failed');
  assert.equal(result.run.billing?.creditCost, null);
  assert.equal(result.run.billing?.ledgerEntryId, null);
  assert.equal(debitCalled, false);

  const storedRuns = await repository.listRunsForUser('user-1');
  assert.equal(storedRuns.length, 1);
});

test('image run remains billed and succeeded when post-debit event persistence fails', async () => {
  const baseRepository = createMemoryAgentRunRepository();
  const repository: AgentRunRepository = {
    ...baseRepository,
    async appendRunEvent(runId, input) {
      if (input.eventType === 'billing_recorded') {
        throw new Error('event store unavailable after debit');
      }
      return baseRepository.appendRunEvent(runId, input);
    },
  };
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () =>
      resolvedImageModel({
        id: 'model-billed-image',
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 0,
          completionCreditsPer1k: 0,
          minimumCredits: 9,
        },
      }),
    assertCanAffordMinimum: async () => {},
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        return {
          finalMessage: '图片已生成',
          artifacts: [
            {
              kind: 'image',
              title: '生成图',
              body: 'data:image/png;base64,RESULT',
              metadata: { mimeType: 'image/png' },
            },
          ],
          rawMetadata: { provider: 'test' },
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-after-debit', balanceAfter: 91 }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山水',
    modelId: 'model-billed-image',
    input: { mode: 'generate' },
  });

  assert.equal(result.run.status, 'succeeded');
  assert.equal(result.run.billing?.status, 'billed');
  assert.equal(result.run.billing?.creditCost, 9);
  assert.equal(result.run.billing?.ledgerEntryId, 'ledger-after-debit');
  assert.equal(result.transientArtifacts[0]?.dataUrl, 'data:image/png;base64,RESULT');
});

test('image run rejects upscale without source image before model resolution or run creation', async () => {
  const repository = createMemoryAgentRunRepository();
  let resolverCalled = false;
  let providerCalled = false;
  let debitCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () => {
      resolverCalled = true;
      throw new Error('model resolution should not run');
    },
    assertCanAffordMinimum: async () => {
      throw new Error('credit preflight should not run');
    },
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        providerCalled = true;
        throw new Error('provider should not run');
      },
    }),
    debitForImageAgentRun: async () => {
      debitCalled = true;
      throw new Error('debit should not run');
    },
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'image',
        prompt: '放大图片',
        modelId: 'model-upscale',
        input: { mode: 'upscale' },
      }),
    AgentRunImageSourceRequiredError,
  );

  assert.equal(resolverCalled, false);
  assert.equal(providerCalled, false);
  assert.equal(debitCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('image run rejects malformed source image before model resolution or run creation', async () => {
  const repository = createMemoryAgentRunRepository();
  let resolverCalled = false;
  let providerCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () => {
      resolverCalled = true;
      throw new Error('model resolution should not run');
    },
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        providerCalled = true;
        throw new Error('provider should not run');
      },
    }),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'image',
        prompt: '编辑图片',
        modelId: 'model-edit',
        input: {
          mode: 'edit',
          sourceImageDataUrl: 'data:text/plain;base64,NOT_IMAGE',
        },
      }),
    AgentRunImageSourceRequiredError,
  );

  assert.equal(resolverCalled, false);
  assert.equal(providerCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('image run strips source image data URL from durable input before provider execution', async () => {
  const durableInputs: Record<string, unknown>[] = [];
  const baseRepository = createMemoryAgentRunRepository();
  const repository: AgentRunRepository = {
    ...baseRepository,
    async createRun(input) {
      durableInputs.push(structuredClone(input.input));
      return baseRepository.createRun(input);
    },
    async completeRun(runId, input) {
      if (input.input) {
        durableInputs.push(structuredClone(input.input));
      }
      return baseRepository.completeRun(runId, input);
    },
    async failRun(runId, input) {
      if (typeof input !== 'string' && input.input) {
        durableInputs.push(structuredClone(input.input));
      }
      return baseRepository.failRun(runId, input);
    },
  };
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () =>
      resolvedImageModel({ id: 'model-edit', supportedModes: ['generate', 'edit'] }),
    assertCanAffordMinimum: async () => {},
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage(request) {
        assert.equal(request.sourceImageDataUrl, 'data:image/png;base64,SOURCE');
        return {
          finalMessage: '图片已编辑',
          artifacts: [
            {
              kind: 'image',
              title: '编辑图',
              body: 'data:image/png;base64,RESULT',
              metadata: { mimeType: 'image/png' },
            },
          ],
          rawMetadata: {},
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-1', balanceAfter: 100 }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '水墨风',
    modelId: 'model-edit',
    input: {
      mode: 'edit',
      size: '1024x1024',
      sourceImageDataUrl: 'data:image/png;base64,SOURCE',
    },
  });

  assert.equal(result.run.status, 'succeeded');
  assert.equal(JSON.stringify(durableInputs).includes('sourceImageDataUrl'), false);
  assert.equal(JSON.stringify(durableInputs).includes('data:image/png;base64,SOURCE'), false);
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
