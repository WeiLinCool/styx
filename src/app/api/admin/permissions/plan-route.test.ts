import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parsePlanPermissionUpdateBody } from './plans/[planId]/route';

test('parsePlanPermissionUpdateBody accepts a permission code array', async () => {
  const body = await parsePlanPermissionUpdateBody({
    json: async () => ({
      permissionCodes: ['page.user_center', 'action.user_center.copy_invite_code'],
    }),
  });

  assert.deepEqual(body, {
    permissionCodes: ['page.user_center', 'action.user_center.copy_invite_code'],
  });
});

test('parsePlanPermissionUpdateBody rejects a missing permissionCodes array', async () => {
  await assert.rejects(
    () =>
      parsePlanPermissionUpdateBody({
        json: async () => ({}),
      }),
    ZodError,
  );
});
