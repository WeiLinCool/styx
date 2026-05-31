import assert from 'node:assert/strict';
import test from 'node:test';

import { formatChatModelLabel } from './chat-message-format';

test('formatChatModelLabel returns only model name without provider prefix', () => {
  assert.equal(formatChatModelLabel('GPT-4o'), 'GPT-4o');
});

test('formatChatModelLabel returns undefined for empty model name', () => {
  assert.equal(formatChatModelLabel(''), undefined);
  assert.equal(formatChatModelLabel(undefined), undefined);
});
