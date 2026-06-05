import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseMembershipDraftBody } from './plans/[planId]/draft/route';
import { parseMembershipScheduleBody } from './plans/[planId]/schedule/route';

test('parseMembershipDraftBody accepts pricing, benefits, and permission fields', async () => {
  const body = parseMembershipDraftBody({
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
    mediaLibraryPolicy: {
      storageQuotaBytes: 1073741824,
      allowUserUpload: true,
      allowPublicSharing: false,
    },
  });

  assert.equal(body.priceCents, 12900);
  assert.equal(body.permissionCodes.length, 1);
  assert.equal(body.benefits[0]?.code, 'image-credits');
  assert.deepEqual(body.mediaLibraryPolicy, {
    storageQuotaBytes: 1073741824,
    allowUserUpload: true,
    allowPublicSharing: false,
  });
});

test('parseMembershipDraftBody coerces numeric strings from simplified admin forms', async () => {
  const body = parseMembershipDraftBody({
    displayName: 'Team Yearly',
    description: 'updated',
    billingPeriod: 'year',
    priceCents: '99900',
    currency: 'CNY',
    changeSummary: '',
    permissionCodes: [],
    benefits: [
      {
        code: 'seats',
        name: 'Seats',
        kind: 'quota',
        quantity: '10',
        unit: 'seat',
      },
    ],
    mediaLibraryPolicy: {
      storageQuotaBytes: '2147483648',
      allowUserUpload: true,
      allowPublicSharing: true,
    },
  });

  assert.equal(body.priceCents, 99900);
  assert.equal(body.benefits[0]?.quantity, 10);
  assert.deepEqual(body.mediaLibraryPolicy, {
    storageQuotaBytes: 2147483648,
    allowUserUpload: true,
    allowPublicSharing: true,
  });
});

test('parseMembershipDraftBody rejects missing display name', () => {
  assert.throws(
    () =>
      parseMembershipDraftBody({
        displayName: '',
        billingPeriod: 'month',
        priceCents: 12900,
        currency: 'CNY',
        permissionCodes: [],
        benefits: [],
        mediaLibraryPolicy: {
          storageQuotaBytes: 0,
          allowUserUpload: false,
          allowPublicSharing: false,
        },
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
