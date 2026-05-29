import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mapActivationWorkOrderForAdmin,
  paginateAdminWorkOrders,
} from './admin-activation-work-orders';

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
    queueStatus: 'pending',
    outcome: null,
    userId: 'user-1',
    userLabel: '待激活用户 / pending@styx.local',
    deviceSummary: 'MacIntel / 1440x900 / Asia/Shanghai',
    createdAt: '2026-05-29T08:00:00.000Z',
    expiresAt: '2026-05-30T08:00:00.000Z',
    closedAt: null,
  });
});

test('mapActivationWorkOrderForAdmin converts closed queue records with approval outcome', () => {
  const row = mapActivationWorkOrderForAdmin({
    workOrder: {
      id: 'order-2',
      code: 'ACT-CLOS-0001',
      status: 'closed',
      deviceMetadata: {
        platform: 'MacIntel',
        screen: '1440x900',
        timezone: 'Asia/Shanghai',
        outcome: 'approved',
      },
      expiresAt: new Date('2026-05-30T08:00:00.000Z'),
      createdAt: new Date('2026-05-29T08:00:00.000Z'),
      approvedAt: new Date('2026-05-29T08:30:00.000Z'),
      rejectedAt: null,
    },
    user: {
      id: 'user-2',
      displayName: '已办结用户',
      email: 'closed@styx.local',
      phone: null,
      accountState: 'active',
    },
  });

  assert.equal(row.queueStatus, 'closed');
  assert.equal(row.outcome, 'approved');
  assert.equal(row.closedAt, '2026-05-29T08:30:00.000Z');
});

test('paginateAdminWorkOrders returns second page boundaries', () => {
  const page = paginateAdminWorkOrders({
    status: 'archived',
    page: 2,
    pageSize: 10,
    records: Array.from({ length: 25 }, (_, index) => ({
      id: `${index}`,
      code: `ACT-${index}`,
      status: 'archived',
      queueStatus: 'archived',
      outcome: 'approved',
      userId: `user-${index}`,
      userLabel: `用户 ${index}`,
      deviceSummary: 'MacIntel / 1440x900 / Asia/Shanghai',
      createdAt: '2026-05-29T08:00:00.000Z',
      expiresAt: '2026-05-30T08:00:00.000Z',
      closedAt: '2026-05-29T08:30:00.000Z',
    })),
  });

  assert.equal(page.page, 2);
  assert.equal(page.total, 25);
  assert.equal(page.records.length, 10);
});
