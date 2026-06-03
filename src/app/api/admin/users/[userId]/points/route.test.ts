import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAdminUserPointsParams, parseAdminUserPointsRequest } from './route';

test('parseAdminUserPointsParams accepts valid user ids', async () => {
  const params = await parseAdminUserPointsParams(
    Promise.resolve({ userId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4' }),
  );

  assert.deepEqual(params, {
    userId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
  });
});

test('parseAdminUserPointsParams rejects invalid user ids', async () => {
  await assert.rejects(
    () => parseAdminUserPointsParams(Promise.resolve({ userId: 'not-a-uuid' })),
    ZodError,
  );
});

test('parseAdminUserPointsRequest trims reason and keeps signed non-zero decimal amount', async () => {
  const body = await parseAdminUserPointsRequest(
    new Request('http://localhost/api/admin/users/user-1/points', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: -12.5,
        reason: ' Manual correction ',
      }),
    }),
  );

  assert.deepEqual(body, {
    amount: -12.5,
    reason: 'Manual correction',
  });
});

test('parseAdminUserPointsRequest rejects zero amount, over-precision, and empty reason', async () => {
  await assert.rejects(
    () =>
      parseAdminUserPointsRequest(
        new Request('http://localhost/api/admin/users/user-1/points', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            amount: 0,
            reason: '   ',
          }),
        }),
      ),
    ZodError,
  );

  await assert.rejects(
    () =>
      parseAdminUserPointsRequest(
        new Request('http://localhost/api/admin/users/user-1/points', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            amount: 0.555,
            reason: 'Manual correction',
          }),
        }),
      ),
    ZodError,
  );
});
