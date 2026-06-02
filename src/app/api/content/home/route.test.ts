import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultHomepageContent } from '@/features/public/home-content';
import { GET } from './route';

test('GET /api/content/home returns public homepage content without admin auth', async () => {
  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, { content: defaultHomepageContent });
});
