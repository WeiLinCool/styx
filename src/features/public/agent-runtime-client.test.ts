import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRuntimeApiError,
  createAgentRun,
  createAgentRunEventsUrl,
  getAgentRunDetail,
  listImageModels,
  listChatModels,
  listVideoModels,
  parseDirectMediaArtifactPayload,
  parseImageModel,
  parseVideoModel,
  parseStreamEventPayload,
  selectImageModelId,
  selectChatModelId,
  type ChatModelOption,
  type ImageModelOption,
} from './agent-runtime-client';
import {
  decryptRequestBody,
  isEncryptedRequestEnvelope,
} from '@/lib/request-encryption';

function installFetchMock(payload: unknown) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(payload);

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function makeImageModel(overrides: Partial<ImageModelOption> = {}): ImageModelOption {
  return {
    id: 'model-image',
    code: 'image',
    name: 'Image',
    providerName: 'Development',
    isDefault: false,
    entitlementLabel: 'Free',
    pricingSummary: '5 credits minimum',
    supportedModes: ['generate'],
    ...overrides,
  };
}

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

test('listImageModels returns parsed image model options', async () => {
  const restore = installFetchMock({
    models: [
      {
        id: 'model-1',
        code: 'doubao-image',
        name: 'Doubao Image',
        providerName: 'Doubao',
        isDefault: true,
        entitlementLabel: 'Pro',
        pricingSummary: '5 credits minimum',
        supportedModes: ['generate', 'edit'],
      },
    ],
  });

  try {
    const models = await listImageModels('generate');
    assert.equal(models[0]?.id, 'model-1');
    assert.deepEqual(models[0]?.supportedModes, ['generate', 'edit']);
  } finally {
    restore();
  }
});

test('parseImageModel rejects malformed supported modes', () => {
  const validModel = makeImageModel();

  assert.equal(parseImageModel({ ...validModel, supportedModes: undefined }), null);
  assert.equal(parseImageModel({ ...validModel, supportedModes: [] }), null);
  assert.equal(parseImageModel({ ...validModel, supportedModes: ['generate', 'video'] }), null);
  assert.equal(parseImageModel({ ...validModel, supportedModes: 'generate' }), null);
});

test('parseVideoModel accepts chat model shape', () => {
  const model = parseVideoModel({
    id: 'video-model',
    code: 'seedance',
    name: 'Seedance',
    providerName: 'Doubao',
    isDefault: true,
    entitlementLabel: '会员',
    pricingSummary: '3 credits minimum',
  });

  assert.equal(model?.id, 'video-model');
});

test('listVideoModels returns parsed video model options', async () => {
  const restore = installFetchMock({
    models: [
      {
        id: 'model-video',
        code: 'doubao-seedance',
        name: 'Doubao Seedance',
        providerName: 'Doubao',
        isDefault: true,
        entitlementLabel: 'Free',
        pricingSummary: '3 credits minimum',
      },
    ],
  });

  try {
    const models = await listVideoModels();
    assert.equal(models[0]?.id, 'model-video');
  } finally {
    restore();
  }
});

test('listImageModels drops malformed image model options', async () => {
  const validModel = makeImageModel({ id: 'valid', supportedModes: ['generate', 'edit'] });
  const restore = installFetchMock({
    models: [
      { ...validModel, id: 'missing-modes', supportedModes: undefined },
      { ...validModel, id: 'invalid-mode', supportedModes: ['generate', 'video'] },
      validModel,
    ],
  });

  try {
    const models = await listImageModels('generate');

    assert.deepEqual(models.map((model) => model.id), ['valid']);
  } finally {
    restore();
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
  let requestBody: unknown = null;

  globalThis.fetch = async (_input, init) => {
    const encryptedBody = init?.body ? JSON.parse(String(init.body)) : null;
    assert.equal(isEncryptedRequestEnvelope(encryptedBody), true);
    const decryptedBody = isEncryptedRequestEnvelope(encryptedBody)
      ? await decryptRequestBody(encryptedBody)
      : null;
    requestBody = decryptedBody ? JSON.parse(decryptedBody) : null;
    return Response.json({
      run: {
        id: 'run-1',
        conversationId: 'run-1',
        taskType: 'image',
        status: 'succeeded',
        prompt: 'repair stone cat',
        finalMessage: '图片已生成，请及时下载保存。',
        errorMessage: null,
        capabilitySummary: { provider: 'doubao', model: 'doubao-image', capabilities: [] },
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
  };

  try {
    const result = await createAgentRun({
      taskType: 'image',
      prompt: 'repair stone cat',
      modelId: 'model-image-upscale',
      input: {
        mode: 'upscale',
        size: '1:1',
        scale: '2x',
        style: 'stone-print',
        sourceImageDataUrl: 'data:image/png;base64,SOURCE',
      },
    });

    assert.deepEqual(requestBody, {
      taskType: 'image',
      prompt: 'repair stone cat',
      modelId: 'model-image-upscale',
      input: {
        mode: 'upscale',
        size: '1:1',
        scale: '2x',
        style: 'stone-print',
        sourceImageDataUrl: 'data:image/png;base64,SOURCE',
      },
    });
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

test('selectImageModelId falls back to default compatible model', () => {
  const models = [
    makeImageModel({ id: 'a', isDefault: false }),
    makeImageModel({ id: 'b', isDefault: true }),
  ];

  assert.equal(selectImageModelId(models, 'missing'), 'b');
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
