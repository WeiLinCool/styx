import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAiModelCreateBody } from './route';

type AiModelBody = {
  providerId: string;
  code: string;
  name: string;
  model: string;
  status: 'enabled';
  supportsChat: boolean;
  supportsImageGeneration: boolean;
  supportsImageEdit: boolean;
  supportsImageUpscale: boolean;
};

const validBody: AiModelBody = {
  providerId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
  code: 'doubao-image',
  name: 'Doubao Image',
  model: 'doubao-seedream-3-0-t2i-250415',
  status: 'enabled',
  supportsChat: false,
  supportsImageGeneration: true,
  supportsImageEdit: true,
  supportsImageUpscale: false,
};

test('parseAiModelCreateBody parses image capability flags', async () => {
  const body = await parseAiModelCreateBody({
    json: async () => validBody,
  });

  assert.deepEqual(body, validBody);
});

test('parseAiModelCreateBody requires image capability flags', async () => {
  const bodyWithoutImageFlag: Partial<typeof validBody> = { ...validBody };
  delete bodyWithoutImageFlag.supportsImageUpscale;

  await assert.rejects(
    () =>
      parseAiModelCreateBody({
        json: async () => bodyWithoutImageFlag,
      }),
    ZodError,
  );
});
