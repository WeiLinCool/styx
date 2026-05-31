import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAiModelDefaultParams } from './route';

test('parseAiModelDefaultParams parses valid model id params', async () => {
  const params = await parseAiModelDefaultParams(
    Promise.resolve({ modelId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4' }),
  );

  assert.deepEqual(params, {
    modelId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
  });
});

test('parseAiModelDefaultParams rejects invalid model ids', async () => {
  await assert.rejects(
    () => parseAiModelDefaultParams(Promise.resolve({ modelId: 'not-a-uuid' })),
    ZodError,
  );
});
