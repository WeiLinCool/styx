import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAiModelConfigTestBody } from './route';

test('parseAiModelConfigTestBody accepts optional prompt body', async () => {
  const body = await parseAiModelConfigTestBody({
    json: async () => ({
      prompt: '请为石头印画设计一句标题',
    }),
  });

  assert.deepEqual(body, {
    prompt: '请为石头印画设计一句标题',
  });
});
