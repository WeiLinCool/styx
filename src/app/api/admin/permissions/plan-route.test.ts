import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { encryptRequestBody } from '@/lib/request-encryption';
import {
  parsePlanPermissionUpdateBody,
  parsePlanPermissionUpdateRequest,
} from './plans/[planId]/route';

test('parsePlanPermissionUpdateBody accepts a permission code array', async () => {
  const body = parsePlanPermissionUpdateBody({
    permissionCodes: ['page.user_center', 'action.user_center.copy_invite_code'],
  });

  assert.deepEqual(body, {
    permissionCodes: ['page.user_center', 'action.user_center.copy_invite_code'],
  });
});

test('parsePlanPermissionUpdateBody rejects a missing permissionCodes array', async () => {
  assert.throws(() => parsePlanPermissionUpdateBody({}), ZodError);
});

test('parsePlanPermissionUpdateRequest accepts encrypted permission updates', async () => {
  const encryptedBody = await encryptRequestBody(
    JSON.stringify({
      permissionCodes: ['page.user_center', 'action.user_center.copy_invite_code'],
    }),
  );
  const body = await parsePlanPermissionUpdateRequest(
    new Request('http://localhost/api/admin/permissions/plans/plan-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: encryptedBody,
    }),
  );

  assert.deepEqual(body, {
    permissionCodes: ['page.user_center', 'action.user_center.copy_invite_code'],
  });
});
