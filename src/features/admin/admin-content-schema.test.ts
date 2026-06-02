import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contentSchemaRegistry,
  contentSlugOptions,
  getDefaultContentBody,
  getDefaultContentMetadata,
  getDefaultContentTitle,
} from './admin-content-schema';
import { buildAdminContentMutationValues } from '@/server/repositories/content';

const actorId = '00000000-0000-4000-8000-000000000001';

test('content visual schema covers every selectable slug', () => {
  assert.deepEqual(
    contentSlugOptions.map((option) => option.value),
    Object.keys(contentSchemaRegistry),
  );
});

test('content visual schema defaults pass server metadata validation', () => {
  for (const option of contentSlugOptions) {
    const values = buildAdminContentMutationValues({
      slug: option.value,
      title: getDefaultContentTitle(option.value),
      body: getDefaultContentBody(option.value),
      url: null,
      metadata: getDefaultContentMetadata(option.value),
      actorId,
    });

    assert.equal(values.slug, option.value);
    assert.equal(values.kind, 'page');
    assert.equal(values.status, 'draft');
  }
});

