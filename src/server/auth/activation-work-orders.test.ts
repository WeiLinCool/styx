import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildActivationWorkOrderCode,
  buildFingerprintDigest,
  getActivationWorkOrderTransition,
  normalizeFingerprintPayload,
} from './activation-work-orders';

test('normalizeFingerprintPayload keeps stable coarse browser fields', () => {
  assert.deepEqual(
    normalizeFingerprintPayload({
      userAgent: 'Mozilla/5.0',
      language: 'zh-CN',
      timezone: 'Asia/Shanghai',
      screen: { width: 1440, height: 900, colorDepth: 30 },
      platform: 'macOS',
      hardwareConcurrency: 10,
    } as Record<string, unknown>),
    {
      colorDepth: 30,
      hardwareConcurrency: 10,
      language: 'zh-CN',
      platform: 'macOS',
      screenHeight: 900,
      screenWidth: 1440,
      timezone: 'Asia/Shanghai',
      userAgent: 'Mozilla/5.0',
    },
  );
});

test('buildFingerprintDigest is stable regardless of input key order', () => {
  const first = buildFingerprintDigest({
    userAgent: 'Mozilla/5.0',
    language: 'zh-CN',
    timezone: 'Asia/Shanghai',
  });
  const second = buildFingerprintDigest({
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    userAgent: 'Mozilla/5.0',
  });

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('buildActivationWorkOrderCode creates support-friendly codes', () => {
  assert.match(buildActivationWorkOrderCode(() => 'abc123def456'), /^ACT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test('getActivationWorkOrderTransition approves only pending unexpired work orders', () => {
  const now = new Date('2026-05-29T08:00:00.000Z');

  assert.deepEqual(
    getActivationWorkOrderTransition({
      currentStatus: 'pending',
      expiresAt: new Date('2026-05-29T09:00:00.000Z'),
      action: 'approve',
      now,
    }),
    { ok: true, nextStatus: 'approved' },
  );

  assert.deepEqual(
    getActivationWorkOrderTransition({
      currentStatus: 'approved',
      expiresAt: new Date('2026-05-29T09:00:00.000Z'),
      action: 'reject',
      now,
    }),
    { ok: false, code: 'work_order_not_pending' },
  );

  assert.deepEqual(
    getActivationWorkOrderTransition({
      currentStatus: 'pending',
      expiresAt: new Date('2026-05-29T07:00:00.000Z'),
      action: 'approve',
      now,
    }),
    { ok: false, code: 'work_order_expired' },
  );
});
