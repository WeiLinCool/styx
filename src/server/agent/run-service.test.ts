import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryAgentRunRepository,
  type AgentRunEventInput,
  type AgentRunRepository,
} from '@/server/repositories/agent-runs';
import { createMemoryGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';
import { createMemoryAgentConversationRepository } from '@/server/repositories/agent-conversations';
import {
  ModelEntitlementRequiredError,
  ModelNotAvailableError,
  type ResolvedChatModel,
  type ResolvedImageModel,
  type ResolvedVideoModel,
} from '@/server/repositories/ai-models';
import type {
  AgentCapabilitySnapshot,
  DirectMediaArtifactCompletedPayload,
  AgentTaskType,
} from './types';
import type { ChatProviderMessage } from '@/server/ai/provider-adapters';
import { ProviderConfigurationError, ProviderRequestError } from '@/server/ai/provider-adapters';
import type { VideoProviderCreateRequest } from '@/server/ai/video-provider-adapters';
import { calculateImageCreditCost, InsufficientCreditsError } from '@/server/billing/credits';
import { createDeterministicPiRuntime } from './pi-runtime';
import {
  AgentRunImageSourceRequiredError,
  AgentRunImageSizeInvalidError,
  AgentRunModelRequiredError,
  AgentRunVideoMaterialError,
  AgentRunVideoSelectionError,
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
    executionProtocol: 'chat_openai_compatible',
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

function resolvedVideoModel(overrides: Partial<ResolvedVideoModel> = {}): ResolvedVideoModel {
  return {
    ...resolvedChatModel({
      id: 'seed-model-free-video',
      code: 'dev-free-video',
      name: 'Development Free Video',
      model: 'development-free-video',
      executionProtocol: 'video_task_polling',
      providerType: 'openai_compatible',
      providerCode: 'doubao',
      providerName: 'Doubao',
      baseUrl: 'https://ark.example/api/v3/',
      credentialEnvKey: 'DOUBAO_KEY',
      pricing: {
        unit: 'token',
        promptCreditsPer1k: 0,
        completionCreditsPer1k: 1,
        minimumCredits: 3,
      },
    }),
    supportsVideoGeneration: true,
    ...overrides,
  };
}

function directMediaPayload(payload: Record<string, unknown>): DirectMediaArtifactCompletedPayload {
  return payload as DirectMediaArtifactCompletedPayload;
}

function enabledVideoPolicy() {
  return {
    enabled: true,
    upgradeRequired: false,
    message: null,
    styles: [
      {
        id: 'style-stone',
        code: 'stone',
        name: 'Stone',
        prompt: 'Stone video',
        enabled: true,
        sortOrder: 1,
      },
    ],
    durations: [5, 10],
    resolutions: [{ value: '720p', label: '720P' }],
    defaults: { styleCode: 'stone', durationSeconds: 5, resolution: '720p' },
  };
}

function storyboardCapabilitySnapshot(): AgentCapabilitySnapshot {
  return {
    bundleId: 'workflow-bundle-1',
    bundleCode: 'workflow-default',
    provider: 'pi',
    model: 'pi-default',
    capabilities: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'model',
        code: 'pi-default',
        name: 'Pi 默认模型',
        config: { provider: 'pi', model: 'pi-default' },
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        kind: 'skill',
        code: 'workflow-storyboard-template',
        name: '工作流分镜模板',
        config: {
          promptText: [
            '任务：以管理员上传的 12 宫格教程底图为主图/底图。',
            '尺寸={{template_width}}x{{template_height}}',
            '布局={{template_columns}}x{{template_rows}}',
            '来源={{source_image_origin}}',
            '模型={{selected_image_model_id}}',
            '{{workflow_prompt}}',
          ].join('\n'),
          templateAsset: {
            storageProvider: 'tencent_cos',
            bucket: 'bucket-a',
            region: 'ap-shanghai',
            objectKey: 'admin-config/storyboard/template.png',
            mimeType: 'image/png',
            byteSize: 1024,
            width: 1086,
            height: 1448,
            originalFilename: 'template.png',
            uploadedAt: '2026-06-09T10:00:00.000Z',
          },
          layout: {
            width: 1086,
            height: 1448,
            columns: 4,
            rows: 3,
          },
          updatedAt: '2026-06-09T10:00:00.000Z',
          updatedByUserId: 'admin-1',
        },
      },
    ],
  };
}

function workflowVideoCapabilitySnapshot(options?: {
  modelBinding?: {
    providerCode: 'doubao';
    model: string;
    executionProtocol: 'video_task_polling';
  };
}): AgentCapabilitySnapshot {
  return {
    bundleId: 'workflow-bundle-1',
    bundleCode: 'workflow-default',
    provider: 'pi',
    model: 'pi-default',
    capabilities: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        kind: 'skill',
        code: 'workflow-video-mvp',
        name: '工作流视频生成',
        config: {
          description: '工作流视频',
          inputSchema: {
            requiredMaterials: ['source_image', 'storyboard_image', 'scene_background'],
            requiredSnapshots: ['storyboard_prompt_map'],
          },
          promptTemplate: [
            '生成工作流视频：{{workflow_prompt}}',
            '原图={{source_image_url}}',
            '分镜={{storyboard_image_url}}',
            '场景={{scene_background_url}}',
            '地图={{storyboard_prompt_map}}',
            '规格={{duration_seconds}}/{{resolution}}',
          ].join('\n'),
          modelBinding: {
            providerCode: 'doubao',
            model: 'doubao-seedance-2-0',
            executionProtocol: 'video_task_polling',
            ...options?.modelBinding,
          },
          defaults: { durationSeconds: 5, resolution: '720p' },
          sceneBackgrounds: [
            {
              id: 'wood-table-handmade-1',
              name: '原木桌手作风 1',
              styleName: '原木桌手作风',
              publicUrl: '/workflow-backgrounds/1原木桌手作风/1.png',
              enabled: true,
              sortOrder: 100,
            },
            {
              id: 'disabled-background-1',
              name: '停用背景',
              styleName: '停用背景',
              publicUrl: '/workflow-backgrounds/disabled.png',
              enabled: false,
              sortOrder: 999,
            },
          ],
          updatedAt: '2026-06-09T10:00:00.000Z',
          updatedByUserId: 'admin-1',
        },
      },
    ],
  };
}

async function createImageAsset(
  repository: ReturnType<typeof createMemoryGeneratedMediaAssetRepository>,
  input: { userId?: string; objectKey: string; title?: string },
) {
  return repository.createSavedAsset({
    userId: input.userId ?? 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'image',
    title: input.title ?? 'image',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    storageProvider: 'tencent_cos',
    bucket: 'bucket',
    region: 'ap-shanghai',
    objectKey: input.objectKey,
    mimeType: 'image/png',
    byteSize: 10,
  });
}

