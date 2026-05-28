import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
