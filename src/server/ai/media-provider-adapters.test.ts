import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedImageModel, ResolvedVideoModel } from '@/server/repositories/ai-models';
import { createMediaProviderAdapter } from './media-provider-adapters';
import { createDoubaoVideoTaskAdapter } from './video-provider-adapters';

function resolvedImageModel(overrides: Partial<ResolvedImageModel> = {}): ResolvedImageModel {
  return {
    id: 'model-image-1',
    code: 'doubao-image',
    name: 'Doubao Image',
    providerName: 'Doubao',
    isDefault: true,
    entitlementLabel: 'Free',
    pricingSummary: '1 credit minimum',
    providerId: 'provider-1',
    providerCode: 'doubao',
    providerType: 'openai_compatible',
    baseUrl: 'https://ark.example/api/v3/',
    credentialEnvKey: 'DOUBAO_KEY',
    model: 'doubao-seedream',
    executionProtocol: 'image_openai_compatible',
    pricing: {
      unit: 'token',
      promptCreditsPer1k: 1,
      completionCreditsPer1k: 0,
      minimumCredits: 1,
    },
    entitlement: { allowed: true, basis: 'none', label: 'Free', value: null },
    supportedModes: ['generate', 'edit'],
    ...overrides,
  };
}

function resolvedVideoModel(overrides: Partial<ResolvedVideoModel> = {}): ResolvedVideoModel {
  return {
    id: 'model-video-1',
    code: 'doubao-video',
    name: 'Doubao Video',
    providerName: 'Doubao',
    isDefault: true,
    entitlementLabel: 'Free',
    pricingSummary: '3 credits minimum',
    providerId: 'provider-1',
    providerCode: 'doubao',
    providerType: 'openai_compatible',
    baseUrl: 'https://ark.example/api/v3/',
    credentialEnvKey: 'DOUBAO_KEY',
    model: 'doubao-seedance',
    executionProtocol: 'video_task_polling',
    pricing: {
      unit: 'token',
      promptCreditsPer1k: 0,
      completionCreditsPer1k: 1,
      minimumCredits: 3,
    },
    entitlement: { allowed: true, basis: 'none', label: 'Free', value: null },
    supportsVideoGeneration: true,
    ...overrides,
  };
}

test('createMediaProviderAdapter returns image protocol adapter for image models', () => {
  const adapter = createMediaProviderAdapter(resolvedImageModel());

  assert.equal(adapter.protocol, 'image_openai_compatible');
  assert.equal(typeof adapter.createImage, 'function');
  assert.equal(adapter.createVideoTask, undefined);
});

test('createMediaProviderAdapter returns task polling adapter for video models', () => {
  const adapter = createMediaProviderAdapter(resolvedVideoModel());

  assert.equal(adapter.protocol, 'video_task_polling');
  assert.equal(typeof adapter.createVideoTask, 'function');
  assert.equal(typeof adapter.getVideoTask, 'function');
  assert.equal(adapter.createImage, undefined);
});

test('doubao video adapter creates provider task id', async () => {
  const adapter = createDoubaoVideoTaskAdapter({
    fetch: async (_url, _init) =>
      new Response(JSON.stringify({ id: 'task_123', status: 'queued' }), { status: 200 }),
    readEnv: () => 'test-key',
  });

  const result = await adapter.createVideoTask({
    runId: 'run-1',
    userId: 'user-1',
    model: resolvedVideoModel(),
    prompt: 'A cinematic clip',
    duration: 5,
    resolution: '720p',
    ratio: '16:9',
  });

  assert.equal(result.providerTaskId, 'task_123');
});

test('doubao video adapter parses succeeded task result', async () => {
  const adapter = createDoubaoVideoTaskAdapter({
    fetch: async (_url, _init) =>
      new Response(
        JSON.stringify({
          id: 'task_123',
          status: 'succeeded',
          content: { video_url: 'https://provider.example/video.mp4' },
          usage: { completion_tokens: 108900, total_tokens: 108900 },
        }),
        { status: 200 },
      ),
    readEnv: () => 'test-key',
  });

  const result = await adapter.getVideoTask({
    runId: 'run-1',
    userId: 'user-1',
    model: resolvedVideoModel(),
    providerTaskId: 'task_123',
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.outputUrl, 'https://provider.example/video.mp4');
});