function testGeneratedMediaCache() {
  const calls: Array<{
    userId: string;
    runId: string;
    artifactId: string;
    kind: 'image' | 'video';
    sourceUrl?: string;
    dataUrl?: string;
    mimeType?: string;
    metadata?: Record<string, unknown>;
  }> = [];
  return {
    calls,
    async cacheGeneratedMedia(input: {
      userId: string;
      runId: string;
      artifactId: string;
      kind: 'image' | 'video';
      sourceUrl?: string;
      dataUrl?: string;
      mimeType?: string;
      metadata?: Record<string, unknown>;
    }) {
      calls.push(input);
      assert.equal(input.userId, 'user-1');
      assert.ok(input.sourceUrl || input.dataUrl);
      const mimeType =
        input.mimeType ??
        (typeof input.metadata?.mimeType === 'string' ? input.metadata.mimeType : null) ??
        (input.kind === 'video' ? 'video/mp4' : 'image/png');
      return {
        storageProvider: 'tencent_cos' as const,
        bucket: 'cache-bucket',
        region: 'ap-shanghai',
        objectKey: `cache/${input.runId}/${input.artifactId}`,
        mimeType,
        byteSize: 6,
        width: input.kind === 'image' ? 1024 : null,
        height: input.kind === 'image' ? 1024 : null,
        durationSeconds: input.kind === 'video' ? 5 : null,
        expiresAt: '2026-06-13T00:00:00.000Z',
        metadata: input.metadata ?? {},
      };
    },
  };
}

function failingGeneratedMediaCache(message = 'cache upload failed') {
  return {
    async cacheGeneratedMedia() {
      throw new Error(message);
    },
  };
}

async function waitForRunStatus(
  repository: AgentRunRepository,
  runId: string,
  userId: string,
  status: 'succeeded' | 'failed',
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const run = await repository.getRunForUser(runId, userId);
    if (run?.status === status) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return repository.getRunForUser(runId, userId);
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
    taskType: 'workflow',
    prompt: '一只戴红围巾的小猫石头印画',
    input: { mode: 'generate', size: '1:1' },
  });

  assert.equal(result.run.status, 'running');
  assert.deepEqual(result.transientArtifacts, []);

  const stored = await waitForRunStatus(repository, result.run.id, 'user-1', 'succeeded');
  const events = await repository.listRunEvents(result.run.id);
  assert.equal(stored?.status, 'succeeded');
  assert.equal(stored?.artifacts.length, 1);
  assert.equal(stored?.artifacts[0]?.kind, 'image');
  assert.equal(stored?.artifacts[0]?.body, null);
  assert.equal(stored?.artifacts[0]?.url, null);
  assert.equal(stored?.artifacts[0]?.metadata.mimeType, 'image/png');
  assert.equal(stored?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
  assert.equal(stored?.artifacts[0]?.metadata.sourceUrl, 'https://provider.example/generated.png');
  assert.deepEqual(events.map((event) => event.eventType), [
    'artifact_started',
    'artifact_completed',
    'run_completed',
  ]);
});

test('createAndRunAgentRun returns running image run and streams direct media completion', async () => {
  const repository = createMemoryAgentRunRepository();
  let unblockProvider = () => {};
  const providerStarted = new Promise<void>((resolve) => {
    unblockProvider = resolve;
  });
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () => resolvedImageModel({ id: 'model-image' }),
    assertCanAffordMinimum: async () => {},
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        await providerStarted;
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
          rawMetadata: {},
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-image', balanceAfter: 90 }),
    generatedMediaCache: testGeneratedMediaCache(),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山谷里的石头印画',
    modelId: 'model-image',
    input: { mode: 'generate', size: '1:1' },
  });

  assert.equal(result.run.status, 'running');
  assert.deepEqual(result.transientArtifacts, []);

  unblockProvider();
  const completed = await waitForRunStatus(repository, result.run.id, 'user-1', 'succeeded');

  const events = await repository.listRunEvents(result.run.id);

  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.artifacts[0]?.body, null);
  assert.equal(completed?.artifacts[0]?.url, null);
  assert.equal(completed?.artifacts[0]?.metadata.storageStatus, 'cached');
  assert.equal(completed?.artifacts[0]?.metadata.cacheStatus, 'available');
  assert.equal(completed?.artifacts[0]?.metadata.cacheObjectKey, `cache/${result.run.id}/${result.run.id}-1`);
  assert.equal(completed?.artifacts[0]?.metadata.saveStatus, 'not_saved');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['artifact_started', 'billing_recorded', 'artifact_completed', 'run_completed'],
  );
  assert.equal(directMediaPayload(events[2]?.payload ?? {}).artifact.kind, 'image');
  assert.equal(directMediaPayload(events[2]?.payload ?? {}).artifact.delivery.url, 'data:image/png;base64,abc');
  assert.equal(typeof directMediaPayload(events[2]?.payload ?? {}).artifact.metadata.artifactId, 'string');
});

