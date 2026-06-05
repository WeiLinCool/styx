import assert from 'node:assert/strict';
import test from 'node:test';

import { formatChatModelLabel, formatChatUsageLabel } from './chat-message-format';

test('formatChatModelLabel returns only model name without provider prefix', () => {
  assert.equal(formatChatModelLabel('GPT-4o'), 'GPT-4o');
});

test('formatChatModelLabel returns undefined for empty model name', () => {
  assert.equal(formatChatModelLabel(''), undefined);
  assert.equal(formatChatModelLabel(undefined), undefined);
});

test('formatChatUsageLabel hides token usage in chat messages', () => {
  assert.equal(
    formatChatUsageLabel({ promptTokens: 10, completionTokens: 20, totalTokens: 30 }),
    undefined,
  );
});

test('formatChatUsageLabel returns undefined when usage is not available', () => {
  assert.equal(formatChatUsageLabel(null), undefined);
  assert.equal(formatChatUsageLabel(undefined), undefined);
});
