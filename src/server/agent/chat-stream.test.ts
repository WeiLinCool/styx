import assert from 'node:assert/strict';
import test from 'node:test';

import { createRunStreamEventBuilder } from './chat-stream';

test('createRunStreamEventBuilder increments sequences per run', () => {
  const builder = createRunStreamEventBuilder('run-1');

  const first = builder.next('run_started', { taskType: 'chat' });
  const second = builder.next('assistant_delta', { delta: 'hello' });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(first.runId, 'run-1');
  assert.equal(second.eventType, 'assistant_delta');
});

