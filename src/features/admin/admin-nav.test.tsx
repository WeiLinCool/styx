import assert from 'node:assert/strict';
import test from 'node:test';

import { isAdminNavItemActive } from './admin-nav';
import {
  ADMIN_NAV_ITEMS,
  getAdminNavItemByHref,
} from './admin-nav-config';

test('admin nav config exposes help center entry and lookup', () => {
  const helpCenterItem = getAdminNavItemByHref('/admin/help-center');

  assert.ok(helpCenterItem);
  assert.equal(helpCenterItem?.label, '帮助中心');
  assert.equal(ADMIN_NAV_ITEMS.at(-1)?.href, '/admin/help-center');
});

test('dashboard nav item matches only the admin root', () => {
  assert.equal(isAdminNavItemActive('/admin', '/admin'), true);
  assert.equal(isAdminNavItemActive('/admin', '/admin/users'), false);
});

test('module nav item matches exact and nested routes', () => {
  assert.equal(isAdminNavItemActive('/admin/users', '/admin/users'), true);
  assert.equal(isAdminNavItemActive('/admin/users', '/admin/users/123'), true);
  assert.equal(isAdminNavItemActive('/admin/users', '/admin/orders'), false);
});

test('help center nav item matches exact and nested routes', () => {
  assert.equal(isAdminNavItemActive('/admin/help-center', '/admin/help-center'), true);
  assert.equal(isAdminNavItemActive('/admin/help-center', '/admin/help-center/overview'), true);
  assert.equal(isAdminNavItemActive('/admin/help-center', '/admin/users'), false);
});
