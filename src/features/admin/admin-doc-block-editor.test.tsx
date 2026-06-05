import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { createStarterDocBlocks, fromDocBlocks } from './admin-doc-blocks';
import { AdminDocBlockEditor } from './admin-doc-block-editor';

test('block editor renders ordered cards and add-block affordance', () => {
  const html = renderToStaticMarkup(
    <AdminDocBlockEditor
      blocks={fromDocBlocks(createStarterDocBlocks())}
      onChange={() => {}}
      errorMessages={[]}
    />,
  );

  assert.match(html, /新增内容块/);
  assert.match(html, /上移/);
  assert.match(html, /下移/);
});