test('workflow storyboard uses selected image edit model and uploaded pattern source', async () => {
  const repository = createMemoryAgentRunRepository();
  const providerRequests: Array<{
    mode: string;
    prompt: string;
    size: string | undefined;
    sourceImageDataUrl: string | undefined;
    additionalImageDataUrls: string[] | undefined;
  }> = [];
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        throw new Error('workflow storyboard should use the selected image provider');
      },
    },
    resolveImageModelForUser: async (_userId, modelId, mode) => {
      assert.equal(modelId, 'model-storyboard');
      assert.equal(mode, 'edit');
      return resolvedImageModel({
        id: 'model-storyboard',
        code: 'gpt-image-2',
        name: 'GPT Image 2',
        providerCode: 'openai',
        providerName: 'OpenAI',
        model: 'gpt-image-2',
        supportedModes: ['generate', 'edit'],
      });
    },
    assertCanAffordMinimum: async () => {},
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage(request) {
        providerRequests.push({
          mode: request.mode,
          prompt: request.prompt,
          size: request.size,
          sourceImageDataUrl: request.sourceImageDataUrl,
          additionalImageDataUrls: request.additionalImageDataUrls,
        });
        return {
          finalMessage: '12宫格分镜图已生成',
          artifacts: [
            {
              kind: 'image',
              title: '12宫格分镜图',
              body: 'data:image/png;base64,RESULT',
              metadata: { mimeType: 'image/png', width: 1086, height: 1448 },
            },
          ],
          rawMetadata: { provider: 'test' },
        };
      },
    }),
    debitForImageAgentRun: async (input) => {
      assert.equal(input.modelSnapshot.id, 'model-storyboard');
      assert.equal(input.metadata.mode, 'edit');
      return { entryId: 'ledger-storyboard', balanceAfter: 90 };
    },
    resolveWorkflowCapabilityBundle: async () => storyboardCapabilitySnapshot(),
    readStoryboardTemplateDataUrl: async () => 'data:image/png;base64,TEMPLATE',
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
    prompt: '以图一为主图/底图',
    input: {
      stage: 'storyboard',
      selectedImageModelId: 'model-storyboard',
      sourceImageOrigin: 'manual',
      sourceImageDataUrl: 'data:image/png;base64,SOURCE',
    },
  });

  assert.equal(result.run.status, 'running');
  const completed = await waitForRunStatus(repository, result.run.id, 'user-1', 'succeeded');
  const detail = await repository.getRunDetailForUser(result.run.id, 'user-1');
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(completed?.status, 'succeeded');
  assert.equal(providerRequests.length, 1);
  assert.equal(providerRequests[0]?.mode, 'edit');
  assert.equal(providerRequests[0]?.size, '1086x1448');
  assert.equal(providerRequests[0]?.sourceImageDataUrl, 'data:image/png;base64,SOURCE');
  assert.deepEqual(providerRequests[0]?.additionalImageDataUrls, ['data:image/png;base64,TEMPLATE']);
  assert.match(providerRequests[0]?.prompt ?? '', /1086x1448/);
  assert.match(providerRequests[0]?.prompt ?? '', /布局=4x3/);
  assert.match(providerRequests[0]?.prompt ?? '', /来源=manual/);
  assert.equal(JSON.stringify(detail?.internal?.input ?? {}).includes('sourceImageDataUrl'), false);
  assert.equal(completed?.selectedModel?.code, 'gpt-image-2');
  assert.equal(completed?.billing?.status, 'billed');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['artifact_started', 'billing_recorded', 'artifact_completed', 'run_completed'],
  );
});

test('workflow storyboard fails closed for providers without storyboard template multi-image support', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        throw new Error('workflow storyboard should use the selected image provider');
      },
    },
    resolveImageModelForUser: async (_userId, modelId, mode) => {
      assert.equal(modelId, 'model-storyboard-doubao');
      assert.equal(mode, 'edit');
      return resolvedImageModel({
        id: 'model-storyboard-doubao',
        code: 'seededit-3-0-i2i',
        name: 'Doubao SeedEdit',
        providerCode: 'ark',
        providerName: 'Doubao',
        providerType: 'openai_compatible',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3/',
        credentialEnvKey: 'DOUBAO_KEY',
        model: 'seededit-3-0-i2i',
        supportedModes: ['generate', 'edit'],
      });
    },
    assertCanAffordMinimum: async () => {},
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        providerCalled = true;
        return {
          finalMessage: '12宫格分镜图已生成',
          artifacts: [
            {
              kind: 'image',
              title: '12宫格分镜图',
              body: 'data:image/png;base64,RESULT',
              metadata: { mimeType: 'image/png', width: 2048, height: 2048 },
            },
          ],
          rawMetadata: { provider: 'doubao' },
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-storyboard-doubao', balanceAfter: 88 }),
    resolveWorkflowCapabilityBundle: async () => storyboardCapabilitySnapshot(),
    readStoryboardTemplateDataUrl: async () => 'data:image/png;base64,TEMPLATE',
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'workflow',
        prompt: '以图一为主图/底图',
        input: {
          stage: 'storyboard',
          selectedImageModelId: 'model-storyboard-doubao',
          sourceImageOrigin: 'manual',
          sourceImageDataUrl: 'data:image/png;base64,SOURCE',
        },
      }),
    /支持多图编辑的 OpenAI 图片模型/,
  );

  assert.equal(providerCalled, false);
});

test('createAndRunAgentRun keeps image run succeeded when cache upload fails', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () => resolvedImageModel({ id: 'model-image' }),
    assertCanAffordMinimum: async () => {},
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
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
          rawMetadata: {},
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-image', balanceAfter: 90 }),
    generatedMediaCache: failingGeneratedMediaCache('cos unavailable'),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山谷里的石头印画',
    modelId: 'model-image',
    input: { mode: 'generate', size: '1:1' },
  });

  assert.equal(result.run.status, 'running');
  const completed = await waitForRunStatus(repository, result.run.id, 'user-1', 'succeeded');
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
  assert.equal(completed?.artifacts[0]?.metadata.cacheStatus, 'cache_failed');
  assert.equal(completed?.artifacts[0]?.metadata.cacheError, 'cos unavailable');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['artifact_started', 'billing_recorded', 'artifact_completed', 'run_completed'],
  );
});

test('createAndRunAgentRun returns running video run and streams provider URL completion', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask() {
        return {
          providerTaskId: 'task-1',
          rawMetadata: { created: true },
        };
      },
      async getVideoTask() {
        return {
          providerTaskId: 'task-1',
          status: 'succeeded',
          outputUrl: 'https://provider.example/video.mp4',
          rawMetadata: {
            usage: { output_seconds: 5 },
            providerExpiresAt: '2026-06-01T10:00:00.000Z',
          },
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-video', balanceAfter: 88 }),
    generatedMediaCache: testGeneratedMediaCache(),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: '石头印画动起来',
    modelId: 'model-video',
    input: { durationSeconds: 5, resolution: '720p', styleCode: 'stone' },
  });

  assert.equal(result.run.status, 'running');
  const pending = await repository.getRunDetailForUser(result.run.id, 'user-1');
  assert.equal(
    (pending?.internal?.capabilitySnapshot as Record<string, unknown>)?.providerTaskId,
    'task-1',
  );

  const completed = await service.syncVideoAgentRunForUser('user-1', result.run.id);
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.artifacts[0]?.metadata.storageStatus, 'cached');
  assert.equal(completed.artifacts[0]?.metadata.cacheStatus, 'available');
  assert.equal(completed.artifacts[0]?.metadata.cacheObjectKey, 'cache/' + result.run.id + '/task-1');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['artifact_started', 'billing_recorded', 'artifact_completed', 'run_completed'],
  );
  assert.equal(directMediaPayload(events[2]?.payload ?? {}).artifact.kind, 'video');
  assert.equal(directMediaPayload(events[2]?.payload ?? {}).artifact.delivery.mode, 'provider_url');
  assert.equal(
    directMediaPayload(events[2]?.payload ?? {}).artifact.delivery.url,
    'https://provider.example/video.mp4',
  );
  assert.equal(typeof directMediaPayload(events[2]?.payload ?? {}).artifact.metadata.artifactId, 'string');
});

