import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRuntimeApiError,
  createAgentRun,
  getAgentRunDetail,
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

test('createAgentRun returns run and transient artifacts from API payload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      run: {
        id: 'run-1',
        conversationId: 'run-1',
        taskType: 'image',
        status: 'succeeded',
        prompt: 'stone cat',
        finalMessage: '图片已生成，请及时下载保存。',
        errorMessage: null,
        capabilitySummary: { provider: 'pi', model: 'pi-default', capabilities: [] },
        artifacts: [],
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z',
      },
      transientArtifacts: [
        {
          kind: 'image',
          title: '生成图片',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,abc',
          metadata: { transient: true },
        },
      ],
    });

  try {
    const result = await createAgentRun({ taskType: 'image', prompt: 'stone cat' });

    assert.equal(result.run.id, 'run-1');
    assert.equal(result.transientArtifacts.length, 1);
    assert.equal(result.transientArtifacts[0]?.dataUrl, 'data:image/png;base64,abc');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getAgentRunDetail returns typed run detail payload from API', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      run: {
        id: 'run-1',
        taskType: 'chat',
        status: 'running',
        prompt: 'hello',
        finalMessage: null,
        errorMessage: null,
        capabilitySummary: { provider: 'development', model: 'dev', capabilities: [] },
        artifacts: [],
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z',
      },
      events: [
        {
          id: 'event-1',
          runId: 'run-1',
          sequence: 1,
          eventType: 'assistant_delta',
          payload: { delta: 'hello' },
          createdAt: '2026-05-31T00:00:00.000Z',
        },
      ],
    });

  try {
    const detail = await getAgentRunDetail('run-1');
    assert.equal(detail.run.id, 'run-1');
    assert.equal(detail.events.length, 1);
    assert.equal(detail.events[0]?.eventType, 'assistant_delta');
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
