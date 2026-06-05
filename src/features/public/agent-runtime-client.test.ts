import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentRuntimeApiError,
  createConversationFolder,
  createAgentRun,
  createAgentRunEventsUrl,
  deleteConversationFolder,
  disableMediaShare,
  enableMediaShare,
  getAgentRunDetail,
  getPublicSharedMedia,
  listAgentConversations,
  listSavedMediaAssets,
  listImageModels,
  listChatModels,
  listVideoModels,
  parseDirectMediaArtifactPayload,
  parseImageModel,
  parseVideoModel,
  parseStreamEventPayload,
  saveGeneratedMedia,
  syncAgentRun,
  selectImageModelId,
  selectChatModelId,
  updateAgentConversation,
  updateConversationFolder,
  uploadUserMedia,
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

test('listChatModels drops malformed model rows', async () => {
  const restore = installFetchMock({
    models: [
      { id: 'broken' },
      {
        id: 'model-1',
        code: 'chat-1',
        name: 'Chat One',
        providerName: 'Development',
        isDefault: true,
        entitlementLabel: 'Free',
        pricingSummary: '1 credit minimum',
      },
    ],
  });

  try {
    const models = await listChatModels();
    assert.deepEqual(models.map((model) => model.id), ['model-1']);
  } finally {
    restore();
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

test('listVideoModels returns empty array for an empty payload', async () => {
  const restore = installFetchMock({ models: [] });

  try {
    const models = await listVideoModels();
    assert.deepEqual(models, []);
  } finally {
    restore();
  }
});

test('listAgentConversations returns folders and conversations', async () => {
  const restore = installFetchMock({
    folders: [
      {
        id: 'folder-1',
        name: '项目',
        sortOrder: 0,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    ],
    conversations: [
      {
        id: 'conversation-1',
        folderId: 'folder-1',
        title: '自定义标题',
        autoTitle: '自动标题',
        titleOverride: '自定义标题',
        lastRunAt: '2026-06-05T00:00:00.000Z',
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    ],
  });

  try {
    const list = await listAgentConversations();
    assert.equal(list.folders[0]?.name, '项目');
    assert.equal(list.conversations[0]?.title, '自定义标题');
  } finally {
    restore();
  }
});

test('conversation organization mutations return typed payloads', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string | undefined }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), method: init?.method });
    if (String(input).includes('/conversation-folders') && init?.method !== 'DELETE') {
      return Response.json({
        folder: {
          id: 'folder-1',
          name: '项目',
          sortOrder: 0,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      });
    }
    if (String(input).includes('/conversation-folders') && init?.method === 'DELETE') {
      return Response.json({
        folder: {
          id: 'folder-1',
          name: '项目',
          sortOrder: 0,
          createdAt: '2026-06-05T00:00:00.000Z',
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      });
    }
    return Response.json({
      conversation: {
        id: 'conversation-1',
        folderId: null,
        title: '标题',
        autoTitle: '自动标题',
        titleOverride: '标题',
        lastRunAt: '2026-06-05T00:00:00.000Z',
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    });
  };

  try {
    assert.equal((await createConversationFolder('项目')).name, '项目');
    assert.equal((await updateConversationFolder('folder-1', '项目')).id, 'folder-1');
    assert.equal((await deleteConversationFolder('folder-1')).id, 'folder-1');
    assert.equal((await updateAgentConversation('conversation-1', { titleOverride: '标题' })).title, '标题');
    assert.deepEqual(
      requests.map((request) => request.method),
      ['POST', 'PATCH', 'DELETE', 'PATCH'],
    );
  } finally {
    globalThis.fetch = originalFetch;
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

test('syncAgentRun returns synced run payload from API', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      run: {
        id: 'run-video-1',
        conversationId: 'run-video-1',
        taskType: 'video',
        status: 'running',
        prompt: 'stone video',
        finalMessage: null,
        errorMessage: null,
        capabilitySummary: { provider: 'doubao', model: 'seedance', capabilities: [] },
        selectedModel: null,
        usage: null,
        billing: null,
        artifacts: [],
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:01.000Z',
      },
    });

  try {
    const run = await syncAgentRun('run-video-1');
    assert.equal(run.id, 'run-video-1');
    assert.equal(run.taskType, 'video');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saveGeneratedMedia returns saved asset payload and artifact save state', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      asset: {
        id: 'asset-1',
        userId: 'user-1',
        runId: 'run-1',
        conversationId: 'conversation-1',
        artifactId: 'artifact-1',
        kind: 'image',
        title: '生成图片',
        sourceProvider: 'doubao',
        sourceModel: 'seedream-3',
        sourceUrl: null,
        sourceExpiresAt: null,
        storageProvider: 'tencent_cos',
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: 'key',
        mimeType: 'image/png',
        byteSize: 1024,
        width: 512,
        height: 512,
        durationSeconds: null,
        status: 'ready',
        metadata: {},
        saveRequestedAt: '2026-06-03T12:00:00.000Z',
        savedAt: '2026-06-03T12:00:01.000Z',
        deletedAt: null,
        createdAt: '2026-06-03T12:00:00.000Z',
        updatedAt: '2026-06-03T12:00:01.000Z',
      },
      artifact: {
        id: 'artifact-1',
        kind: 'image',
        title: '生成图片',
        status: 'ready',
        body: null,
        url: null,
        metadata: { saveStatus: 'saved', savedAssetId: 'asset-1' },
        createdAt: '2026-06-03T12:00:00.000Z',
      },
    });

  try {
    const result = await saveGeneratedMedia({ runId: 'run-1', artifactId: 'artifact-1' });
    assert.equal(result.asset.id, 'asset-1');
    assert.equal(result.artifact.metadata.saveStatus, 'saved');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listSavedMediaAssets returns saved asset rows from API payload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      assets: [
        {
          id: 'asset-1',
          userId: 'user-1',
          runId: 'run-1',
          conversationId: 'conversation-1',
          artifactId: 'artifact-1',
          kind: 'image',
          title: '生成图片',
          sourceType: 'ai_generated',
          sourceProvider: 'doubao',
          sourceModel: 'seedream-3',
          sourceUrl: null,
          sourceExpiresAt: null,
          originalFilename: null,
          sha256: null,
          shareId: null,
          shareStatus: 'disabled',
          sharedAt: null,
          storageProvider: 'tencent_cos',
          bucket: 'bucket-a',
          region: 'ap-shanghai',
          objectKey: 'key',
          mimeType: 'image/png',
          byteSize: 1024,
          width: 512,
          height: 512,
          durationSeconds: null,
          status: 'ready',
          metadata: {},
          saveRequestedAt: '2026-06-03T12:00:00.000Z',
          savedAt: '2026-06-03T12:00:01.000Z',
          deletedAt: null,
          createdAt: '2026-06-03T12:00:00.000Z',
          updatedAt: '2026-06-03T12:00:01.000Z',
        },
      ],
    });

  try {
    const assets = await listSavedMediaAssets();
    assert.equal(assets.length, 1);
    assert.equal(assets[0]?.id, 'asset-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uploadUserMedia returns uploaded asset payload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      asset: {
        id: 'asset-upload-1',
        userId: 'user-1',
        runId: null,
        conversationId: null,
        artifactId: null,
        kind: 'image',
        title: 'photo',
        sourceType: 'user_uploaded',
        sourceProvider: null,
        sourceModel: null,
        sourceUrl: null,
        sourceExpiresAt: null,
        originalFilename: 'photo.png',
        sha256: 'sha256-1',
        shareId: null,
        shareStatus: 'disabled',
        sharedAt: null,
        storageProvider: 'tencent_cos',
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: 'key',
        mimeType: 'image/png',
        byteSize: 1024,
        width: null,
        height: null,
        durationSeconds: null,
        status: 'ready',
        metadata: {},
        saveRequestedAt: '2026-06-04T10:00:00.000Z',
        savedAt: '2026-06-04T10:00:00.000Z',
        deletedAt: null,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T10:00:00.000Z',
      },
    });

  try {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    const result = await uploadUserMedia({ file });
    assert.equal(result.id, 'asset-upload-1');
    assert.equal(result.sourceType, 'user_uploaded');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enableMediaShare returns share metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      asset: {
        id: 'asset-1',
        userId: 'user-1',
        runId: null,
        conversationId: null,
        artifactId: null,
        kind: 'image',
        title: 'share me',
        sourceType: 'user_uploaded',
        sourceProvider: null,
        sourceModel: null,
        sourceUrl: null,
        sourceExpiresAt: null,
        originalFilename: 'photo.png',
        sha256: 'sha256-1',
        shareId: 'share-1',
        shareStatus: 'active',
        sharedAt: '2026-06-04T10:00:00.000Z',
        storageProvider: 'tencent_cos',
        bucket: 'bucket-a',
        region: 'ap-shanghai',
        objectKey: 'key',
        mimeType: 'image/png',
        byteSize: 1024,
        width: null,
        height: null,
        durationSeconds: null,
        status: 'ready',
        metadata: {},
        saveRequestedAt: '2026-06-04T10:00:00.000Z',
        savedAt: '2026-06-04T10:00:00.000Z',
        deletedAt: null,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T10:00:00.000Z',
      },
      share: {
        shareId: 'share-1',
        url: 'https://example.com/shared/media/share-1',
      },
    });

  try {
    const result = await enableMediaShare('asset-1');
    assert.equal(result.share.shareId, 'share-1');
    assert.equal(result.asset.shareStatus, 'active');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getPublicSharedMedia returns share payload for public page', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      asset: {
        id: 'asset-1',
        title: 'Shared image',
        kind: 'image',
        mimeType: 'image/png',
        byteSize: 128,
        width: 64,
        height: 64,
        durationSeconds: null,
        shareId: 'share-1',
        shareStatus: 'active',
      },
      access: {
        url: 'https://signed.example/object',
        expiresAt: '2026-06-04T10:10:00.000Z',
      },
    });

  try {
    const result = await getPublicSharedMedia('share-1');
    assert.equal(result.asset.id, 'asset-1');
    assert.equal(result.access.url, 'https://signed.example/object');
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

test('selectChatModelId can be reused for video models with default fallback', () => {
  const models: ChatModelOption[] = [
    {
      id: 'video-fast',
      code: 'video-fast',
      name: 'Fast',
      providerName: 'Doubao',
      isDefault: false,
      entitlementLabel: 'Free',
      pricingSummary: '3 credits minimum',
    },
    {
      id: 'video-default',
      code: 'video-default',
      name: 'Default',
      providerName: 'Doubao',
      isDefault: true,
      entitlementLabel: 'Free',
      pricingSummary: '5 credits minimum',
    },
  ];

  assert.equal(selectChatModelId(models, 'missing-video-model'), 'video-default');
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
