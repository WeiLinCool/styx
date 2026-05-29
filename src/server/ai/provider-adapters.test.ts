import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedChatModel } from '@/server/repositories/ai-models';
import {
  ProviderConfigurationError,
  createChatProviderAdapter,
  createDevelopmentChatProviderAdapter,
  createOpenAiCompatibleChatProviderAdapter,
} from './provider-adapters';

function resolvedModel(overrides: Partial<ResolvedChatModel> = {}): ResolvedChatModel {
  return {
    id: 'model-1',
    code: 'dev-chat',
    name: 'Development Chat',
    providerName: 'Development Provider',
    isDefault: true,
    entitlementLabel: 'Free',
    pricingSummary: '1 credit minimum',
    providerId: 'provider-1',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-chat',
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

test('development adapter returns explicit fallback metadata and positive estimated usage', async () => {
  const adapter = createDevelopmentChatProviderAdapter();

  const result = await adapter.runChat({
    runId: 'run-1',
    userId: 'user-1',
    model: resolvedModel(),
    messages: [{ role: 'user', content: 'Write a concise project plan.' }],
  });

  assert.match(result.finalMessage, /Write a concise project plan/);
  assert.deepEqual(result.rawMetadata, { developmentFallback: true });
  assert.equal(result.usage.promptTokens > 0, true);
  assert.equal(result.usage.completionTokens > 0, true);
  assert.equal(
    result.usage.totalTokens,
    result.usage.promptTokens + result.usage.completionTokens,
  );
});

test('OpenAI-compatible adapter posts chat completions request and normalizes response', async () => {
  const originalKey = process.env.TEST_OPENAI_COMPATIBLE_KEY;
  process.env.TEST_OPENAI_COMPATIBLE_KEY = 'test-secret';
  const requests: Array<{ url: string; init: RequestInit }> = [];

  try {
    const adapter = createOpenAiCompatibleChatProviderAdapter({
      fetch: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            id: 'completion-1',
            choices: [{ message: { role: 'assistant', content: 'Hello from provider.' } }],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 7,
              total_tokens: 19,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const result = await adapter.runChat({
      runId: 'run-1',
      userId: 'user-1',
      model: resolvedModel({
        providerType: 'openai_compatible',
        baseUrl: 'https://provider.example/v1/',
        credentialEnvKey: 'TEST_OPENAI_COMPATIBLE_KEY',
        model: 'provider-model',
      }),
      messages: [{ role: 'user', content: 'Hello' }],
    });

    assert.equal(result.finalMessage, 'Hello from provider.');
    assert.deepEqual(result.usage, {
      promptTokens: 12,
      completionTokens: 7,
      totalTokens: 19,
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://provider.example/v1/chat/completions');
    assert.equal(requests[0].init.method, 'POST');
    assert.equal((requests[0].init.headers as Record<string, string>).authorization, 'Bearer test-secret');
    assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
      model: 'provider-model',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  } finally {
    if (originalKey === undefined) {
      delete process.env.TEST_OPENAI_COMPATIBLE_KEY;
    } else {
      process.env.TEST_OPENAI_COMPATIBLE_KEY = originalKey;
    }
  }
});

test('OpenAI-compatible adapter rejects missing configuration before fetch', async () => {
  let called = false;
  const adapter = createOpenAiCompatibleChatProviderAdapter({
    fetch: async () => {
      called = true;
      return new Response('{}');
    },
  });

  await assert.rejects(
    () =>
      adapter.runChat({
        runId: 'run-1',
        userId: 'user-1',
        model: resolvedModel({
          providerType: 'openai_compatible',
          baseUrl: null,
          credentialEnvKey: null,
        }),
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    ProviderConfigurationError,
  );
  assert.equal(called, false);
});

test('adapter factory selects adapter by provider type', () => {
  assert.equal(createChatProviderAdapter(resolvedModel()).kind, 'development');
  assert.equal(
    createChatProviderAdapter(
      resolvedModel({
        providerType: 'openai_compatible',
        baseUrl: 'https://provider.example/v1',
        credentialEnvKey: 'TEST_OPENAI_COMPATIBLE_KEY',
      }),
    ).kind,
    'openai_compatible',
  );
});
