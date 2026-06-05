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

  assert.match(html, /新增正文/);
  assert.match(html, /新增FAQ/);
  assert.match(html, /新增步骤图文/);
  assert.match(html, /新增图集/);
  assert.match(html, /新增视频/);
  assert.match(html, /新增音频/);
  assert.match(html, /上移/);
  assert.match(html, /下移/);
});
