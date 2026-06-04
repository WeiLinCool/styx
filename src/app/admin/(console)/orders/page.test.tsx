import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { adminOrdersGuide } from './page';

test('admin orders page renders newcomer guide for order handling', async () => {
  const html = renderToStaticMarkup(adminOrdersGuide);

  assert.match(html, /订单处理新手导航/);
  assert.match(html, /订单页负责支付和履约状态维护/);
  assert.match(html, /展开/);
});
