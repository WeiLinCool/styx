import {
  type PasswordResetWorkOrderStatus,
  listPasswordResetWorkOrders,
} from '@/server/auth/password-reset-work-orders';

export type AdminPasswordResetWorkOrderQueueStatus = PasswordResetWorkOrderStatus;

export type AdminPasswordResetWorkOrderRow = {
  id: string;
  phone: string;
  userId: string;
  userLabel: string;
  reason: string;
  queueStatus: AdminPasswordResetWorkOrderQueueStatus;
  temporaryPassword: string | null;
  createdAt: string;
  processedAt: string | null;
  archivedAt: string | null;
};

export type AdminPasswordResetWorkOrderQueue = {
  counts: Record<AdminPasswordResetWorkOrderQueueStatus, number>;
  page: number;
  pageSize: number;
  total: number;
  status: AdminPasswordResetWorkOrderQueueStatus;
  records: AdminPasswordResetWorkOrderRow[];
};

function paginatePasswordResetWorkOrders(input: {
  status: AdminPasswordResetWorkOrderQueueStatus;
  page: number;
  pageSize: number;
  records: AdminPasswordResetWorkOrderRow[];
}): AdminPasswordResetWorkOrderQueue {
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

export async function getAdminPasswordResetWorkOrders(input?: {
  status?: AdminPasswordResetWorkOrderQueueStatus;
  page?: number;
  pageSize?: number;
}): Promise<AdminPasswordResetWorkOrderQueue> {
  const requestedStatus = input?.status ?? 'pending';
  const requestedPage = input?.page ?? 1;
  const requestedPageSize = input?.pageSize ?? 10;

  const records = (await listPasswordResetWorkOrders()).map((workOrder) => ({
    id: workOrder.id,
    phone: workOrder.phone,
    userId: workOrder.userId,
    userLabel: workOrder.userLabel,
    reason: workOrder.reason,
    queueStatus: workOrder.status,
    temporaryPassword: workOrder.temporaryPassword,
    createdAt: workOrder.createdAt,
    processedAt: workOrder.processedAt,
    archivedAt: workOrder.archivedAt,
  }));

  const counts = {
    pending: records.filter((record) => record.queueStatus === 'pending').length,
    processing: records.filter((record) => record.queueStatus === 'processing').length,
    closed: records.filter((record) => record.queueStatus === 'closed').length,
    archived: records.filter((record) => record.queueStatus === 'archived').length,
  };
  const filtered = records.filter((record) => record.queueStatus === requestedStatus);

  return {
    ...paginatePasswordResetWorkOrders({
      status: requestedStatus,
      page: requestedPage,
      pageSize: requestedPageSize,
      records: filtered,
    }),
    counts,
  };
}
