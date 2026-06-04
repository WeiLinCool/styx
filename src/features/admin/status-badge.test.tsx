import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { StatusBadge } from './status-badge';

test('status badge localizes common order statuses for admin surfaces', () => {
  const paid = renderToStaticMarkup(<StatusBadge value="paid" />);
  const fulfilled = renderToStaticMarkup(<StatusBadge value="fulfilled" />);
  const approved = renderToStaticMarkup(<StatusBadge value="approved" />);
  const processing = renderToStaticMarkup(<StatusBadge value="processing" />);

  assert.match(paid, /已支付/);
  assert.doesNotMatch(paid, />paid</);
  assert.match(fulfilled, /已履约/);
  assert.doesNotMatch(fulfilled, />fulfilled</);
  assert.match(approved, /已通过/);
  assert.match(processing, /处理中/);
});

test('status badge allows business-specific label overrides', () => {
  const html = renderToStaticMarkup(<StatusBadge value="paid" label="待会员审批" />);

  assert.match(html, /待会员审批/);
  assert.doesNotMatch(html, /已支付/);
});
