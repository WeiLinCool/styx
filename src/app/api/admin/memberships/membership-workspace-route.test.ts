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
    videoGenerationPolicy: {
      enabled: true,
      allowedDurations: [5, 10],
      allowedResolutions: ['720p', '1080p'],
      defaultDuration: 5,
      defaultResolution: '720p',
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
  assert.deepEqual(body.videoGenerationPolicy, {
    enabled: true,
    allowedDurations: [5, 10],
    allowedResolutions: ['720p', '1080p'],
    defaultDuration: 5,
    defaultResolution: '720p',
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

test('parseMembershipDraftBody coerces video generation numeric strings', async () => {
  const body = parseMembershipDraftBody({
    displayName: 'Team Yearly',
    description: 'updated',
    billingPeriod: 'year',
    priceCents: '99900',
    currency: 'CNY',
    changeSummary: '',
    permissionCodes: [],
    benefits: [],
    mediaLibraryPolicy: {
      storageQuotaBytes: '2147483648',
      allowUserUpload: true,
      allowPublicSharing: true,
    },
    videoGenerationPolicy: {
      enabled: true,
      allowedDurations: ['5', '10'],
      allowedResolutions: ['720p', '1080p'],
      defaultDuration: '10',
      defaultResolution: '1080p',
    },
  });

  assert.deepEqual(body.videoGenerationPolicy?.allowedDurations, [5, 10]);
  assert.equal(body.videoGenerationPolicy?.defaultDuration, 10);
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
