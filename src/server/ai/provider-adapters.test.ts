import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResolvedChatModel } from '@/server/repositories/ai-models';
import {
  ProviderConfigurationError,
  ProviderRequestError,
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

test('OpenAI-compatible adapter forwards configured proxy dispatcher to fetch', async () => {
  const originalKey = process.env.TEST_OPENAI_COMPATIBLE_KEY;
  const originalProxy = process.env.STYX_OPENAI_COMPAT_PROXY_URL;
  process.env.TEST_OPENAI_COMPATIBLE_KEY = 'test-secret';
  process.env.STYX_OPENAI_COMPAT_PROXY_URL = 'http://127.0.0.1:10808';
  let seenInit: RequestInit | undefined;

  try {
    const adapter = createOpenAiCompatibleChatProviderAdapter({
      fetch: async (_url, init) => {
        seenInit = init;
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'proxied response' } }],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
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

    assert.equal(result.finalMessage, 'proxied response');
    assert.equal(Boolean((seenInit as RequestInit & { dispatcher?: unknown })?.dispatcher), true);
  } finally {
    if (originalKey === undefined) {
      delete process.env.TEST_OPENAI_COMPATIBLE_KEY;
    } else {
      process.env.TEST_OPENAI_COMPATIBLE_KEY = originalKey;
    }
    if (originalProxy === undefined) {
      delete process.env.STYX_OPENAI_COMPAT_PROXY_URL;
    } else {
      process.env.STYX_OPENAI_COMPAT_PROXY_URL = originalProxy;
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

test('OpenAI-compatible adapter normalizes non-JSON error responses', async () => {
  const originalKey = process.env.TEST_OPENAI_COMPATIBLE_KEY;
  process.env.TEST_OPENAI_COMPATIBLE_KEY = 'test-secret';

  try {
    const adapter = createOpenAiCompatibleChatProviderAdapter({
      fetch: async () => new Response('upstream failed', { status: 500 }),
    });

    await assert.rejects(
      () =>
        adapter.runChat({
          runId: 'run-1',
          userId: 'user-1',
          model: resolvedModel({
            providerType: 'openai_compatible',
            baseUrl: 'https://provider.example/v1',
            credentialEnvKey: 'TEST_OPENAI_COMPATIBLE_KEY',
          }),
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      (error) => error instanceof ProviderRequestError && /status 500/.test(error.message),
    );
  } finally {
    if (originalKey === undefined) {
      delete process.env.TEST_OPENAI_COMPATIBLE_KEY;
    } else {
      process.env.TEST_OPENAI_COMPATIBLE_KEY = originalKey;
    }
  }
});

test('OpenAI-compatible adapter normalizes invalid JSON success responses', async () => {
  const originalKey = process.env.TEST_OPENAI_COMPATIBLE_KEY;
  process.env.TEST_OPENAI_COMPATIBLE_KEY = 'test-secret';

  try {
    const adapter = createOpenAiCompatibleChatProviderAdapter({
      fetch: async () => new Response('not json', { status: 200 }),
    });

    await assert.rejects(
      () =>
        adapter.runChat({
          runId: 'run-1',
          userId: 'user-1',
          model: resolvedModel({
            providerType: 'openai_compatible',
            baseUrl: 'https://provider.example/v1',
            credentialEnvKey: 'TEST_OPENAI_COMPATIBLE_KEY',
          }),
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ProviderRequestError,
    );
  } finally {
    if (originalKey === undefined) {
      delete process.env.TEST_OPENAI_COMPATIBLE_KEY;
    } else {
      process.env.TEST_OPENAI_COMPATIBLE_KEY = originalKey;
    }
  }
});

test('OpenAI-compatible adapter parses SSE-style data payload responses', async () => {
  const originalKey = process.env.TEST_OPENAI_COMPATIBLE_KEY;
  process.env.TEST_OPENAI_COMPATIBLE_KEY = 'test-secret';

  try {
    const adapter = createOpenAiCompatibleChatProviderAdapter({
      fetch: async () =>
        new Response(
          [
            'data: {"id":"completion-1","choices":[{"message":{"role":"assistant","content":"Hello from sse."}}],"usage":{"prompt_tokens":4,"completion_tokens":5,"total_tokens":9}}',
            '',
          ].join('\n'),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });

    const result = await adapter.runChat({
      runId: 'run-1',
      userId: 'user-1',
      model: resolvedModel({
        providerType: 'openai_compatible',
        baseUrl: 'https://provider.example/v1',
        credentialEnvKey: 'TEST_OPENAI_COMPATIBLE_KEY',
      }),
      messages: [{ role: 'user', content: 'Hello' }],
    });

    assert.equal(result.finalMessage, 'Hello from sse.');
    assert.deepEqual(result.usage, {
      promptTokens: 4,
      completionTokens: 5,
      totalTokens: 9,
    });
  } finally {
    if (originalKey === undefined) {
      delete process.env.TEST_OPENAI_COMPATIBLE_KEY;
    } else {
      process.env.TEST_OPENAI_COMPATIBLE_KEY = originalKey;
    }
  }
});

test('OpenAI-compatible adapter accumulates streaming SSE delta content responses', async () => {
  const originalKey = process.env.TEST_OPENAI_COMPATIBLE_KEY;
  process.env.TEST_OPENAI_COMPATIBLE_KEY = 'test-secret';

  try {
    const adapter = createOpenAiCompatibleChatProviderAdapter({
      fetch: async () =>
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"石头"}}]}',
            '',
            'data: {"choices":[{"delta":{"content":"开花"}}]}',
            '',
            'data: {"usage":{"prompt_tokens":4,"completion_tokens":5,"total_tokens":9},"choices":[{"finish_reason":"stop"}]}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    });

    const result = await adapter.runChat({
      runId: 'run-1',
      userId: 'user-1',
      model: resolvedModel({
        providerType: 'openai_compatible',
        baseUrl: 'https://provider.example/v1',
        credentialEnvKey: 'TEST_OPENAI_COMPATIBLE_KEY',
      }),
      messages: [{ role: 'user', content: 'Hello' }],
    });

    assert.equal(result.finalMessage, '石头开花');
    assert.deepEqual(result.usage, {
      promptTokens: 4,
      completionTokens: 5,
      totalTokens: 9,
    });
  } finally {
    if (originalKey === undefined) {
      delete process.env.TEST_OPENAI_COMPATIBLE_KEY;
    } else {
      process.env.TEST_OPENAI_COMPATIBLE_KEY = originalKey;
    }
  }
});

test('OpenAI-compatible streamChat yields deltas before the SSE response closes', async () => {
  const originalKey = process.env.TEST_OPENAI_COMPATIBLE_KEY;
  process.env.TEST_OPENAI_COMPATIBLE_KEY = 'test-secret';
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  try {
    const stream = new ReadableStream<Uint8Array>({
      start(nextController) {
        controller = nextController;
      },
    });
    const adapter = createOpenAiCompatibleChatProviderAdapter({
      fetch: async () =>
        new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    });

    const iterator = adapter.streamChat?.({
      runId: 'run-1',
      userId: 'user-1',
      model: resolvedModel({
        providerType: 'openai_compatible',
        baseUrl: 'https://provider.example/v1',
        credentialEnvKey: 'TEST_OPENAI_COMPATIBLE_KEY',
      }),
      messages: [{ role: 'user', content: 'Hello' }],
    });

    assert.ok(iterator);
    const activeController = controller;
    assert.ok(activeController);
    activeController.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"石头"}}]}\n\n'));

    const first = await Promise.race([
      iterator.next(),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 50)),
    ]);

    activeController.close();

    assert.notEqual(first, 'timeout');
    assert.deepEqual(first, { done: false, value: { type: 'delta', delta: '石头' } });
  } finally {
    if (originalKey === undefined) {
      delete process.env.TEST_OPENAI_COMPATIBLE_KEY;
    } else {
      process.env.TEST_OPENAI_COMPATIBLE_KEY = originalKey;
    }
  }
});

test('OpenAI-compatible adapter normalizes fetch exceptions', async () => {
  const originalKey = process.env.TEST_OPENAI_COMPATIBLE_KEY;
  process.env.TEST_OPENAI_COMPATIBLE_KEY = 'test-secret';

  try {
    const adapter = createOpenAiCompatibleChatProviderAdapter({
      fetch: async () => {
        throw new Error('socket closed');
      },
    });

    await assert.rejects(
      () =>
        adapter.runChat({
          runId: 'run-1',
          userId: 'user-1',
          model: resolvedModel({
            providerType: 'openai_compatible',
            baseUrl: 'https://provider.example/v1',
            credentialEnvKey: 'TEST_OPENAI_COMPATIBLE_KEY',
          }),
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      (error) => error instanceof ProviderRequestError && /socket closed/.test(error.message),
    );
  } finally {
    if (originalKey === undefined) {
      delete process.env.TEST_OPENAI_COMPATIBLE_KEY;
    } else {
      process.env.TEST_OPENAI_COMPATIBLE_KEY = originalKey;
    }
  }
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
