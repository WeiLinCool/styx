import { desc, eq, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { db, schema } from '@/server/db';

export type DashboardTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export type DashboardKpi = {
  label: string;
  value: string;
  change: string;
  tone: DashboardTone;
};

export type DashboardUser = {
  id: string;
  name: string;
  email: string;
  accountState: string;
  createdAt: string;
};

export type DashboardAiJob = {
  id: string;
  type: string;
  status: string;
  model: string;
  owner: string;
  createdAt: string;
};

export type DashboardOrder = {
  id: string;
  orderNumber: string;
  customer: string;
  status: string;
  total: string;
  createdAt: string;
};

export type DashboardPartnerLead = {
  id: string;
  companyName: string;
  contactName: string;
  status: string;
  source: string;
  createdAt: string;
};

export type DashboardNotice = {
  id: string;
  title: string;
  description: string;
  tone: DashboardTone;
};

export type AdminDashboardData = {
  source: 'database' | 'seed';
  kpis: DashboardKpi[];
  recentUsers: DashboardUser[];
  recentAiJobs: DashboardAiJob[];
  recentOrders: DashboardOrder[];
  partnerLeads: DashboardPartnerLead[];
  notices: DashboardNotice[];
};

function formatCurrency(cents: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatIso(value: Date | string | null | undefined) {
  if (!value) {
    return '未记录';
  }

  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function getSeedDashboard(): AdminDashboardData {
  return {
    source: 'seed',
    kpis: [
      { label: '活跃账号', value: '128', change: '+12 本周', tone: 'success' },
      { label: '待激活账号', value: '17', change: '需跟进', tone: 'warning' },
      { label: '本月订单额', value: '¥42,900', change: '+8.4%', tone: 'success' },
      { label: 'AI 任务成功率', value: '96.8%', change: '24h', tone: 'info' },
    ],
    recentUsers: [
      {
        id: 'seed-user-1',
        name: 'Styx Admin',
        email: 'admin@styx.local',
        accountState: 'active',
        createdAt: '2026-05-29T08:00:00.000Z',
      },
      {
        id: 'seed-user-2',
        name: '待激活创作者',
        email: 'pending@styx.local',
        accountState: 'pending_activation',
        createdAt: '2026-05-29T07:20:00.000Z',
      },
    ],
    recentAiJobs: [
      {
        id: 'seed-job-1',
        type: 'image',
        status: 'succeeded',
        model: 'seed-image-model',
        owner: 'Seed Member',
        createdAt: '2026-05-29T07:40:00.000Z',
      },
      {
        id: 'seed-job-2',
        type: 'video',
        status: 'running',
        model: 'seed-video-model',
        owner: 'Seed Member',
        createdAt: '2026-05-29T07:12:00.000Z',
      },
    ],
    recentOrders: [
      {
        id: 'seed-order-1',
        orderNumber: 'SEED-ORDER-0001',
        customer: 'Seed Member',
        status: 'paid',
        total: '¥29',
        createdAt: '2026-05-29T06:50:00.000Z',
      },
      {
        id: 'seed-order-2',
        orderNumber: 'SEED-ORDER-0002',
        customer: '待激活创作者',
        status: 'pending',
        total: '¥99',
        createdAt: '2026-05-29T05:30:00.000Z',
      },
    ],
    partnerLeads: [
      {
        id: 'seed-lead-1',
        companyName: 'Seed Partner Co.',
        contactName: 'Seed Contact',
        status: 'qualified',
        source: 'partner-benefits',
        createdAt: '2026-05-29T03:00:00.000Z',
      },
    ],
    notices: [
      {
        id: 'seed-notice-db',
        title: '开发数据源',
        description: '当前未连接 PostgreSQL，后台仪表盘使用安全种子数据。',
        tone: 'warning',
      },
      {
        id: 'seed-notice-activation',
        title: '账号激活链路',
        description: '用户、订单与 AI 任务模块后续将沿用当前数据结构扩展。',
        tone: 'info',
      },
    ],
  };
}

async function countTable(table: PgTable) {
  const database = db;
  if (!database) {
    return 0;
  }

  const [row] = await database.select({ count: sql<number>`count(*)::int` }).from(table);
  return row?.count ?? 0;
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  if (!db || !process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required for admin dashboard data.');
    }

    return getSeedDashboard();
  }

  try {
    const database = db;
    const [
      userCount,
      orderCount,
      aiJobCount,
      partnerLeadCount,
      recentUsers,
      recentAiJobs,
      recentOrders,
      partnerLeads,
    ] = await Promise.all([
      countTable(schema.users),
      countTable(schema.orders),
      countTable(schema.aiJobs),
      countTable(schema.partnerLeads),
      database
        .select()
        .from(schema.users)
        .orderBy(desc(schema.users.createdAt))
        .limit(5),
      database
        .select({
          job: schema.aiJobs,
          user: schema.users,
        })
        .from(schema.aiJobs)
        .leftJoin(schema.users, eq(schema.aiJobs.userId, schema.users.id))
        .orderBy(desc(schema.aiJobs.createdAt))
        .limit(5),
      database
        .select({
          order: schema.orders,
          user: schema.users,
        })
        .from(schema.orders)
        .leftJoin(schema.users, eq(schema.orders.userId, schema.users.id))
        .orderBy(desc(schema.orders.createdAt))
        .limit(5),
      database
        .select()
        .from(schema.partnerLeads)
        .orderBy(desc(schema.partnerLeads.createdAt))
        .limit(5),
    ]);

    return {
      source: 'database',
      kpis: [
        { label: '总账号', value: String(userCount), change: 'PostgreSQL', tone: 'info' },
        { label: '订单数', value: String(orderCount), change: '累计', tone: 'success' },
        { label: 'AI 任务', value: String(aiJobCount), change: '累计', tone: 'default' },
        { label: '合作线索', value: String(partnerLeadCount), change: '累计', tone: 'warning' },
      ],
      recentUsers: recentUsers.map((user) => ({
        id: user.id,
        name: user.displayName,
        email: user.email ?? user.phone ?? '未绑定',
        accountState: user.accountState,
        createdAt: formatIso(user.createdAt),
      })),
      recentAiJobs: recentAiJobs.map(({ job, user }) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        model: job.model ?? job.provider ?? '未配置',
        owner: user?.displayName ?? '未知用户',
        createdAt: formatIso(job.createdAt),
      })),
      recentOrders: recentOrders.map(({ order, user }) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customer: user?.displayName ?? '未知用户',
        status: order.status,
        total: formatCurrency(order.totalCents, order.currency),
        createdAt: formatIso(order.createdAt),
      })),
      partnerLeads: partnerLeads.map((lead) => ({
        id: lead.id,
        companyName: lead.companyName,
        contactName: lead.contactName,
        status: lead.status,
        source: lead.source ?? 'unknown',
        createdAt: formatIso(lead.createdAt),
      })),
      notices: [
        {
          id: 'database-online',
          title: 'PostgreSQL 已连接',
          description: '仪表盘正在读取数据库，后续管理模块可复用该 repository shape。',
          tone: 'success',
        },
      ],
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }

    return getSeedDashboard();
  }
}
