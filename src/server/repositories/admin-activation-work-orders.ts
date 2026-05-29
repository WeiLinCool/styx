import { desc, eq } from 'drizzle-orm';

import { type ActivationWorkOrderStatus } from '@/server/auth/activation-work-orders';
import { db, schema } from '@/server/db';
import { ensureAdminReadSource, formatIso } from './admin-shared';

export type AdminActivationWorkOrderRow = {
  id: string;
  code: string;
  status: ActivationWorkOrderStatus;
  userId: string;
  userLabel: string;
  deviceSummary: string;
  createdAt: string;
  expiresAt: string;
};

type WorkOrderLike = {
  id: string;
  code: string;
  status: ActivationWorkOrderStatus;
  deviceMetadata: Record<string, unknown>;
  expiresAt: Date | string;
  createdAt: Date | string;
};

type UserLike = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  accountState: string;
};

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : '未知';
}

export function mapActivationWorkOrderForAdmin(input: {
  workOrder: WorkOrderLike;
  user: UserLike;
}): AdminActivationWorkOrderRow {
  const contact = input.user.email ?? input.user.phone ?? '未绑定联系方式';

  return {
    id: input.workOrder.id,
    code: input.workOrder.code,
    status: input.workOrder.status,
    userId: input.user.id,
    userLabel: `${input.user.displayName} / ${contact}`,
    deviceSummary: [
      metadataText(input.workOrder.deviceMetadata, 'platform'),
      metadataText(input.workOrder.deviceMetadata, 'screen'),
      metadataText(input.workOrder.deviceMetadata, 'timezone'),
    ].join(' / '),
    createdAt: formatIso(input.workOrder.createdAt),
    expiresAt: formatIso(input.workOrder.expiresAt),
  };
}

export function getSeedActivationWorkOrders(): AdminActivationWorkOrderRow[] {
  return [
    {
      id: 'seed-work-order-1',
      code: 'ACT-SEED-0001',
      status: 'pending',
      userId: 'seed-user-2',
      userLabel: '待激活创作者 / pending@styx.local',
      deviceSummary: 'MacIntel / 1440x900 / Asia/Shanghai',
      createdAt: '2026-05-29T07:30:00.000Z',
      expiresAt: '2026-05-30T07:30:00.000Z',
    },
  ];
}

export async function getAdminActivationWorkOrders(): Promise<AdminActivationWorkOrderRow[]> {
  const database = ensureAdminReadSource('activation work orders');

  if (!database || !db) {
    return getSeedActivationWorkOrders();
  }

  const rows = await database
    .select({
      workOrder: schema.activationWorkOrders,
      user: schema.users,
    })
    .from(schema.activationWorkOrders)
    .innerJoin(schema.users, eq(schema.activationWorkOrders.userId, schema.users.id))
    .orderBy(desc(schema.activationWorkOrders.createdAt))
    .limit(20);

  return rows.map(mapActivationWorkOrderForAdmin);
}
