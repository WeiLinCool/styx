import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminDocCategoriesManagerView } from './admin-doc-categories-manager';

test('category manager renders grouped parent and child categories', () => {
  const html = renderToStaticMarkup(
    <AdminDocCategoriesManagerView
      onRefresh={() => {}}
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
  assert.match(html, /编辑一级分类/);
  assert.match(html, /编辑二级分类/);
  assert.match(html, /已有文档，不能删除/);
});

test('category manager explains the empty category state', () => {
  const html = renderToStaticMarkup(<AdminDocCategoriesManagerView categories={[]} onRefresh={() => {}} />);

  assert.match(html, /还没有分类/);
  assert.match(html, /先创建一级分类/);
  assert.match(html, /分类名/);
  assert.match(html, /Slug/);
});
