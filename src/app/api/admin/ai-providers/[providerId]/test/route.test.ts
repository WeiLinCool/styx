import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseProviderConfigTestBody } from './route';

test('parseProviderConfigTestBody requires a selected model id', async () => {
  await assert.rejects(
    () =>
      parseProviderConfigTestBody({
        json: async () => ({}),
      }),
    ZodError,
  );
});

test('parseProviderConfigTestBody accepts a valid model id', async () => {
  const body = await parseProviderConfigTestBody({
    json: async () => ({ modelId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4' }),
  });

  assert.deepEqual(body, {
    modelId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
  });
});

test('parseProviderConfigTestBody keeps optional prompt for loop test', async () => {
  const body = await parseProviderConfigTestBody({
    json: async () => ({
      modelId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
      prompt: '请为石头印画设计一句标题',
    }),
  });

  assert.deepEqual(body, {
    modelId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
    prompt: '请为石头印画设计一句标题',
  });
});
