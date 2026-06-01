import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedImageModel } from '@/server/repositories/ai-models';
import {
  ProviderConfigurationError,
  ProviderRequestError,
} from './provider-adapters';
import {
  createDoubaoImageProviderAdapter,
  parseDoubaoImageResponse,
} from './image-provider-adapters';

function makeResolvedImageModel(overrides: Partial<ResolvedImageModel> = {}): ResolvedImageModel {
  return {
    id: 'model-1',
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
    credentialEnvKey: 'DOUBAO_IMAGE_KEY',
    model: 'doubao-seedream',
    pricing: {
      unit: 'token',
      promptCreditsPer1k: 1,
      completionCreditsPer1k: 0,
      minimumCredits: 1,
    },
    entitlement: { allowed: true, basis: 'none', label: 'Free', value: null },
    supportedModes: ['generate', 'edit', 'upscale'],
    ...overrides,
  };
}

test('parseDoubaoImageResponse converts b64_json to image artifact input', () => {
  const result = parseDoubaoImageResponse(
    {
      data: [{ b64_json: 'abc', revised_prompt: 'stone print' }],
      usage: { total_tokens: 12 },
      id: 'response-1',
    },
    { model: 'doubao-seedream', mode: 'generate' },
  );

  assert.equal(result.finalMessage, 'Generated 1 image.');
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0]?.kind, 'image');
  assert.equal(result.artifacts[0]?.body, 'data:image/png;base64,abc');
  assert.equal(result.artifacts[0]?.metadata?.mimeType, 'image/png');
  assert.equal(result.artifacts[0]?.metadata?.model, 'doubao-seedream');
  assert.equal(result.artifacts[0]?.metadata?.mode, 'generate');
  assert.equal(result.artifacts[0]?.metadata?.revisedPrompt, 'stone print');
  assert.deepEqual(result.rawMetadata.usage, { total_tokens: 12 });
  assert.equal(result.rawMetadata.id, 'response-1');
});

test('parseDoubaoImageResponse preserves url output as image artifact url', () => {
  const result = parseDoubaoImageResponse(
    {
      data: [{ url: 'https://cdn.example/image.png' }],
    },
    { model: 'doubao-seedream', mode: 'edit' },
  );

  assert.equal(result.artifacts[0]?.kind, 'image');
  assert.equal(result.artifacts[0]?.url, 'https://cdn.example/image.png');
  assert.equal(result.artifacts[0]?.body, undefined);
  assert.equal(result.artifacts[0]?.metadata?.model, 'doubao-seedream');
  assert.equal(result.artifacts[0]?.metadata?.mode, 'edit');
});

test('parseDoubaoImageResponse rejects responses without valid image output', () => {
  assert.throws(
    () =>
      parseDoubaoImageResponse(
        {
          data: [{ revised_prompt: 'no image' }],
        },
        { model: 'doubao-seedream', mode: 'generate' },
      ),
    ProviderRequestError,
  );
});

test('doubao adapter sends expected request shape to images/generations', async () => {
  const requests: Array<{
    url: string;
    init: RequestInit;
    body: Record<string, unknown>;
  }> = [];
  const adapter = createDoubaoImageProviderAdapter({
    fetch: async (url, init) => {
      requests.push({
        url: String(url),
        init: init ?? {},
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), { status: 200 });
    },
    readEnv: () => 'test-key',
  });

  await adapter.runImage({
    runId: 'run-1',
    userId: 'user-1',
    model: makeResolvedImageModel(),
    mode: 'generate',
    prompt: 'mountain lake',
    size: '1024x1024',
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, 'https://ark.example/api/v3/images/generations');
  assert.equal(requests[0]?.init.method, 'POST');
  assert.equal((requests[0]?.init.headers as Record<string, string>).authorization, 'Bearer test-key');
  assert.deepEqual(requests[0]?.body, {
    model: 'doubao-seedream',
    prompt: 'mountain lake',
    size: '1024x1024',
    response_format: 'b64_json',
  });
});

test('doubao adapter includes source image for edit mode', async () => {
  const requests: Record<string, unknown>[] = [];
  const adapter = createDoubaoImageProviderAdapter({
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), { status: 200 });
    },
    readEnv: () => 'test-key',
  });

  await adapter.runImage({
    runId: 'run-1',
    userId: 'user-1',
    model: makeResolvedImageModel(),
    mode: 'edit',
    prompt: 'ink wash style',
    sourceImageDataUrl: 'data:image/png;base64,SOURCE',
  });

  assert.equal(requests[0]?.image, 'data:image/png;base64,SOURCE');
});

test('doubao adapter rejects missing configuration and env values', async () => {
  const adapter = createDoubaoImageProviderAdapter({
    fetch: async () => new Response('{}'),
    readEnv: () => null,
  });

  await assert.rejects(
    () =>
      adapter.runImage({
        runId: 'run-1',
        userId: 'user-1',
        model: makeResolvedImageModel({ baseUrl: null }),
        mode: 'generate',
        prompt: 'mountain lake',
      }),
    ProviderConfigurationError,
  );

  await assert.rejects(
    () =>
      adapter.runImage({
        runId: 'run-1',
        userId: 'user-1',
        model: makeResolvedImageModel({ credentialEnvKey: null }),
        mode: 'generate',
        prompt: 'mountain lake',
      }),
    ProviderConfigurationError,
  );

  await assert.rejects(
    () =>
      adapter.runImage({
        runId: 'run-1',
        userId: 'user-1',
        model: makeResolvedImageModel(),
        mode: 'generate',
        prompt: 'mountain lake',
      }),
    ProviderConfigurationError,
  );
});

test('doubao adapter normalizes upstream fetch errors', async () => {
  const adapter = createDoubaoImageProviderAdapter({
    fetch: async () => {
      throw new Error('socket closed');
    },
    readEnv: () => 'test-key',
  });

  await assert.rejects(
    () =>
      adapter.runImage({
        runId: 'run-1',
        userId: 'user-1',
        model: makeResolvedImageModel(),
        mode: 'generate',
        prompt: 'mountain lake',
      }),
    (error) => error instanceof ProviderRequestError && /socket closed/.test(error.message),
  );
});

test('doubao adapter trims non-ok response body and throws ProviderRequestError', async () => {
  const adapter = createDoubaoImageProviderAdapter({
    fetch: async () => new Response(`upstream ${'x'.repeat(700)}`, { status: 429 }),
    readEnv: () => 'test-key',
  });

  await assert.rejects(
    () =>
      adapter.runImage({
        runId: 'run-1',
        userId: 'user-1',
        model: makeResolvedImageModel(),
        mode: 'generate',
        prompt: 'mountain lake',
      }),
    (error) =>
      error instanceof ProviderRequestError &&
      /status 429/.test(error.message) &&
      error.message.includes('upstream ') &&
      error.message.length < 620,
  );
});
