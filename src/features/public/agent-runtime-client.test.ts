import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRuntimeApiError,
  createAgentRun,
  createAgentRunEventsUrl,
  getAgentRunDetail,
  listChatModels,
  parseDirectMediaArtifactPayload,
  parseStreamEventPayload,
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

test('createAgentRunEventsUrl returns the run SSE route', () => {
  assert.equal(createAgentRunEventsUrl('run-1'), '/api/agent/runs/run-1/events');
});

test('parseDirectMediaArtifactPayload reads provider-direct image payload', () => {
  const parsed = parseDirectMediaArtifactPayload({
    payload: {
      artifact: {
        kind: 'image',
        title: '生成图片',
        delivery: {
          mode: 'data_url',
          url: 'data:image/png;base64,abc',
          expiresAt: null,
        },
        metadata: {
          storageStatus: 'provider_direct',
          mimeType: 'image/png',
          filename: 'image.png',
        },
      },
    },
  });

  assert.equal(parsed?.kind, 'image');
  assert.equal(parsed?.delivery.url, 'data:image/png;base64,abc');
  assert.equal(parsed?.metadata.storageStatus, 'provider_direct');
});

test('parseDirectMediaArtifactPayload accepts direct artifact payloads', () => {
  const parsed = parseDirectMediaArtifactPayload({
    kind: 'video',
    title: '生成视频',
    delivery: {
      mode: 'provider_url',
      url: 'https://provider.example/video.mp4',
      expiresAt: '2026-06-01T10:00:00.000Z',
    },
    metadata: {
      storageStatus: 'provider_direct',
      mimeType: 'video/mp4',
    },
  });

  assert.equal(parsed?.kind, 'video');
  assert.equal(parsed?.delivery.mode, 'provider_url');
  assert.equal(parsed?.delivery.url, 'https://provider.example/video.mp4');
});

test('parseDirectMediaArtifactPayload normalizes omitted expiresAt to null', () => {
  const parsed = parseDirectMediaArtifactPayload({
    artifact: {
      kind: 'image',
      title: '生成图片',
      delivery: {
        mode: 'data_url',
        url: 'data:image/png;base64,abc',
      },
      metadata: {
        storageStatus: 'provider_direct',
        mimeType: 'image/png',
      },
    },
  });

  assert.equal(parsed?.delivery.expiresAt, null);
});

test('parseDirectMediaArtifactPayload sanitizes typed metadata fields', () => {
  const parsed = parseDirectMediaArtifactPayload({
    kind: 'image',
    title: '生成图片',
    delivery: {
      mode: 'data_url',
      url: 'data:image/png;base64,abc',
    },
    metadata: {
      storageStatus: 'provider_direct',
      width: 'wide',
      height: 1024,
      durationSeconds: Number.NaN,
      mimeType: 123,
      filename: 'image.png',
      providerTaskId: false,
      model: 'pi-default',
      customTraceId: 'trace-1',
    },
  });

  assert.ok(parsed);
  assert.equal('width' in parsed.metadata, false);
  assert.equal(parsed.metadata.height, 1024);
  assert.equal('durationSeconds' in parsed.metadata, false);
  assert.equal('mimeType' in parsed.metadata, false);
  assert.equal(parsed.metadata.filename, 'image.png');
  assert.equal('providerTaskId' in parsed.metadata, false);
  assert.equal(parsed.metadata.model, 'pi-default');
  assert.equal(parsed.metadata.customTraceId, 'trace-1');
  assert.equal(parsed.metadata.storageStatus, 'provider_direct');
});

test('parseStreamEventPayload returns null for invalid event JSON', () => {
  assert.equal(parseStreamEventPayload({ data: '{' } as MessageEvent), null);
});
