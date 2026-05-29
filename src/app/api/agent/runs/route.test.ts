import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCreateAgentRunBody, parseCreateAgentRunRequestBody } from './route';

test('parseCreateAgentRunBody accepts valid chat request', () => {
  const parsed = parseCreateAgentRunBody({
    taskType: 'chat',
    prompt: '帮我写提示词',
    input: { source: 'chat' },
  });

  assert.deepEqual(parsed, {
    taskType: 'chat',
    prompt: '帮我写提示词',
    input: { source: 'chat' },
  });
});

test('parseCreateAgentRunBody rejects empty prompt', () => {
  assert.throws(
    () => parseCreateAgentRunBody({ taskType: 'chat', prompt: '   ' }),
    /Prompt is required/,
  );
});

test('parseCreateAgentRunBody trims prompt and defaults input', () => {
  const parsed = parseCreateAgentRunBody({
    taskType: 'chat',
    prompt: '  帮我写提示词  ',
  });

  assert.deepEqual(parsed, {
    taskType: 'chat',
    prompt: '帮我写提示词',
    input: {},
  });
});

test('parseCreateAgentRunRequestBody rejects malformed JSON as invalid request', async () => {
  await assert.rejects(
    () =>
      parseCreateAgentRunRequestBody(
        new Request('http://localhost/api/agent/runs', {
          method: 'POST',
          body: '{"taskType":"chat",',
          headers: { 'content-type': 'application/json' },
        }),
      ),
    /Invalid JSON request body/,
  );
});
