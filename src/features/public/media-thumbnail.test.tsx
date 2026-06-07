import assert from 'node:assert/strict';
import test from 'node:test';

import { MediaThumbnail } from './media-thumbnail';

test('media thumbnail helper is defined for image assets', () => {
  assert.equal(typeof MediaThumbnail, 'function');
});
