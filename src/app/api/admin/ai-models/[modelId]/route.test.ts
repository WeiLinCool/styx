import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAiModelUpdateBody } from './route';

const validBody = {
  providerId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
  code: 'doubao-image',
  name: 'Doubao Image',
  model: 'doubao-seedream-3-0-t2i-250415',
  status: 'enabled',
  supportsChat: false,
  supportsImageGeneration: true,
  supportsImageEdit: true,
  supportsImageUpscale: false,
} as const;

test('parseAiModelUpdateBody parses image capability flags', async () => {
  const body = await parseAiModelUpdateBody({
    json: async () => validBody,
  });

  assert.deepEqual(body, validBody);
});

test('parseAiModelUpdateBody requires image capability flags', async () => {
  const bodyWithoutImageFlag: Partial<typeof validBody> = { ...validBody };
  delete bodyWithoutImageFlag.supportsImageEdit;

  await assert.rejects(
    () =>
      parseAiModelUpdateBody({
        json: async () => bodyWithoutImageFlag,
      }),
    ZodError,
  );
});
