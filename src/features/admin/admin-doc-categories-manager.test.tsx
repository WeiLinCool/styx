import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminDocCategoriesManager } from './admin-doc-categories-manager';

test('category manager renders grouped parent and child categories', () => {
  const html = renderToStaticMarkup(
    <AdminDocCategoriesManager
      categories={[
        {
          id: 'parent-1',
          parentId: null,
          name: '新手入门',
          slug: 'onboarding',
          description: '',
          audienceScope: 'shared',
          sortOrder: 0,
          articleCount: 0,
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
        {
          id: 'child-1',
          parentId: 'parent-1',
          name: '账号操作',
          slug: 'account',
          description: '',
          audienceScope: 'shared',
          sortOrder: 1,
          articleCount: 2,
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      ]}
    />,
  );

  assert.match(html, /新手入门/);
  assert.match(html, /账号操作/);
  assert.match(html, /新增二级分类/);
});
