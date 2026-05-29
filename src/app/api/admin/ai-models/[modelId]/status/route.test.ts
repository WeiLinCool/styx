import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAiModelStatusBody } from './route';

test('parseAiModelStatusBody parses supported model status values', async () => {
  const body = await parseAiModelStatusBody({
    json: async () => ({ status: 'disabled' }),
  });

  assert.deepEqual(body, { status: 'disabled' });
});

test('parseAiModelStatusBody rejects archived mutation through operational control', async () => {
  await assert.rejects(
    () =>
      parseAiModelStatusBody({
        json: async () => ({ status: 'archived' }),
      }),
    ZodError,
  );
});
