import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUnavailableModelMessage,
  createInitialModelAvailabilityState,
  reconcileSelectedModelId,
} from './model-availability';

test('reconcileSelectedModelId keeps a valid prior selection', () => {
  const models = [
    { id: 'a', isDefault: false },
    { id: 'b', isDefault: true },
  ];

  assert.equal(reconcileSelectedModelId(models, 'a'), 'a');
});

test('reconcileSelectedModelId falls back to default then first item', () => {
  assert.equal(
    reconcileSelectedModelId(
      [
        { id: 'a', isDefault: false },
        { id: 'b', isDefault: true },
      ],
      'missing',
    ),
    'b',
  );
  assert.equal(reconcileSelectedModelId([{ id: 'a', isDefault: false }], null), 'a');
  assert.equal(reconcileSelectedModelId([], null), null);
});

test('reconcileSelectedModelId switches to default when the previous chat model disappears', () => {
  const models = [
    { id: 'chat-free', isDefault: false },
    { id: 'chat-pro', isDefault: true },
  ];

  assert.equal(reconcileSelectedModelId(models, 'missing-chat-model'), 'chat-pro');
});

test('reconcileSelectedModelId returns null when an image mode has no available models', () => {
  assert.equal(reconcileSelectedModelId([], 'missing-image-model'), null);
});

test('createInitialModelAvailabilityState starts unauthenticated and empty', () => {
  assert.deepEqual(createInitialModelAvailabilityState(), {
    status: 'unauthenticated',
    message: '登录后查看可用模型',
    reloadKey: 0,
  });
});

test('buildUnavailableModelMessage returns maintenance copy', () => {
  assert.equal(buildUnavailableModelMessage(), '功能不可用，正在维护');
});
