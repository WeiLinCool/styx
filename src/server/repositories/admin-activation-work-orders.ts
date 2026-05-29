import { desc, eq } from 'drizzle-orm';

import { type ActivationWorkOrderStatus } from '@/server/auth/activation-work-orders';
import { db, schema } from '@/server/db';
import { ensureAdminReadSource, formatIso } from './admin-shared';

export type AdminWorkOrderQueueStatus = 'pending' | 'processing' | 'closed' | 'archived';

export type AdminActivationWorkOrderRow = {
  id: string;
  code: string;
  status: ActivationWorkOrderStatus;
  queueStatus: AdminWorkOrderQueueStatus;
  outcome: 'approved' | 'rejected' | 'expired' | null;
  userId: string;
  userLabel: string;
  deviceSummary: string;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
};

export type AdminActivationWorkOrderQueue = {
  counts: Record<AdminWorkOrderQueueStatus, number>;
  page: number;
  pageSize: number;
  total: number;
  status: AdminWorkOrderQueueStatus;
  records: AdminActivationWorkOrderRow[];
};

type WorkOrderLike = {
  id: string;
  code: string;
  status: ActivationWorkOrderStatus;
  deviceMetadata: Record<string, unknown>;
  expiresAt: Date | string;
  createdAt: Date | string;
  approvedAt?: Date | string | null;
  rejectedAt?: Date | string | null;
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

function metadataOutcome(metadata: Record<string, unknown>) {
  const value = metadata.outcome;
  return value === 'approved' || value === 'rejected' || value === 'expired' ? value : null;
}

export function paginateAdminWorkOrders(input: {
  status: AdminWorkOrderQueueStatus;
  page: number;
  pageSize: number;
  records: AdminActivationWorkOrderRow[];
}): AdminActivationWorkOrderQueue {
  const page = Number.isFinite(input.page) && input.page > 0 ? Math.floor(input.page) : 1;
  const pageSize = Number.isFinite(input.pageSize) && input.pageSize > 0 ? Math.floor(input.pageSize) : 10;
  const start = (page - 1) * pageSize;

  return {
    counts: {
      pending: 0,
      processing: 0,
      closed: 0,
      archived: 0,
    },
    page,
    pageSize,
    total: input.records.length,
    status: input.status,
    records: input.records.slice(start, start + pageSize),
  };
}

export function mapActivationWorkOrderForAdmin(input: {
  workOrder: WorkOrderLike;
  user: UserLike;
}): AdminActivationWorkOrderRow {
  const contact = input.user.email ?? input.user.phone ?? '未绑定联系方式';
  const outcome = metadataOutcome(input.workOrder.deviceMetadata);
  const closedAt =
    input.workOrder.approvedAt ?? input.workOrder.rejectedAt ?? null;

  return {
    id: input.workOrder.id,
    code: input.workOrder.code,
    status: input.workOrder.status,
    queueStatus: input.workOrder.status,
    outcome,
    userId: input.user.id,
    userLabel: `${input.user.displayName} / ${contact}`,
    deviceSummary: [
      metadataText(input.workOrder.deviceMetadata, 'platform'),
      metadataText(input.workOrder.deviceMetadata, 'screen'),
      metadataText(input.workOrder.deviceMetadata, 'timezone'),
    ].join(' / '),
    createdAt: formatIso(input.workOrder.createdAt),
    expiresAt: formatIso(input.workOrder.expiresAt),
    closedAt: closedAt ? formatIso(closedAt) : null,
  };
}

export function getSeedActivationWorkOrders(): AdminActivationWorkOrderRow[] {
  return [
    {
      id: 'seed-work-order-1',
      code: 'ACT-SEED-0001',
      status: 'pending',
      queueStatus: 'pending',
      outcome: null,
      userId: 'seed-user-2',
      userLabel: '待激活创作者 / pending@styx.local',
      deviceSummary: 'MacIntel / 1440x900 / Asia/Shanghai',
      createdAt: '2026-05-29T07:30:00.000Z',
      expiresAt: '2026-05-30T07:30:00.000Z',
      closedAt: null,
    },
    {
      id: 'seed-work-order-2',
      code: 'ACT-SEED-0002',
      status: 'processing',
      queueStatus: 'processing',
      outcome: null,
      userId: 'seed-user-2',
      userLabel: '待激活创作者 / pending@styx.local',
      deviceSummary: 'Windows / 1920x1080 / Asia/Shanghai',
      createdAt: '2026-05-29T09:00:00.000Z',
      expiresAt: '2026-05-30T09:00:00.000Z',
      closedAt: null,
    },
    {
      id: 'seed-work-order-3',
      code: 'ACT-SEED-0003',
      status: 'closed',
      queueStatus: 'closed',
      outcome: 'approved',
      userId: 'seed-user-1',
      userLabel: 'Styx Admin / admin@styx.local',
      deviceSummary: 'MacIntel / 1440x900 / Asia/Shanghai',
      createdAt: '2026-05-28T07:30:00.000Z',
      expiresAt: '2026-05-29T07:30:00.000Z',
      closedAt: '2026-05-28T08:00:00.000Z',
    },
    {
      id: 'seed-work-order-4',
      code: 'ACT-SEED-0004',
      status: 'archived',
      queueStatus: 'archived',
      outcome: 'rejected',
      userId: 'seed-user-3',
      userLabel: '视频团队账号 / +86 138 0000 0000',
      deviceSummary: 'Linux / 1366x768 / Asia/Shanghai',
      createdAt: '2026-05-27T07:30:00.000Z',
      expiresAt: '2026-05-28T07:30:00.000Z',
      closedAt: '2026-05-27T08:15:00.000Z',
    },
  ];
}

export async function getAdminActivationWorkOrders(input?: {
  status?: AdminWorkOrderQueueStatus;
  page?: number;
  pageSize?: number;
}): Promise<AdminActivationWorkOrderQueue> {
  const requestedStatus = input?.status ?? 'pending';
  const requestedPage = input?.page ?? 1;
  const requestedPageSize = input?.pageSize ?? 10;
  const database = ensureAdminReadSource('activation work orders');

  if (!database || !db) {
    const seedRecords = getSeedActivationWorkOrders();
    const counts = {
      pending: seedRecords.filter((record) => record.queueStatus === 'pending').length,
      processing: seedRecords.filter((record) => record.queueStatus === 'processing').length,
      closed: seedRecords.filter((record) => record.queueStatus === 'closed').length,
      archived: seedRecords.filter((record) => record.queueStatus === 'archived').length,
    };
    const filtered = seedRecords.filter((record) => record.queueStatus === requestedStatus);
    return {
      ...paginateAdminWorkOrders({
        status: requestedStatus,
        page: requestedPage,
        pageSize: requestedPageSize,
        records: filtered,
      }),
      counts,
    };
  }

  const rows = await database
    .select({
      workOrder: schema.activationWorkOrders,
      user: schema.users,
    })
    .from(schema.activationWorkOrders)
    .innerJoin(schema.users, eq(schema.activationWorkOrders.userId, schema.users.id))
    .orderBy(desc(schema.activationWorkOrders.createdAt))
    .limit(100);

  const records = rows.map(({ workOrder, user }) =>
    mapActivationWorkOrderForAdmin({
      workOrder: {
        ...workOrder,
        deviceMetadata: {
          ...workOrder.deviceMetadata,
          outcome:
            workOrder.approvedAt != null
              ? 'approved'
              : workOrder.rejectedAt != null
                ? 'rejected'
                : null,
        },
      },
      user,
    }),
  );
  const counts = {
    pending: records.filter((record) => record.queueStatus === 'pending').length,
    processing: records.filter((record) => record.queueStatus === 'processing').length,
    closed: records.filter((record) => record.queueStatus === 'closed').length,
    archived: records.filter((record) => record.queueStatus === 'archived').length,
  };
  const filtered = records.filter((record) => record.queueStatus === requestedStatus);

  return {
    ...paginateAdminWorkOrders({
      status: requestedStatus,
      page: requestedPage,
      pageSize: requestedPageSize,
      records: filtered,
    }),
    counts,
  };
}
