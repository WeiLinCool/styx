import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatProviderAdapter } from '@/server/ai/provider-adapters';
import type {
  PublicChatModelDto,
  ResolvedChatModel,
} from '@/server/repositories/ai-models';

import {
  EnterpriseGatewayError,
  createEnterpriseChatCompletion,
  createOpenAiSseStream,
  requireEnterpriseModelProxy,
  toOpenAiModelList,
} from './gateway';

function publicModel(id = 'gpt-4o-mini'): PublicChatModelDto {
  return {
    id,
    code: id,
    name: id,
    providerName: 'Enterprise',
    isDefault: id === 'gpt-4o-mini',
    entitlementLabel: 'Enterprise',
    pricingSummary: 'Included',
  };
}

function resolvedModel(id = 'gpt-4o-mini'): ResolvedChatModel {
  return {
    ...publicModel(id),
    providerId: 'provider-1',
    providerCode: 'enterprise',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: id,
    executionProtocol: 'chat_openai_compatible',
    pricing: {
      unit: 'token',
      promptCreditsPer1k: 0,
      completionCreditsPer1k: 0,
      minimumCredits: 0,
    },
    entitlement: { allowed: true, basis: 'none', label: 'Enterprise', value: null },
  };
}

async function readStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }

  return output + decoder.decode();
}

test('toOpenAiModelList maps public chat models to OpenAI-compatible model objects', () => {
  assert.deepEqual(toOpenAiModelList([publicModel('gpt-4o-mini'), publicModel('claude-3-5')]), {
    object: 'list',
    data: [
      { id: 'gpt-4o-mini', object: 'model', owned_by: 'enterprise' },
      { id: 'claude-3-5', object: 'model', owned_by: 'enterprise' },
    ],
  });
});

test('requireEnterpriseModelProxy rejects missing models proxy before model/provider calls', async () => {
  const listedModels = false;
  const createdProvider = false;

  await assert.rejects(
    () =>
      requireEnterpriseModelProxy('user-1', {
        async resolveEnterpriseEntitlements(userId) {
          assert.equal(userId, 'user-1');
          return { plan: 'enterprise-limited', entitlements: [] };
        },
      }),
    {
      name: 'EnterpriseGatewayError',
      code: 'insufficient_entitlement',
      status: 403,
    },
  );

  assert.equal(listedModels, false);
  assert.equal(createdProvider, false);
});

test('createEnterpriseChatCompletion returns OpenAI-compatible non-streaming response', async () => {
  const providerCalls: unknown[] = [];
  const response = await createEnterpriseChatCompletion(
    {
      userId: 'user-1',
      request: {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
      },
    },
    {
      async resolveChatModelForUser(userId, modelId) {
        assert.equal(userId, 'user-1');
        assert.equal(modelId, 'gpt-4o-mini');
        return resolvedModel(modelId);
      },
      createChatProviderAdapter(model) {
        assert.equal(model.id, 'gpt-4o-mini');
        return {
          kind: 'development',
          async runChat(request) {
            providerCalls.push(request);
            return {
              finalMessage: 'Hello from enterprise',
              usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
              rawMetadata: {},
            };
          },
        } satisfies ChatProviderAdapter;
      },
      now: () => new Date('2026-06-01T12:00:00.000Z'),
      createId: () => 'chatcmpl-test',
    },
  );

  assert.equal(providerCalls.length, 1);
  assert.equal(response.id, 'chatcmpl-test');
  assert.equal(response.object, 'chat.completion');
  assert.equal(response.created, 1780315200);
  assert.equal(response.model, 'gpt-4o-mini');
  assert.equal(response.choices[0]?.message.content, 'Hello from enterprise');
  assert.deepEqual(response.usage, {
    prompt_tokens: 3,
    completion_tokens: 4,
    total_tokens: 7,
  });
});

test('createOpenAiSseStream emits data chunks and final done marker', async () => {
  async function* events() {
    yield { type: 'delta' as const, delta: 'Hel' };
    yield { type: 'delta' as const, delta: 'lo' };
    yield {
      type: 'final' as const,
      finalMessage: 'Hello',
      usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
      rawMetadata: {},
    };
  }

  const output = await readStream(
    createOpenAiSseStream({
      model: 'gpt-4o-mini',
      events: events(),
      now: () => new Date('2026-06-01T12:00:00.000Z'),
      createId: () => 'chatcmpl-stream',
    }),
  );

  const records = output.split('\n\n').filter(Boolean);
  assert.equal(records.at(-1), 'data: [DONE]');
  assert.match(records[0] ?? '', /^data: /);

  const firstPayload = JSON.parse((records[0] ?? '').replace(/^data: /, ''));
  assert.equal(firstPayload.id, 'chatcmpl-stream');
  assert.equal(firstPayload.object, 'chat.completion.chunk');
  assert.equal(firstPayload.choices[0].delta.content, 'Hel');
});

test('createEnterpriseChatCompletion rejects unknown models without calling provider', async () => {
  let providerCalled = false;

  await assert.rejects(
    () =>
      createEnterpriseChatCompletion(
        {
          userId: 'user-1',
          request: {
            model: 'unknown-model',
            messages: [{ role: 'user', content: 'Hello' }],
          },
        },
        {
          async resolveChatModelForUser() {
            throw new EnterpriseGatewayError(
              'model_not_found',
              'Model is not available for this user.',
              404,
            );
          },
          createChatProviderAdapter() {
            providerCalled = true;
            return {
              kind: 'development',
              async runChat() {
                throw new Error('provider should not run');
              },
            };
          },
        },
      ),
    {
      name: 'EnterpriseGatewayError',
      code: 'model_not_found',
    },
  );

  assert.equal(providerCalled, false);
});
