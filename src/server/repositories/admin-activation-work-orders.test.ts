import test from 'node:test';
import assert from 'node:assert/strict';

import { mapActivationWorkOrderForAdmin } from './admin-activation-work-orders';

test('mapActivationWorkOrderForAdmin returns localized support review fields', () => {
  const row = mapActivationWorkOrderForAdmin({
    workOrder: {
      id: 'order-1',
      code: 'ACT-ABCD-1234',
      status: 'pending',
      deviceMetadata: {
        platform: 'MacIntel',
        screen: '1440x900',
        timezone: 'Asia/Shanghai',
      },
      expiresAt: new Date('2026-05-30T08:00:00.000Z'),
      createdAt: new Date('2026-05-29T08:00:00.000Z'),
    },
    user: {
      id: 'user-1',
      displayName: '待激活用户',
      email: 'pending@styx.local',
      phone: null,
      accountState: 'pending_activation',
    },
  });

  assert.deepEqual(row, {
    id: 'order-1',
    code: 'ACT-ABCD-1234',
    status: 'pending',
    userId: 'user-1',
    userLabel: '待激活用户 / pending@styx.local',
    deviceSummary: 'MacIntel / 1440x900 / Asia/Shanghai',
    createdAt: '2026-05-29T08:00:00.000Z',
    expiresAt: '2026-05-30T08:00:00.000Z',
  });
});
