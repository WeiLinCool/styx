import assert from 'node:assert/strict';
import test from 'node:test';

import { isAdminNavItemActive } from './admin-nav';

test('dashboard nav item matches only the admin root', () => {
  assert.equal(isAdminNavItemActive('/admin', '/admin'), true);
  assert.equal(isAdminNavItemActive('/admin', '/admin/users'), false);
});

test('module nav item matches exact and nested routes', () => {
  assert.equal(isAdminNavItemActive('/admin/users', '/admin/users'), true);
  assert.equal(isAdminNavItemActive('/admin/users', '/admin/users/123'), true);
  assert.equal(isAdminNavItemActive('/admin/users', '/admin/orders'), false);
});
