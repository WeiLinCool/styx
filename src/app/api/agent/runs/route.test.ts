import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentConversationNotFoundError,
  AgentRunImageSizeInvalidError,
  AgentRunModelRequiredError,
} from '@/server/agent/run-service';
import {
  ProviderConfigurationError,
  ProviderRequestError,
} from '@/server/ai/provider-adapters';
import { InsufficientCreditsError } from '@/server/billing/credits';
import {
  ModelEntitlementRequiredError,
  ModelNotAvailableError,
} from '@/server/repositories/ai-models';
import {
  createAgentRunResponse,
  createDeleteAgentRunResponse,
  createListAgentRunsRouteHandlers,
  parseAgentRunTaskTypeFilter,
  parseCreateAgentRunBody,
  parseCreateAgentRunRawBody,
  parseCreateAgentRunRequestBody,
  serviceErrorToResponse,
} from './route';
import { createSyncAgentRunResponse } from './[runId]/sync/route';

test('createSyncAgentRunResponse returns synced run payload', async () => {
  const response = createSyncAgentRunResponse({
    id: 'run-1',
    conversationId: 'run-1',
    taskType: 'video',
    status: 'running',
    prompt: 'hello',
    finalMessage: null,
    errorMessage: null,
    capabilitySummary: { provider: 'doubao', model: 'seedance', capabilities: [] },
    selectedModel: null,
    usage: null,
    billing: null,
    artifacts: [],
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.run.id, 'run-1');
  assert.equal(body.run.taskType, 'video');
});

test('parseAgentRunTaskTypeFilter accepts multimodal filters only', () => {
  assert.equal(parseAgentRunTaskTypeFilter('image'), 'image');
  assert.equal(parseAgentRunTaskTypeFilter('video'), 'video');
  assert.equal(parseAgentRunTaskTypeFilter(null), undefined);
  assert.equal(parseAgentRunTaskTypeFilter(''), undefined);
  assert.throws(() => parseAgentRunTaskTypeFilter('chat'), /Invalid taskType/);
  assert.throws(() => parseAgentRunTaskTypeFilter('bad'), /Invalid taskType/);
});

test('GET /api/agent/runs passes optional taskType filter to repository list', async () => {
  const calls: Array<{ userId: string; taskType: string | undefined }> = [];
  const handlers = createListAgentRunsRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    listRuns: async (userId, options) => {
      calls.push({ userId, taskType: options?.taskType });
      return [
        {
          id: 'run-image',
          conversationId: 'run-image',
          taskType: 'image',
          status: 'succeeded',
          prompt: '山水',
          finalMessage: '完成',
          errorMessage: null,
          capabilitySummary: { provider: 'doubao', model: 'seedream', capabilities: [] },
          selectedModel: null,
          usage: null,
          billing: null,
          artifacts: [],
          createdAt: '2026-06-06T00:00:00.000Z',
          updatedAt: '2026-06-06T00:00:00.000Z',
        },
      ];
    },
  });

  const response = await handlers.GET(new Request('https://example.com/api/agent/runs?taskType=image'));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.runs[0].id, 'run-image');
  assert.deepEqual(calls, [{ userId: 'user-1', taskType: 'image' }]);
});

test('GET /api/agent/runs rejects invalid taskType filter', async () => {
  const handlers = createListAgentRunsRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    listRuns: async () => {
      throw new Error('list should not be called');
    },
  });

  const response = await handlers.GET(new Request('https://example.com/api/agent/runs?taskType=bad'));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'invalid_request');
});

test('parseCreateAgentRunBody accepts valid chat request', () => {
  const parsed = parseCreateAgentRunBody({
    taskType: 'chat',
    prompt: '帮我写提示词',
    modelId: 'seed-model-free',
    input: { source: 'chat' },
  });

  assert.deepEqual(parsed, {
    taskType: 'chat',
    prompt: '帮我写提示词',
    modelId: 'seed-model-free',
    input: { source: 'chat' },
  });
});

test('parseCreateAgentRunBody rejects empty prompt', () => {
  assert.throws(
    () => parseCreateAgentRunBody({ taskType: 'chat', prompt: '   ' }),
    /Prompt is required/,
  );
});

