import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentRunModelRequiredError } from '@/server/agent/run-service';
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
  parseCreateAgentRunBody,
  parseCreateAgentRunRequestBody,
  serviceErrorToResponse,
} from './route';

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
    taskType: 'image',
    prompt: '  帮我写提示词  ',
  });

  assert.deepEqual(parsed, {
    taskType: 'image',
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

test('serviceErrorToResponse maps model required errors to stable API code', async () => {
  const response = serviceErrorToResponse(new AgentRunModelRequiredError());
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'model_required');
});

test('serviceErrorToResponse maps model availability errors to stable API code', async () => {
  const response = serviceErrorToResponse(new ModelNotAvailableError());
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'model_not_available');
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
