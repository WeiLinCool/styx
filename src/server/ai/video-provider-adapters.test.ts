import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedVideoModel } from '@/server/repositories/ai-models';
import { createDoubaoVideoTaskAdapter } from './video-provider-adapters';

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

async function captureCreateVideoTaskBody(
  request: {
    prompt: string;
    imageUrl?: string;
    audioUrl?: string;
  },
  model = resolvedVideoModel(),
) {
  let body: unknown;
  const adapter = createDoubaoVideoTaskAdapter({
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'task_123', status: 'queued' }), { status: 200 });
    },
    readEnv: () => 'test-key',
  });

  await adapter.createVideoTask({
    runId: 'run-1',
    userId: 'user-1',
    model,
    duration: 5,
    resolution: '720p',
    ratio: '16:9',
    ...request,
  });

  return body;
}

test('doubao video create body includes prompt text only when no media is provided', async () => {
  const model = resolvedVideoModel();

  const body = await captureCreateVideoTaskBody({ prompt: 'A cinematic clip' }, model);

  assert.deepEqual(body, {
    model: model.model,
    content: [
      {
        type: 'text',
        text: 'A cinematic clip --rs 720p --rt 16:9 --dur 5',
      },
    ],
  });
});

test('doubao video create body includes prompt text and image url entry', async () => {
  const model = resolvedVideoModel();

  const body = await captureCreateVideoTaskBody(
    {
      prompt: 'Animate this poster',
      imageUrl: 'https://cdn.example/input.png',
    },
    model,
  );

  assert.deepEqual(body, {
    model: model.model,
    content: [
      {
        type: 'text',
        text: 'Animate this poster --rs 720p --rt 16:9 --dur 5',
      },
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example/input.png' },
      },
    ],
  });
});

test('doubao video create body includes prompt text and audio url entry', async () => {
  const model = resolvedVideoModel();

  const body = await captureCreateVideoTaskBody(
    {
      prompt: 'Cut to the beat',
      audioUrl: 'https://cdn.example/input.mp3',
    },
    model,
  );

  assert.deepEqual(body, {
    model: model.model,
    content: [
      {
        type: 'text',
        text: 'Cut to the beat --rs 720p --rt 16:9 --dur 5',
      },
      {
        type: 'audio_url',
        audio_url: { url: 'https://cdn.example/input.mp3' },
      },
    ],
  });
});

test('doubao video create body includes prompt text plus image and audio entries', async () => {
  const model = resolvedVideoModel();

  const body = await captureCreateVideoTaskBody(
    {
      prompt: 'Use both source materials',
      imageUrl: 'https://cdn.example/input.png',
      audioUrl: 'https://cdn.example/input.mp3',
    },
    model,
  );

  assert.deepEqual(body, {
    model: model.model,
    content: [
      {
        type: 'text',
        text: 'Use both source materials --rs 720p --rt 16:9 --dur 5',
      },
      {
        type: 'image_url',
        image_url: { url: 'https://cdn.example/input.png' },
      },
      {
        type: 'audio_url',
        audio_url: { url: 'https://cdn.example/input.mp3' },
      },
    ],
  });
});
