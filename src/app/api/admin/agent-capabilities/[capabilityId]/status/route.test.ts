import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAgentCapabilityStatusBody } from './route';

test('parseAgentCapabilityStatusBody parses supported status values', async () => {
  const body = await parseAgentCapabilityStatusBody({
    json: async () => ({ status: 'disabled' }),
  });

  assert.deepEqual(body, { status: 'disabled' });
});

test('parseAgentCapabilityStatusBody treats malformed JSON as validation error', async () => {
  await assert.rejects(
    () =>
      parseAgentCapabilityStatusBody({
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      }),
    ZodError,
  );
});
