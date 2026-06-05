import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAdminMembershipMediaPolicyParams } from './route';

test('parseAdminMembershipMediaPolicyParams accepts valid user ids', async () => {
  const params = await parseAdminMembershipMediaPolicyParams(
    Promise.resolve({ userId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4' }),
  );

  assert.deepEqual(params, {
    userId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
  });
});

test('parseAdminMembershipMediaPolicyParams rejects invalid user ids', async () => {
  await assert.rejects(
    () =>
      parseAdminMembershipMediaPolicyParams(Promise.resolve({ userId: 'not-a-uuid' })),
    ZodError,
  );
});
