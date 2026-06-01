import assert from 'node:assert/strict';
import test from 'node:test';

import { parseImageModelMode } from './route';

test('parseImageModelMode accepts supported modes', () => {
  assert.equal(parseImageModelMode('generate'), 'generate');
  assert.equal(parseImageModelMode('edit'), 'edit');
  assert.equal(parseImageModelMode('upscale'), 'upscale');
});

test('parseImageModelMode rejects unsupported mode', () => {
  assert.throws(() => parseImageModelMode('video'), /Invalid image model mode/);
});
