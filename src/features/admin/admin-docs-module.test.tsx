import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminDocsModule } from './admin-docs-module';

test('admin docs module reflects active filters in links and empty state', () => {
  const html = renderToStaticMarkup(
    <AdminDocsModule
      source="database"
      metrics={[]}
      filters={[{ label: '草稿', value: 'draft', count: 1 }]}
      records={[]}
      categories={[
        {
          id: 'category-1',
          parentId: null,
          name: '指南',
          slug: 'guides',
          description: '',
          audienceScope: 'shared',
          sortOrder: 0,
          articleCount: 0,
          updatedAt: '2026-06-05T00:00:00.000Z',
        },
      ]}
      activeFilters={{ status: 'draft', categoryId: 'category-1', search: '快速' }}
    />,
  );

  assert.match(html, /value="快速"/);
  assert.match(html, /草稿/);
  assert.match(html, /暂无记录/);
});
