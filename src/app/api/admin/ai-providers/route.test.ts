import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAiProviderCreateBody } from './route';

type AiProviderBody = {
  code: string;
  name: string;
  providerType: 'openai_compatible';
  baseUrl: string;
  credentialEnvKey: string;
  status: 'disabled';
  billingRules: {
    video: {
      mode: 'provider_usage_tokens';
      tokenCreditsPer1k: number;
      minimumCredits: number;
    };
  };
};

const validBody: AiProviderBody = {
  code: 'doubao',
  name: 'Doubao',
  providerType: 'openai_compatible',
  baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  credentialEnvKey: 'DOUBAO_API_KEY',
  status: 'disabled',
  billingRules: {
    video: {
      mode: 'provider_usage_tokens',
      tokenCreditsPer1k: 1,
      minimumCredits: 3,
    },
  },
};

test('parseAiProviderCreateBody parses provider billing rules', async () => {
  const body = await parseAiProviderCreateBody({
    json: async () => validBody,
  });

  assert.deepEqual(body, validBody);
});

test('parseAiProviderCreateBody rejects invalid provider billing rules', async () => {
  const bodyWithInvalidRules = {
    ...validBody,
    billingRules: {
      video: {
        mode: 'provider_usage_tokens',
        tokenCreditsPer1k: -1,
        minimumCredits: 3,
      },
    },
  };

  await assert.rejects(
    () =>
      parseAiProviderCreateBody({
        json: async () => bodyWithInvalidRules,
      }),
    ZodError,
  );
});