test('video run marks created run failed when provider task creation fails', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask() {
        throw new ProviderRequestError('provider rejected task');
      },
      async getVideoTask() {
        throw new Error('should not sync without provider task');
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-video', balanceAfter: 88 }),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'video',
        prompt: '石头印画动起来',
        modelId: 'model-video',
        input: { durationSeconds: 5, resolution: '720p', styleCode: 'stone' },
      }),
    ProviderRequestError,
  );

  const runs = await repository.listRunsForUser('user-1');
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.status, 'failed');
  assert.equal(runs[0]?.errorMessage, 'provider rejected task');

  const events = await repository.listRunEvents(runs[0]?.id ?? '');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['run_failed'],
  );
  assert.equal(events[0]?.payload.message, 'provider rejected task');
});

test('video run stores canonical input and passes signed material URLs to adapter', async () => {
  const repository = createMemoryAgentRunRepository();
  const assetRepository = createMemoryGeneratedMediaAssetRepository();
  const imageAsset = await assetRepository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'image',
    title: 'image',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    storageProvider: 'tencent_cos',
    bucket: 'bucket',
    region: 'ap-shanghai',
    objectKey: 'materials/image.png',
    mimeType: 'image/png',
    byteSize: 10,
  });
  const audioAsset = await assetRepository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'audio',
    title: 'audio',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    storageProvider: 'tencent_cos',
    bucket: 'bucket',
    region: 'ap-shanghai',
    objectKey: 'materials/audio.mp3',
    mimeType: 'audio/mpeg',
    byteSize: 10,
  });
  let captureProviderRequest: (request: VideoProviderCreateRequest) => void = () => {};
  const providerRequestPromise = new Promise<VideoProviderCreateRequest>((resolve) => {
    captureProviderRequest = resolve;
  });
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    mediaAssetRepository: assetRepository,
    signVideoMaterialUrl: async (asset) => `https://signed.example/${asset.objectKey}`,
    generatedMediaCache: testGeneratedMediaCache(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask(request) {
        captureProviderRequest(request);
        return { providerTaskId: 'task-materials', rawMetadata: {} };
      },
      async getVideoTask() {
        return {
          providerTaskId: 'task-materials',
          status: 'running',
          rawMetadata: {},
        };
      },
    }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: '石头印画动起来',
    modelId: 'model-video',
    input: {
      durationSeconds: 5,
      resolution: '720p',
      styleCode: 'stone',
      imageAssetId: imageAsset.id,
      audioAssetId: audioAsset.id,
    },
  });

  const detail = await repository.getRunDetailForUser(result.run.id, 'user-1');
  const providerRequest = await providerRequestPromise;

  assert.equal(providerRequest.duration, 5);
  assert.equal(providerRequest.resolution, '720p');
  assert.equal(providerRequest.imageUrl, 'https://signed.example/materials/image.png');
  assert.equal(providerRequest.audioUrl, 'https://signed.example/materials/audio.mp3');
  assert.equal(detail?.internal?.input?.durationSeconds, 5);
  assert.equal(detail?.internal?.input?.resolution, '720p');
  assert.equal(detail?.internal?.input?.styleCode, 'stone');
  assert.equal(detail?.internal?.input?.imageAssetId, imageAsset.id);
  assert.equal(detail?.internal?.input?.audioAssetId, audioAsset.id);
  assert.equal(detail?.internal?.input?.imageUrl, undefined);
  assert.equal(detail?.internal?.input?.audioUrl, undefined);
});

