import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRuntimeApiError,
  createAgentRun,
  listChatModels,
  selectChatModelId,
  type ChatModelOption,
} from './agent-runtime-client';

test('createAgentRun throws fallback message for non-JSON error responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('Service unavailable', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });

  try {
    await assert.rejects(
      () => createAgentRun({ taskType: 'chat', prompt: 'hello' }),
      /AI 请求失败/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listChatModels returns typed model options from API payload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      models: [
        {
          id: 'model-1',
          code: 'dev-free-chat',
          name: 'Development Free Chat',
          providerName: 'Development',
          isDefault: true,
          entitlementLabel: 'Free',
          pricingSummary: '1 credit minimum',
        },
      ],
    });

  try {
    const models = await listChatModels();

    assert.deepEqual(models, [
      {
        id: 'model-1',
        code: 'dev-free-chat',
        name: 'Development Free Chat',
        providerName: 'Development',
        isDefault: true,
        entitlementLabel: 'Free',
        pricingSummary: '1 credit minimum',
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createAgentRun throws typed API error codes from JSON responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      {
        error: {
          code: 'insufficient_credits',
          message: 'Insufficient credits.',
        },
      },
      { status: 402 },
    );

  try {
    await assert.rejects(
      () => createAgentRun({ taskType: 'chat', prompt: 'hello', modelId: 'model-1' }),
      (error) =>
        error instanceof AgentRuntimeApiError &&
        error.code === 'insufficient_credits' &&
        error.status === 402,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('selectChatModelId keeps valid prior selection before falling back to default', () => {
  const models: ChatModelOption[] = [
    {
      id: 'model-free',
      code: 'free',
      name: 'Free',
      providerName: 'Development',
      isDefault: true,
      entitlementLabel: 'Free',
      pricingSummary: '1 credit minimum',
    },
    {
      id: 'model-pro',
      code: 'pro',
      name: 'Pro',
      providerName: 'Development',
      isDefault: false,
      entitlementLabel: 'Pro',
      pricingSummary: '2 credits minimum',
    },
  ];

  assert.equal(selectChatModelId(models, 'model-pro'), 'model-pro');
  assert.equal(selectChatModelId(models, 'missing'), 'model-free');
  assert.equal(selectChatModelId([], 'model-pro'), null);
});
