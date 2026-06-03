import assert from 'node:assert/strict';
import test from 'node:test';

import { permissionCatalog } from '@/server/auth/permission-catalog';
import {
  createMembershipPlanPermissionRepositoryHarness,
  defaultMembershipPlanPermissionCodes,
  listMembershipPlanPermissionWorkspace,
} from './membership-plan-permissions';

test('permission catalog codes are unique', () => {
  const codes = permissionCatalog.map((item) => item.code);

  assert.equal(new Set(codes).size, codes.length);
});

test('replaceMembershipPlanPermissionBindings stores the selected resource set', async () => {
  const repository = createMembershipPlanPermissionRepositoryHarness();

  await repository.replaceMembershipPlanPermissionBindings({
    planCode: 'pro-monthly',
    permissionCodes: ['page.user_center', 'action.user_center.copy_invite_code'],
  });

  const bindings = await repository.listMembershipPlanPermissionCodes('pro-monthly');

  assert.deepEqual(bindings, ['action.user_center.copy_invite_code', 'page.user_center']);
});

test('listMembershipPlanPermissionWorkspace returns grouped resources and selected codes', async () => {
  const workspace = await listMembershipPlanPermissionWorkspace('pro-monthly');

  assert.equal(workspace.plan.code, 'pro-monthly');
  assert.ok(workspace.modules.some((module) => module.key === 'user-center'));
  assert.ok(workspace.selectedCodes.includes('page.user_center'));
});

test('defaultMembershipPlanPermissionCodes includes baseline access for yearly members', () => {
  assert.deepEqual(defaultMembershipPlanPermissionCodes['team-yearly'], ['page.user_center']);
});
