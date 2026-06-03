import assert from 'node:assert/strict';
import test from 'node:test';

import { filterMenuItemsByPermissions } from './permissioned-menu';

test('filterMenuItemsByPermissions removes items without permission code access', () => {
  const items = [
    { label: '用户中心', href: '/user-center', permissionCode: 'menu.user_center' },
    { label: '商城', href: '/shop' },
  ];

  assert.deepEqual(filterMenuItemsByPermissions(items, []), [{ label: '商城', href: '/shop' }]);
});
