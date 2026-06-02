import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAiProviderUpdateBody } from './route';

type AiProviderBody = {
  code: string;
  name: string;
  providerType: 'openai_compatible';
  baseUrl: string;
  credentialEnvKey: string;
  status: 'enabled';
  billingRules: {
    chat: {
      mode: 'token_breakdown';
      inputCreditsPer1k: number;
      cachedInputCreditsPer1k: number;
      cacheMissInputCreditsPer1k: number;
      outputCreditsPer1k: number;
      minimumCredits: number;
    };
  };
};

const validBody: AiProviderBody = {
  code: 'deepseek',
  name: 'DeepSeek',
  providerType: 'openai_compatible',
  baseUrl: 'https://api.deepseek.com',
  credentialEnvKey: 'DEEPSEEK_API_KEY',
  status: 'enabled',
  billingRules: {
    chat: {
      mode: 'token_breakdown',
      inputCreditsPer1k: 2,
      cachedInputCreditsPer1k: 0.5,
      cacheMissInputCreditsPer1k: 2,
      outputCreditsPer1k: 8,
      minimumCredits: 1,
    },
  },
};

test('parseAiProviderUpdateBody parses provider billing rules', async () => {
  const body = await parseAiProviderUpdateBody({
    json: async () => validBody,
  });

  assert.deepEqual(body, validBody);
});

test('parseAiProviderUpdateBody rejects invalid provider billing rules', async () => {
  const bodyWithInvalidRules = {
    ...validBody,
    billingRules: {
      chat: {
        ...validBody.billingRules.chat,
        outputCreditsPer1k: -8,
      },
    },
  };

  await assert.rejects(
    () =>
      parseAiProviderUpdateBody({
        json: async () => bodyWithInvalidRules,
      }),
    ZodError,
  );
});
