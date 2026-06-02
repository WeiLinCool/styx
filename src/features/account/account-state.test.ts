import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAccountStateLabel,
  getAccountState,
  isActiveAccount,
  requiresActivation,
} from './account-state';

test('getAccountState defaults prototype cookie users to pending activation', () => {
  assert.equal(getAccountState({}), 'pending_activation');
});

test('getAccountState preserves active seed and dev users when present', () => {
  assert.equal(getAccountState({ accountState: 'active' }), 'active');
});

test('requiresActivation blocks every non-active logged-in state', () => {
  assert.equal(isActiveAccount({ accountState: 'active' }), true);
  assert.equal(requiresActivation({ accountState: 'pending_activation' }), true);
  assert.equal(requiresActivation({ accountState: 'suspended' }), true);
  assert.equal(requiresActivation({ accountState: 'archived' }), true);
});

test('formatAccountStateLabel localizes account lifecycle states', () => {
  assert.equal(formatAccountStateLabel('pending_activation'), '待激活');
  assert.equal(formatAccountStateLabel('active'), '已激活');
  assert.equal(formatAccountStateLabel('suspended'), '已停用');
  assert.equal(formatAccountStateLabel('archived'), '已归档');
  assert.equal(formatAccountStateLabel('unknown'), '未知状态');
});
