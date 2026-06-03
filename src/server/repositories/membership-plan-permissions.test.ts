import assert from 'node:assert/strict';
import test from 'node:test';

import { createMembershipPlanPermissionRepositoryHarness } from './membership-plan-permissions';

test('replaceMembershipPlanPermissionBindings stores the selected resource set', async () => {
  const repository = createMembershipPlanPermissionRepositoryHarness();

  await repository.replaceMembershipPlanPermissionBindings({
    planCode: 'pro-monthly',
    permissionCodes: ['page.user_center', 'action.user_center.copy_invite_code'],
  });

  const bindings = await repository.listMembershipPlanPermissionCodes('pro-monthly');

  assert.deepEqual(bindings, ['action.user_center.copy_invite_code', 'page.user_center']);
});