test('video run rejects policy validation failure before creating a run', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => {
      throw new Error('provider should not be created');
    },
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'video',
        prompt: '石头印画动起来',
        modelId: 'model-video',
        input: {
          durationSeconds: 30,
          resolution: '720p',
          styleCode: 'stone',
        },
      }),
    AgentRunVideoSelectionError,
  );

  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('video run rejects missing material before creating a run', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    mediaAssetRepository: createMemoryGeneratedMediaAssetRepository(),
    assertCanAffordMinimum: async () => {},
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'video',
        prompt: '石头印画动起来',
        modelId: 'model-video',
        input: {
          durationSeconds: 5,
          resolution: '720p',
          styleCode: 'stone',
          imageAssetId: '11111111-1111-4111-8111-111111111111',
        },
      }),
    AgentRunVideoMaterialError,
  );

  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('video run maps default material signer configuration failure before creating a run', async () => {
  const repository = createMemoryAgentRunRepository();
  const assetRepository = createMemoryGeneratedMediaAssetRepository();
  const imageAsset = await assetRepository.createSavedAsset({
    userId: 'user-1',
    runId: null,
    conversationId: null,
    artifactId: null,
    kind: 'image',
    title: 'image',
    sourceType: 'user_uploaded',
    sourceProvider: null,
    sourceModel: null,
    storageProvider: 'tencent_cos',
    bucket: 'bucket',
    region: 'ap-shanghai',
    objectKey: 'materials/image.png',
    mimeType: 'image/png',
    byteSize: 10,
  });
  const envKeys = [
    'TENCENT_COS_REGION',
    'TENCENT_COS_BUCKET',
    'TENCENT_COS_SECRET_ID',
    'TENCENT_COS_SECRET_KEY',
  ] as const;
  const previousEnv = new Map<string, string | undefined>();
  for (const key of envKeys) {
    previousEnv.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    const service = createAgentRunService({
      repository,
      runtime: createDeterministicPiRuntime(),
      resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
      resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
      mediaAssetRepository: assetRepository,
      assertCanAffordMinimum: async () => {},
      createVideoProviderAdapter: () => {
        throw new Error('provider should not be created');
      },
    });

    await assert.rejects(
      () =>
        service.createAndRunAgentRun({
          userId: 'user-1',
          taskType: 'video',
          prompt: '石头印画动起来',
          modelId: 'model-video',
          input: {
            durationSeconds: 5,
            resolution: '720p',
            styleCode: 'stone',
            imageAssetId: imageAsset.id,
          },
        }),
      ProviderConfigurationError,
    );

    assert.deepEqual(await repository.listRunsForUser('user-1'), []);
  } finally {
    for (const key of envKeys) {
      const value = previousEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('workflow video fails before provider task when scene background is missing', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () => workflowVideoCapabilitySnapshot(),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'workflow',
        prompt: '生成工作流视频',
        input: {
          stage: 'workflow_video',
          sourceImageAssetId: '11111111-1111-4111-8111-111111111111',
          storyboardArtifactId: '22222222-2222-4222-8222-222222222222',
          storyboardPromptMap: { shot1: '开场' },
        },
      }),
    /sceneBackgroundId/,
  );
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('workflow video creates doubao seedance video task with ordered materials', async () => {
  const repository = createMemoryAgentRunRepository();
  const assetRepository = createMemoryGeneratedMediaAssetRepository();
  const source = await createImageAsset(assetRepository, { objectKey: 'workflow/source.png' });
  const storyboard = await createImageAsset(assetRepository, { objectKey: 'workflow/storyboard.png' });
  const cache = testGeneratedMediaCache();
  const providerRequests: VideoProviderCreateRequest[] = [];
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () => workflowVideoCapabilitySnapshot(),
    resolveVideoModelForUser: async () =>
      resolvedVideoModel({ id: 'model-video', model: 'doubao-seedance-2-0' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    mediaAssetRepository: assetRepository,
    signVideoMaterialUrl: async (asset) => `https://signed.example/${asset.objectKey}`,
    generatedMediaCache: cache,
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask(request) {
        providerRequests.push(request);
        return { providerTaskId: 'task-workflow-video', rawMetadata: { id: 'task-workflow-video' } };
      },
      async getVideoTask() {
        return {
          providerTaskId: 'task-workflow-video',
          status: 'succeeded',
          outputUrl: 'https://provider.example/video.mp4',
          rawMetadata: {},
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-video', balanceAfter: 90 }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
    prompt: '生成工作流视频',
    input: {
      stage: 'workflow_video',
      modelId: 'model-video',
      sourceImageAssetId: source.id,
      storyboardArtifactId: storyboard.id,
      sceneBackgroundId: 'wood-table-handmade-1',
      origin: 'https://app.example',
      storyboardPromptMap: { shot1: '开场' },
      durationSeconds: 5,
      resolution: '720p',
    },
  });

  const detail = await repository.getRunDetailForUser(result.run.id, 'user-1');
  const providerRequest = providerRequests[0];

  assert.equal(result.run.status, 'running');
  assert.deepEqual(providerRequest?.imageUrls, [
    'https://signed.example/workflow/source.png',
    'https://signed.example/workflow/storyboard.png',
    `https://signed.example/cache/${result.run.id}/workflow-scene-background-wood-table-handmade-1`,
  ]);
  assert.equal(cache.calls[0]?.artifactId, 'workflow-scene-background-wood-table-handmade-1');
  assert.match(cache.calls[0]?.dataUrl ?? '', /^data:image\/png;base64,/);
  assert.match(providerRequest?.prompt ?? '', /生成工作流视频/);
  assert.match(providerRequest?.prompt ?? '', /"shot1":"开场"/);
  assert.equal(detail?.internal?.input?.stage, 'workflow_video');
  assert.equal(detail?.internal?.input?.providerTaskId, 'task-workflow-video');
});

test('workflow video uses configured capability-bound seedance model when request model differs', async () => {
  const repository = createMemoryAgentRunRepository();
  const assetRepository = createMemoryGeneratedMediaAssetRepository();
  const source = await createImageAsset(assetRepository, { objectKey: 'workflow/source.png' });
  const storyboard = await createImageAsset(assetRepository, { objectKey: 'workflow/storyboard.png' });
  const configuredModel = 'doubao-seedance-2-0-fast-260128';
  const requestedModelIds: string[] = [];
  const providerRequests: VideoProviderCreateRequest[] = [];
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () =>
      workflowVideoCapabilitySnapshot({
        modelBinding: {
          providerCode: 'doubao',
          model: configuredModel,
          executionProtocol: 'video_task_polling',
        },
      }),
    resolveVideoModelForUser: async (_userId, modelId) => {
      requestedModelIds.push(modelId);
      if (modelId === configuredModel) {
        return resolvedVideoModel({ id: 'seedance-model-id', model: configuredModel });
      }
      return resolvedVideoModel({ id: modelId, model: 'development-free-video' });
    },
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    mediaAssetRepository: assetRepository,
    signVideoMaterialUrl: async (asset) => `https://signed.example/${asset.objectKey}`,
    generatedMediaCache: testGeneratedMediaCache(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask(request) {
        providerRequests.push(request);
        return { providerTaskId: 'task-workflow-video', rawMetadata: { id: 'task-workflow-video' } };
      },
      async getVideoTask() {
        throw new Error('not used');
      },
    }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
    prompt: '生成工作流视频',
    input: {
      stage: 'workflow_video',
      modelId: 'development-video-id',
      sourceImageAssetId: source.id,
      storyboardArtifactId: storyboard.id,
      sceneBackgroundId: 'wood-table-handmade-1',
      origin: 'https://app.example',
      storyboardPromptMap: { shot1: '开场' },
      durationSeconds: 5,
      resolution: '720p',
    },
  });

  const detail = await repository.getRunDetailForUser(result.run.id, 'user-1');
  assert.equal(result.run.status, 'running');
  assert.deepEqual(requestedModelIds, [configuredModel]);
  assert.equal(providerRequests[0]?.model.model, configuredModel);
  assert.equal(detail?.internal?.input?.modelId, 'seedance-model-id');
});

test('workflow video accepts configured seedance model from enabled database provider code', async () => {
  const repository = createMemoryAgentRunRepository();
  const assetRepository = createMemoryGeneratedMediaAssetRepository();
  const source = await createImageAsset(assetRepository, { objectKey: 'workflow/source.png' });
  const storyboard = await createImageAsset(assetRepository, { objectKey: 'workflow/storyboard.png' });
  const configuredModel = 'doubao-seedance-2-0-fast-260128';
  const providerRequests: VideoProviderCreateRequest[] = [];
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () =>
      workflowVideoCapabilitySnapshot({
        modelBinding: {
          providerCode: 'doubao',
          model: configuredModel,
          executionProtocol: 'video_task_polling',
        },
      }),
    resolveVideoModelForUser: async () =>
      resolvedVideoModel({
        id: 'seedance-model-id',
        model: configuredModel,
        providerCode: 'ark',
    }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    mediaAssetRepository: assetRepository,
    signVideoMaterialUrl: async (asset) => `https://signed.example/${asset.objectKey}`,
    generatedMediaCache: testGeneratedMediaCache(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask(request) {
        providerRequests.push(request);
        return { providerTaskId: 'task-workflow-video', rawMetadata: { id: 'task-workflow-video' } };
      },
      async getVideoTask() {
        throw new Error('not used');
      },
    }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
    prompt: '生成工作流视频',
    input: {
      stage: 'workflow_video',
      modelId: 'development-video-id',
      sourceImageAssetId: source.id,
      storyboardArtifactId: storyboard.id,
      sceneBackgroundId: 'wood-table-handmade-1',
      origin: 'https://app.example',
      storyboardPromptMap: { shot1: '开场' },
      durationSeconds: 5,
      resolution: '720p',
    },
  });

  assert.equal(result.run.status, 'running');
  assert.equal(providerRequests[0]?.model.providerCode, 'ark');
  assert.equal(providerRequests[0]?.model.model, configuredModel);
});

test('workflow video marks run failed when scene background cache fails', async () => {
  const repository = createMemoryAgentRunRepository();
  const assetRepository = createMemoryGeneratedMediaAssetRepository();
  const source = await createImageAsset(assetRepository, { objectKey: 'workflow/source.png' });
  const storyboard = await createImageAsset(assetRepository, { objectKey: 'workflow/storyboard.png' });
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () => workflowVideoCapabilitySnapshot(),
    resolveVideoModelForUser: async () =>
      resolvedVideoModel({ id: 'model-video', model: 'doubao-seedance-2-0' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    mediaAssetRepository: assetRepository,
    signVideoMaterialUrl: async (asset) => `https://signed.example/${asset.objectKey}`,
    generatedMediaCache: failingGeneratedMediaCache('background cache unavailable'),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask() {
        throw new Error('provider should not be called');
      },
      async getVideoTask() {
        throw new Error('not used');
      },
    }),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'workflow',
        prompt: '生成工作流视频',
        input: {
          stage: 'workflow_video',
          modelId: 'model-video',
          sourceImageAssetId: source.id,
          storyboardArtifactId: storyboard.id,
          sceneBackgroundId: 'wood-table-handmade-1',
          origin: 'https://app.example',
          storyboardPromptMap: { shot1: '开场' },
          durationSeconds: 5,
          resolution: '720p',
        },
      }),
    /background cache unavailable/,
  );

  const runs = await repository.listRunsForUser('user-1');
  assert.equal(runs[0]?.status, 'failed');
});

