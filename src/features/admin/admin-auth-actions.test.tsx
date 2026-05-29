import assert from 'node:assert/strict';
import test from 'node:test';

import { getAdminAuthActionState } from './admin-auth-actions';

test('authenticated admins see logout action state', () => {
  assert.deepEqual(getAdminAuthActionState(true), {
    kind: 'logout',
    label: '退出登录',
  });
});

test('unauthenticated admin fallback sees login action state', () => {
  assert.deepEqual(getAdminAuthActionState(false), {
    kind: 'login',
    label: '进入后台',
  });
});