test('parseCreateAgentRunBody trims prompt and defaults input', () => {
  const parsed = parseCreateAgentRunBody({
    taskType: 'workflow',
    prompt: '  帮我写提示词  ',
  });

  assert.deepEqual(parsed, {
    taskType: 'workflow',
    prompt: '帮我写提示词',
    input: {},
  });
});

test('parseCreateAgentRunBody requires modelId for chat request', () => {
  assert.throws(
    () => parseCreateAgentRunBody({ taskType: 'chat', prompt: 'hello' }),
    /modelId is required/,
  );
});

test('parseCreateAgentRunBody accepts chat modelId', () => {
  const parsed = parseCreateAgentRunBody({
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
  });

  assert.equal(parsed.modelId, 'seed-model-free');
});

test('parseCreateAgentRunRawBody requires modelId for image requests', () => {
  assert.throws(
    () => parseCreateAgentRunRawBody({ taskType: 'image', prompt: '山水', input: { mode: 'generate' } }),
    /modelId is required/,
  );
});

test('parseCreateAgentRunRawBody requires modelId for video requests', () => {
  assert.throws(
    () => parseCreateAgentRunRawBody({ taskType: 'video', prompt: '山水动起来', input: { duration: 5 } }),
    /modelId is required/,
  );
});

test('parseCreateAgentRunRawBody accepts canonical video input fields', () => {
  const parsed = parseCreateAgentRunRawBody({
    taskType: 'video',
    prompt: '山水动起来',
    modelId: 'video-model-1',
    input: {
      durationSeconds: 5,
      resolution: '720p',
      styleCode: 'stone',
      imageAssetId: '11111111-1111-4111-8111-111111111111',
      audioAssetId: '22222222-2222-4222-8222-222222222222',
    },
  });

  assert.deepEqual(parsed.input, {
    durationSeconds: 5,
    resolution: '720p',
    styleCode: 'stone',
    imageAssetId: '11111111-1111-4111-8111-111111111111',
    audioAssetId: '22222222-2222-4222-8222-222222222222',
  });
});

test('parseCreateAgentRunRawBody rejects non-number video duration', () => {
  assert.throws(
    () =>
      parseCreateAgentRunRawBody({
        taskType: 'video',
        prompt: '山水动起来',
        modelId: 'video-model-1',
        input: { durationSeconds: '5', resolution: '720p' },
      }),
    /durationSeconds/,
  );
});

test('parseCreateAgentRunRawBody rejects invalid video material IDs', () => {
  assert.throws(
    () =>
      parseCreateAgentRunRawBody({
        taskType: 'video',
        prompt: '山水动起来',
        modelId: 'video-model-1',
        input: {
          durationSeconds: 5,
          resolution: '720p',
          imageAssetId: 'not-a-uuid',
        },
      }),
    /imageAssetId/,
  );
});

test('parseCreateAgentRunRawBody requires source image for edit mode', () => {
  assert.throws(
    () =>
      parseCreateAgentRunRawBody({
        taskType: 'image',
        prompt: '水墨风',
        modelId: 'model-1',
        input: { mode: 'edit' },
      }),
    /source image is required/,
  );
});

test('parseCreateAgentRunRawBody requires source image for upscale mode', () => {
  assert.throws(
    () =>
      parseCreateAgentRunRawBody({
        taskType: 'image',
        prompt: '放大图片',
        modelId: 'model-1',
        input: { mode: 'upscale' },
      }),
    /source image is required/,
  );
});

test('parseCreateAgentRunBody preserves non-chat requests without modelId', () => {
  const parsed = parseCreateAgentRunBody({
    taskType: 'workflow',
    prompt: 'build workflow',
  });

  assert.deepEqual(parsed, {
    taskType: 'workflow',
    prompt: 'build workflow',
    input: {},
  });
});

test('parseCreateAgentRunRequestBody rejects malformed JSON as invalid request', async () => {
  await assert.rejects(
    () =>
      parseCreateAgentRunRequestBody(
        new Request('http://localhost/api/agent/runs', {
          method: 'POST',
          body: '{"taskType":"chat",',
          headers: { 'content-type': 'application/json' },
        }),
      ),
    /Invalid JSON request body/,
  );
});