test('workflow video sync records generated video billing and artifact', async () => {
  const repository = createMemoryAgentRunRepository();
  const assetRepository = createMemoryGeneratedMediaAssetRepository();
  const source = await createImageAsset(assetRepository, { objectKey: 'workflow/source.png' });
  const storyboard = await createImageAsset(assetRepository, { objectKey: 'workflow/storyboard.png' });
  const debits: Array<{ amount: number; runId: string }> = [];
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () => workflowVideoCapabilitySnapshot(),
    resolveVideoModelForUser: async () =>
      resolvedVideoModel({
        id: 'model-video',
        model: 'doubao-seedance-2-0',
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 0,
          completionCreditsPer1k: 1,
          minimumCredits: 6,
        },
      }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    mediaAssetRepository: assetRepository,
    signVideoMaterialUrl: async (asset) => `https://signed.example/${asset.objectKey}`,
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask() {
        return { providerTaskId: 'task-workflow-video', rawMetadata: { id: 'task-workflow-video' } };
      },
      async getVideoTask() {
        return {
          providerTaskId: 'task-workflow-video',
          status: 'succeeded',
          outputUrl: 'https://provider.example/workflow-video.mp4',
          rawMetadata: { usage: { output_seconds: 5 } },
        };
      },
    }),
    debitForImageAgentRun: async (input) => {
      debits.push({ amount: input.amount, runId: input.runId });
      return { entryId: 'ledger-workflow-video', balanceAfter: 84 };
    },
    generatedMediaCache: testGeneratedMediaCache(),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
    prompt: '生成工作流视频',
    input: {
      stage: 'workflow_video',
      modelId: 'model-video',
      sourceImageAssetId: source.id,
      storyboardArtifactId: storyboard.id,
      sceneBackgroundId: 'wood-table-handmade-1',
      origin: 'https://app.example',
      storyboardPromptMap: { shot1: '开场' },
      durationSeconds: 5,
      resolution: '720p',
    },
  });

  const completed = await service.syncVideoAgentRunForUser('user-1', result.run.id);
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(completed.taskType, 'workflow');
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.artifacts[0]?.kind, 'video');
  assert.equal(completed.billing?.status, 'billed');
  assert.equal(completed.billing?.creditCost, 6);
  assert.equal(completed.billing?.ledgerEntryId, 'ledger-workflow-video');
  assert.deepEqual(debits, [{ amount: 6, runId: result.run.id }]);
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['artifact_started', 'billing_recorded', 'artifact_completed', 'run_completed'],
  );
});

test('workflow video creation schedules backend sync so billing is not frontend-dependent', async () => {
  const repository = createMemoryAgentRunRepository();
  const assetRepository = createMemoryGeneratedMediaAssetRepository();
  const source = await createImageAsset(assetRepository, { objectKey: 'workflow/source.png' });
  const storyboard = await createImageAsset(assetRepository, { objectKey: 'workflow/storyboard.png' });
  const scheduledTasks: Array<{ runId: string; task: () => Promise<void> }> = [];
  const debits: Array<{ amount: number; runId: string }> = [];
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () => workflowVideoCapabilitySnapshot(),
    resolveVideoModelForUser: async () =>
      resolvedVideoModel({ id: 'model-video', model: 'doubao-seedance-2-0' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    mediaAssetRepository: assetRepository,
    signVideoMaterialUrl: async (asset) => `https://signed.example/${asset.objectKey}`,
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask() {
        return { providerTaskId: 'task-workflow-video', rawMetadata: { id: 'task-workflow-video' } };
      },
      async getVideoTask() {
        return {
          providerTaskId: 'task-workflow-video',
          status: 'succeeded',
          outputUrl: 'https://provider.example/workflow-video.mp4',
          rawMetadata: {},
        };
      },
    }),
    debitForImageAgentRun: async (input) => {
      debits.push({ amount: input.amount, runId: input.runId });
      return { entryId: 'ledger-workflow-video', balanceAfter: 84 };
    },
    generatedMediaCache: testGeneratedMediaCache(),
    mediaRunScheduler: {
      schedule(runId, task) {
        scheduledTasks.push({ runId, task });
      },
      getActiveRunIds() {
        return scheduledTasks.map((task) => task.runId);
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
    prompt: '生成工作流视频',
    input: {
      stage: 'workflow_video',
      modelId: 'model-video',
      sourceImageAssetId: source.id,
      storyboardArtifactId: storyboard.id,
      sceneBackgroundId: 'wood-table-handmade-1',
      origin: 'https://app.example',
      storyboardPromptMap: { shot1: '开场' },
      durationSeconds: 5,
      resolution: '720p',
    },
  });

  assert.equal(result.run.status, 'running');
  assert.deepEqual(scheduledTasks.map((task) => task.runId), [result.run.id]);

  await scheduledTasks[0]?.task();
  const completed = await repository.getRunForUser(result.run.id, 'user-1');

  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.billing?.status, 'billed');
  assert.deepEqual(debits, [{ amount: 3, runId: result.run.id }]);
});

