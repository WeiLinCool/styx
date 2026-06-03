import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseMembershipDraftBody } from './plans/[planId]/draft/route';
import { parseMembershipScheduleBody } from './plans/[planId]/schedule/route';

test('parseMembershipDraftBody accepts pricing, benefits, and permission fields', async () => {
  const body = await parseMembershipDraftBody({
    json: async () => ({
      displayName: 'Pro Monthly',
      description: 'updated',
      billingPeriod: 'month',
      priceCents: 12900,
      currency: 'CNY',
      changeSummary: 'price update',
      permissionCodes: ['page.user_center'],
      benefits: [
        {
          code: 'image-credits',
          name: 'Image credits',
          kind: 'quota',
          quantity: 600,
          unit: 'credit',
        },
      ],
    }),
  });

  assert.equal(body.priceCents, 12900);
  assert.equal(body.permissionCodes.length, 1);
  assert.equal(body.benefits[0]?.code, 'image-credits');
});

test('parseMembershipDraftBody rejects missing display name', async () => {
  await assert.rejects(
    () =>
      parseMembershipDraftBody({
        json: async () => ({
          displayName: '',
          billingPeriod: 'month',
          priceCents: 12900,
          currency: 'CNY',
          permissionCodes: [],
          benefits: [],
        }),
      }),
    ZodError,
  );
});

test('parseMembershipScheduleBody accepts an effectiveFrom timestamp', async () => {
  const body = await parseMembershipScheduleBody({
    json: async () => ({
      effectiveFrom: '2026-06-15T00:00:00.000Z',
    }),
  });

  assert.equal(body.effectiveFrom, '2026-06-15T00:00:00.000Z');
});
