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
  executionProtocol: 'chat_openai_compatible' | 'image_openai_compatible' | 'video_task_polling';
  supportsChat: boolean;
  supportsImageGeneration: boolean;
  supportsImageEdit: boolean;
  supportsImageUpscale: boolean;
  supportsVideoGeneration: boolean;
};

const validBody: AiModelBody = {
  providerId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
  code: 'doubao-image',
  name: 'Doubao Image',
  model: 'doubao-seedream-3-0-t2i-250415',
  status: 'enabled',
  executionProtocol: 'image_openai_compatible',
  supportsChat: false,
  supportsImageGeneration: true,
  supportsImageEdit: true,
  supportsImageUpscale: false,
  supportsVideoGeneration: false,
};

test('parseAiModelCreateBody parses image capability flags with execution protocol', async () => {
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

test('parseAiModelCreateBody requires video capability flag', async () => {
  const bodyWithoutVideoFlag: Partial<typeof validBody> = { ...validBody };
  delete bodyWithoutVideoFlag.supportsVideoGeneration;

  await assert.rejects(
    () =>
      parseAiModelCreateBody({
        json: async () => bodyWithoutVideoFlag,
      }),
    ZodError,
  );
});

test('parseAiModelCreateBody requires execution protocol', async () => {
  const bodyWithoutProtocol: Partial<typeof validBody> = { ...validBody };
  delete bodyWithoutProtocol.executionProtocol;

  await assert.rejects(
    () =>
      parseAiModelCreateBody({
        json: async () => bodyWithoutProtocol,
      }),
    ZodError,
  );
});

test('parseAiModelCreateBody rejects invalid image protocol combinations', async () => {
  await assert.rejects(
    () =>
      parseAiModelCreateBody({
        json: async () => ({
          ...validBody,
          executionProtocol: 'chat_openai_compatible',
          supportsVideoGeneration: false,
        }),
      }),
    /image execution protocol/,
  );
});
