import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAdminVideoGenerationConfigBody } from './route';

const validBody = {
  styles: [
    {
      code: 'stone',
      name: '石头印画',
      prompt: '石头印画动态短片',
      enabled: true,
      sortOrder: 1,
    },
  ],
};

test('parseAdminVideoGenerationConfigBody accepts style preset list', async () => {
  const body = await parseAdminVideoGenerationConfigBody({
    json: async () => validBody,
  });

  assert.deepEqual(body, validBody);
});

test('parseAdminVideoGenerationConfigBody rejects blank style code', async () => {
  await assert.rejects(
    () =>
      parseAdminVideoGenerationConfigBody({
        json: async () => ({
          styles: [{ ...validBody.styles[0], code: '   ' }],
        }),
      }),
    ZodError,
  );
});

test('parseAdminVideoGenerationConfigBody rejects blank style name', async () => {
  await assert.rejects(
    () =>
      parseAdminVideoGenerationConfigBody({
        json: async () => ({
          styles: [{ ...validBody.styles[0], name: '' }],
        }),
      }),
    ZodError,
  );
});

test('parseAdminVideoGenerationConfigBody rejects blank style prompt', async () => {
  await assert.rejects(
    () =>
      parseAdminVideoGenerationConfigBody({
        json: async () => ({
          styles: [{ ...validBody.styles[0], prompt: '  ' }],
        }),
      }),
    ZodError,
  );
});
