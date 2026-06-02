import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVideoModelRequestUrl } from './route';

test('parseVideoModelRequestUrl accepts base request url', () => {
  assert.deepEqual(parseVideoModelRequestUrl('https://example.com/api/agent/video-models'), {});
});