test('syncVideoAgentRunForUser does not rebill terminal video runs', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerPolls = 0;
  let debitCalls = 0;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask() {
        return { providerTaskId: 'task-video', rawMetadata: {} };
      },
      async getVideoTask() {
        providerPolls += 1;
        return {
          providerTaskId: 'task-video',
          status: 'succeeded',
          outputUrl: 'https://provider.example/video.mp4',
          rawMetadata: {},
        };
      },
    }),
    debitForImageAgentRun: async () => {
      debitCalls += 1;
      return { entryId: `ledger-video-${debitCalls}`, balanceAfter: 90 - debitCalls };
    },
    mediaRunScheduler: {
      schedule() {},
      getActiveRunIds() {
        return [];
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: '石头印画动起来',
    modelId: 'model-video',
    input: { durationSeconds: 5, resolution: '720p', styleCode: 'stone' },
  });

  const completed = await service.syncVideoAgentRunForUser('user-1', result.run.id);
  const syncedAgain = await service.syncVideoAgentRunForUser('user-1', result.run.id);

  assert.equal(completed.status, 'succeeded');
  assert.equal(syncedAgain.status, 'succeeded');
  assert.equal(providerPolls, 1);
  assert.equal(debitCalls, 1);
  assert.equal(syncedAgain.billing?.ledgerEntryId, 'ledger-video-1');
});

test('workflow video rejects disabled configured scene background', async () => {
  const repository = createMemoryAgentRunRepository();
  const assetRepository = createMemoryGeneratedMediaAssetRepository();
  const source = await createImageAsset(assetRepository, { objectKey: 'workflow/source.png' });
  const storyboard = await createImageAsset(assetRepository, { objectKey: 'workflow/storyboard.png' });
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () => workflowVideoCapabilitySnapshot(),
    resolveVideoModelForUser: async () =>
      resolvedVideoModel({ id: 'model-video', model: 'doubao-seedance-2-0' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    mediaAssetRepository: assetRepository,
    signVideoMaterialUrl: async (asset) => `https://signed.example/${asset.objectKey}`,
    assertCanAffordMinimum: async () => {},
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'workflow',
        prompt: '生成工作流视频',
        input: {
          stage: 'workflow_video',
          modelId: 'model-video',
          sourceImageAssetId: source.id,
          storyboardArtifactId: storyboard.id,
          sceneBackgroundId: 'disabled-background-1',
          origin: 'https://app.example',
          storyboardPromptMap: { shot1: '开场' },
          durationSeconds: 5,
          resolution: '720p',
        },
      }),
    /scene background is not available/,
  );
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
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

  assert.equal(result.run.status, 'running');
  assert.deepEqual(result.transientArtifacts, []);

  const completed = await waitForRunStatus(repository, result.run.id, 'user-1', 'succeeded');
  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.artifacts[0]?.url, null);
  assert.equal(completed?.artifacts[0]?.metadata.sourceUrl, 'https://provider.example/generated.png');
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

  assert.equal(run.status, 'running');
  const failed = await waitForRunStatus(repository, run.id, 'user-1', 'failed');
  const events = await repository.listRunEvents(run.id);
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.errorMessage, 'pi unavailable');
  assert.deepEqual(events.map((event) => event.eventType), ['artifact_started']);
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
    runtime: createDeterministicPiRuntime(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask() {
        return { providerTaskId: 'task-failed', rawMetadata: {} };
      },
      async getVideoTask() {
        return {
          providerTaskId: 'task-failed',
          status: 'failed',
          rawMetadata: {},
          errorMessage: 'provider failed',
        };
      },
    }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: 'hello',
    modelId: 'model-video',
    input: { durationSeconds: 5, resolution: '720p', styleCode: 'stone' },
  });

  const failed = await service.syncVideoAgentRunForUser('user-1', result.run.id);
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.errorMessage, 'provider failed');
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
    runtime: createDeterministicPiRuntime(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask() {
        return { providerTaskId: 'task-artifact', rawMetadata: {} };
      },
      async getVideoTask() {
        return {
          providerTaskId: 'task-artifact',
          status: 'succeeded',
          outputUrl: 'https://provider.example/video.mp4',
          rawMetadata: {},
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-video', balanceAfter: 90 }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: '山谷里的石头印画',
    modelId: 'model-video',
    input: { durationSeconds: 5, resolution: '720p', styleCode: 'stone' },
  });

  assert.equal(result.run.status, 'running');

  const failed = await service.syncVideoAgentRunForUser('user-1', result.run.id);
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.artifacts.length, 1);
  assert.equal(failed?.errorMessage, '图片或视频结果推送失败，请重试。');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['artifact_started', 'billing_recorded', 'run_failed'],
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
    taskType: 'workflow',
    prompt: 'hello',
    input: {},
  });
  const run = result.run;

  assert.equal(run.status, 'running');
  const completed = await waitForRunStatus(repository, run.id, 'user-1', 'succeeded');
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
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ id: 'model-video' }),
    resolveVideoGenerationPolicyForUser: async () => enabledVideoPolicy(),
    assertCanAffordMinimum: async () => {},
    createVideoProviderAdapter: () => ({
      protocol: 'video_task_polling',
      async createVideoTask() {
        return { providerTaskId: 'task-completed', rawMetadata: {} };
      },
      async getVideoTask() {
        return {
          providerTaskId: 'task-completed',
          status: 'succeeded',
          outputUrl: 'https://provider.example/video.mp4',
          rawMetadata: {},
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-video', balanceAfter: 90 }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: 'hello',
    modelId: 'model-video',
    input: { durationSeconds: 5, resolution: '720p', styleCode: 'stone' },
  });

  const completed = await service.syncVideoAgentRunForUser('user-1', result.run.id);
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.errorMessage, null);
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
  assert.equal(result.run.status, 'running');
  const run = await waitForRunStatus(repository, result.run.id, 'user-1', 'failed');
  assert.ok(run);
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
    input: { mode: 'generate', size: '1920x1920' },
  });

  assert.equal(result.run.status, 'running');
  assert.deepEqual(result.transientArtifacts, []);
  const stored = await waitForRunStatus(repository, result.run.id, 'user-1', 'succeeded');
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(stored?.artifacts[0]?.body, null);
  assert.equal(stored?.artifacts[0]?.url, null);
  assert.equal(stored?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
  assert.equal(stored?.selectedModel?.code, 'dev-free-image');
  assert.equal(stored?.billing?.status, 'billed');
  assert.equal(stored?.billing?.creditCost, 7);
  assert.equal(stored?.billing?.ledgerEntryId, 'ledger-1');
  assert.equal(directMediaPayload(events[2]?.payload ?? {}).artifact.delivery.url, 'data:image/png;base64,RESULT');
  assert.equal(debits.length, 1);
  assert.equal(debits[0]?.amount, 7);
});

