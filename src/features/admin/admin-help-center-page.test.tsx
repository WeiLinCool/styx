import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminHelpCenterPage } from './admin-help-center-page';

test('admin help center page renders overview, groups, and quick links', () => {
  const html = renderToStaticMarkup(<AdminHelpCenterPage />);

  assert.match(html, /帮助中心/);
  assert.match(html, /系统总览/);
  assert.match(html, /运营与账户/);
  assert.match(html, /进入模块/);
  assert.match(html, /关键链路/);
});
