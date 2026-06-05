import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAdminDocCategoryMutationBody } from './route';

test('parseAdminDocCategoryMutationBody accepts a valid category update payload', () => {
  const body = parseAdminDocCategoryMutationBody({
    name: '入门指南',
    slug: 'onboarding',
    description: '给新运营的文档目录',
    parentId: null,
    audienceScope: 'shared',
    sortOrder: 2,
  });

  assert.deepEqual(body, {
    name: '入门指南',
    slug: 'onboarding',
    description: '给新运营的文档目录',
    parentId: null,
    audienceScope: 'shared',
    sortOrder: 2,
  });
});

test('parseAdminDocCategoryMutationBody rejects a non-integer sortOrder', () => {
  assert.throws(
    () =>
      parseAdminDocCategoryMutationBody({
        name: '入门指南',
        slug: 'onboarding',
        sortOrder: 1.5,
      }),
    ZodError,
  );
});

test('DELETE reads the request body before mutation protection', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('./route.ts', import.meta.url), 'utf8'));

  assert.match(source, /export async function DELETE/);
  assert.match(source, /readJsonBody\(request\)/);
  assert.doesNotMatch(source, /rawBody:\s*''/);
});
