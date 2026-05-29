import { desc, eq, sql } from 'drizzle-orm';

import { schema } from '@/server/db';
import {
  type AdminModuleData,
  ensureAdminReadSource,
  formatCurrency,
  formatIso,
} from './admin-shared';

export type AdminMembershipRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  billingPeriod: string;
  price: string;
  status: string;
  benefitCount: number;
  entitlementCount: number;
  sortOrder: number;
  updatedAt: string;
  actions: string[];
};

function getSeedMemberships(): AdminModuleData<AdminMembershipRow> {
  const records: AdminMembershipRow[] = [
    {
      id: 'seed-plan-pro',
      code: 'pro-monthly',
      name: 'Pro Monthly',
      description: '个人创作者月度方案，包含图像与工作流额度。',
      billingPeriod: 'month',
      price: '¥99',
      status: 'active',
      benefitCount: 3,
      entitlementCount: 42,
      sortOrder: 10,
      updatedAt: '2026-05-29T08:00:00.000Z',
      actions: ['Edit plan', 'Adjust price', 'Archive'],
    },
    {
      id: 'seed-plan-team',
      code: 'team-yearly',
      name: 'Team Yearly',
      description: '团队年度方案，包含视频分钟数与优先支持。',
      billingPeriod: 'year',
      price: '¥999',
      status: 'active',
      benefitCount: 5,
      entitlementCount: 18,
      sortOrder: 20,
      updatedAt: '2026-05-29T08:00:00.000Z',
      actions: ['Edit plan', 'Adjust price', 'Archive'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '启用方案', value: '2', hint: '面向前台销售', tone: 'success' },
      { label: '权益规则', value: '8', hint: 'quota / feature', tone: 'info' },
      { label: '授权用户', value: '60', hint: 'active entitlements', tone: 'default' },
      { label: '需复核', value: '0', hint: 'pricing drift', tone: 'success' },
    ],
    filters: [
      { label: 'All', value: 'all', count: 2 },
      { label: 'Monthly', value: 'month', count: 1 },
      { label: 'Yearly', value: 'year', count: 1 },
    ],
    records,
  };
}

export async function getAdminMemberships(): Promise<AdminModuleData<AdminMembershipRow>> {
  const database = ensureAdminReadSource('memberships');

  if (!database) {
    return getSeedMemberships();
  }

  const rows = await database
    .select({
      plan: schema.membershipPlans,
      benefitCount: sql<number>`count(distinct ${schema.benefits.id})::int`,
      entitlementCount: sql<number>`count(distinct ${schema.userEntitlements.id})::int`,
    })
    .from(schema.membershipPlans)
    .leftJoin(schema.benefits, eq(schema.benefits.planId, schema.membershipPlans.id))
    .leftJoin(schema.userEntitlements, eq(schema.userEntitlements.planId, schema.membershipPlans.id))
    .groupBy(schema.membershipPlans.id)
    .orderBy(schema.membershipPlans.sortOrder, desc(schema.membershipPlans.updatedAt));

  const records = rows.map(({ plan, benefitCount, entitlementCount }) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description ?? '未填写',
    billingPeriod: plan.billingPeriod,
    price: formatCurrency(plan.priceCents, plan.currency),
    status: plan.isActive ? 'active' : 'archived',
    benefitCount,
    entitlementCount,
    sortOrder: plan.sortOrder,
    updatedAt: formatIso(plan.updatedAt),
    actions: ['Edit plan', 'Adjust price', 'Archive'],
  }));

  return {
    source: 'database',
    metrics: [
      { label: '方案数', value: String(records.length), hint: 'PostgreSQL', tone: 'info' },
      {
        label: '启用方案',
        value: String(records.filter((record) => record.status === 'active').length),
        hint: 'sellable',
        tone: 'success',
      },
      {
        label: '权益规则',
        value: String(records.reduce((sum, record) => sum + record.benefitCount, 0)),
        hint: 'attached benefits',
        tone: 'default',
      },
      {
        label: '授权用户',
        value: String(records.reduce((sum, record) => sum + record.entitlementCount, 0)),
        hint: 'entitlements',
        tone: 'default',
      },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      { label: 'Monthly', value: 'month' },
      { label: 'Yearly', value: 'year' },
      { label: 'One-time', value: 'one_time' },
    ],
    records,
  };
}