test('createAgentRunResponse returns run with transient artifacts', async () => {
  const response = createAgentRunResponse({
    run: {
      id: 'run-1',
      conversationId: 'run-1',
      taskType: 'image',
      status: 'succeeded',
      prompt: 'stone cat',
      finalMessage: '图片已生成，请及时下载保存。',
      errorMessage: null,
      capabilitySummary: { provider: 'pi', model: 'pi-default', capabilities: [] },
      selectedModel: null,
      usage: null,
      billing: null,
      artifacts: [
        {
          id: 'artifact-1',
          kind: 'image',
          title: '生成图片',
          status: 'ready',
          body: null,
          url: null,
          metadata: { transient: true, mimeType: 'image/png' },
          createdAt: '2026-05-31T00:00:00.000Z',
        },
      ],
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z',
    },
    transientArtifacts: [
      {
        kind: 'image',
        title: '生成图片',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,abc',
        metadata: { transient: true, width: 1024, height: 1024 },
      },
    ],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.run.artifacts[0].body, null);
  assert.equal(body.run.artifacts[0].url, null);
  assert.equal(body.transientArtifacts[0].dataUrl, 'data:image/png;base64,abc');
});

test('serviceErrorToResponse maps model required errors to stable API code', async () => {
  const response = serviceErrorToResponse(new AgentRunModelRequiredError());
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'model_required');
});

test('serviceErrorToResponse maps invalid image size to invalid request', async () => {
  const response = serviceErrorToResponse(new AgentRunImageSizeInvalidError());
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'invalid_request');
  assert.match(body.error.message, /image size/);
});

test('serviceErrorToResponse maps model availability errors to stable API code', async () => {
  const response = serviceErrorToResponse(new ModelNotAvailableError());
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'model_not_available');
});

test('serviceErrorToResponse maps missing conversation to stable API code', async () => {
  const response = serviceErrorToResponse(new AgentConversationNotFoundError());
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'conversation_not_found');
});

test('serviceErrorToResponse maps model entitlement errors to stable API code', async () => {
  const response = serviceErrorToResponse(new ModelEntitlementRequiredError());
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, 'model_entitlement_required');
});

test('serviceErrorToResponse maps billing and provider errors to stable API codes', async () => {
  const cases = [
    {
      error: new InsufficientCreditsError(),
      status: 402,
      code: 'insufficient_credits',
    },
    {
      error: new ProviderConfigurationError('missing key'),
      status: 503,
      code: 'provider_unconfigured',
    },
    {
      error: new ProviderRequestError('provider failed'),
      status: 502,
      code: 'provider_error',
    },
  ];

  for (const item of cases) {
    const response = serviceErrorToResponse(item.error);
    const body = await response.json();

    assert.equal(response.status, item.status);
    assert.equal(body.error.code, item.code);
  }
});

test('serviceErrorToResponse returns localized fallback message for unexpected internal errors', async () => {
  const response = serviceErrorToResponse(new Error('unexpected failure'));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error.code, 'internal_error');
  assert.equal(body.error.message, 'AI 请求失败，请稍后再试');
});

test('createDeleteAgentRunResponse returns deleted run payload', async () => {
  const response = createDeleteAgentRunResponse({
    id: 'run-1',
    conversationId: 'run-1',
    taskType: 'chat',
    status: 'succeeded',
    prompt: 'hello',
    finalMessage: 'hi',
    errorMessage: null,
    capabilitySummary: { provider: 'pi', model: 'pi-default', capabilities: [] },
    selectedModel: null,
    usage: null,
    billing: null,
    artifacts: [],
    createdAt: '2026-05-31T00:00:00.000Z',
    updatedAt: '2026-05-31T00:00:00.000Z',
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.run.id, 'run-1');
});

test('createDeleteAgentRunResponse returns not found for missing or already deleted run', async () => {
  const response = createDeleteAgentRunResponse(null);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'run_not_found');
});