test('image run normalizes ratio size before calling provider', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerSize: string | undefined;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () => resolvedImageModel({ id: 'model-1' }),
    assertCanAffordMinimum: async () => {},
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage(request) {
        providerSize = request.size;
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
          rawMetadata: {},
        };
      },
    }),
    debitForImageAgentRun: async () => ({ entryId: 'ledger-1', balanceAfter: 100 }),
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山水',
    modelId: 'model-1',
    input: { mode: 'generate', size: '1:1' },
  });

  await waitForRunStatus(repository, result.run.id, 'user-1', 'succeeded');
  assert.equal(providerSize, '1920x1920');
});

test('image run rejects invalid size before creating a run or calling provider', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () => resolvedImageModel({ id: 'model-1' }),
    assertCanAffordMinimum: async () => {},
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
        prompt: '山水',
        modelId: 'model-1',
        input: { mode: 'generate', size: 'wide' },
      }),
    AgentRunImageSizeInvalidError,
  );

  assert.equal(providerCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
});

test('image run rejects provider size below minimum pixels before creating a run', async () => {
  const repository = createMemoryAgentRunRepository();
  let providerCalled = false;
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () => resolvedImageModel({ id: 'model-1' }),
    assertCanAffordMinimum: async () => {},
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
        prompt: '山水',
        modelId: 'model-1',
        input: { mode: 'generate', size: '1024x1024' },
      }),
    AgentRunImageSizeInvalidError,
  );

  assert.equal(providerCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-1'), []);
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

  assert.equal(result.run.status, 'running');
  const failed = await waitForRunStatus(repository, result.run.id, 'user-1', 'failed');
  assert.equal(failed?.errorMessage, 'image provider unavailable');
  assert.equal(failed?.selectedModel?.code, 'dev-free-image');
  assert.equal(failed?.billing?.status, 'failed');
  assert.equal(failed?.billing?.creditCost, null);
  assert.equal(failed?.billing?.ledgerEntryId, null);
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

  assert.equal(result.run.status, 'running');
  assert.deepEqual(result.transientArtifacts, []);
  const completed = await waitForRunStatus(repository, result.run.id, 'user-1', 'succeeded');
  assert.equal(completed?.billing?.status, 'billed');
  assert.equal(completed?.billing?.creditCost, 9);
  assert.equal(completed?.billing?.ledgerEntryId, 'ledger-after-debit');
  assert.equal(completed?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
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
      size: '1920x1920',
      sourceImageDataUrl: 'data:image/png;base64,SOURCE',
    },
  });

  assert.equal(result.run.status, 'running');
  await waitForRunStatus(repository, result.run.id, 'user-1', 'succeeded');
  assert.equal(JSON.stringify(durableInputs).includes('sourceImageDataUrl'), false);
  assert.equal(JSON.stringify(durableInputs).includes('data:image/png;base64,SOURCE'), false);
});

test('createAndRunAgentRun routes chat through selected model adapter and bills usage', async () => {
  const repository = createMemoryAgentRunRepository();
  const conversationRepository = createMemoryAgentConversationRepository();
  const debits: Array<{ amount: number; runId: string; modelCode: string }> = [];
  const service = createAgentRunService({
    repository,
    conversationRepository,
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
  const conversations = await conversationRepository.listForUser('user-1');

  assert.equal(run.status, 'running');
  assert.equal(conversations.conversations.length, 1);
  assert.equal(conversations.conversations[0]?.id, run.conversationId);
  assert.equal(conversations.conversations[0]?.title, 'hello');
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

test('createAndRunAgentRun rejects chat conversation ids not owned by user', async () => {
  const repository = createMemoryAgentRunRepository();
  const conversationRepository = createMemoryAgentConversationRepository();
  const bobConversation = await conversationRepository.createConversation({
    userId: 'user-bob',
    autoTitle: 'Bob chat',
  });
  let providerCalled = false;
  const service = createAgentRunService({
    repository,
    conversationRepository,
    runtime: createDeterministicPiRuntime(),
    resolveChatModelForUser: async () => resolvedChatModel(),
    assertCanAffordMinimum: async () => {},
    createChatProviderAdapter: () => ({
      kind: 'development',
      async runChat() {
        providerCalled = true;
        return {
          finalMessage: 'should not run',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          rawMetadata: {},
        };
      },
    }),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-alice',
        taskType: 'chat',
        prompt: 'hello',
        modelId: 'seed-model-free',
        conversationId: bobConversation.id,
        input: {},
      }),
    /Agent conversation was not found/,
  );

  assert.equal(providerCalled, false);
  assert.deepEqual(await repository.listRunsForUser('user-alice'), []);
});

test('createAndRunAgentRun prefers provider billing rules over legacy model pricing for chat usage', async () => {
  const repository = createMemoryAgentRunRepository();
  const debits: number[] = [];
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveChatModelForUser: async () =>
      resolvedChatModel({
        pricing: {
          unit: 'token',
          promptCreditsPer1k: 99,
          completionCreditsPer1k: 99,
          minimumCredits: 9,
        },
        billingRules: {
          chat: {
            mode: 'token_breakdown',
            inputCreditsPer1k: 8,
            cachedInputCreditsPer1k: 0.5,
            cacheMissInputCreditsPer1k: 1,
            outputCreditsPer1k: 0,
            minimumCredits: 1,
          },
        },
      }),
    assertCanAffordMinimum: async () => {},
    createChatProviderAdapter: () => ({
      kind: 'development',
      async runChat() {
        return {
          finalMessage: 'provider response',
          usage: { promptTokens: 1000, completionTokens: 0, totalTokens: 1000 },
          rawMetadata: {
            usage: {
              prompt_tokens: 1000,
              prompt_cache_hit_tokens: 400,
              prompt_cache_miss_tokens: 600,
              completion_tokens: 0,
              total_tokens: 1000,
            },
          },
        };
      },
    }),
    debitForAgentRun: async (input) => {
      debits.push(input.amount);
      return { entryId: 'ledger-provider-rule', balanceAfter: 88 };
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
    input: {},
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  const completed = await repository.getRunForUser(result.run.id, 'user-1');

  assert.deepEqual(debits, [1]);
  assert.equal(completed?.billing?.creditCost, 1);
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
