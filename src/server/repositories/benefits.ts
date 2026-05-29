import { desc, eq } from 'drizzle-orm';

import { schema } from '@/server/db';
import {
  type AdminModuleData,
  ensureAdminReadSource,
  formatIso,
} from './admin-shared';

export type AdminBenefitRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  plan: string;
  quantity: string;
  unit: string;
  ruleSummary: string;
  entitlementSummary: string;
  updatedAt: string;
  actions: string[];
};

function getSeedBenefits(): AdminModuleData<AdminBenefitRow> {
  const records: AdminBenefitRow[] = [
    {
      id: 'seed-benefit-image',
      code: 'image-credits',
      name: 'Image generation credits',
      kind: 'quota',
      plan: 'Pro Monthly',
      quantity: '500',
      unit: 'credit',
      ruleSummary: '每月刷新，可用于 image-gen 与 workflow。',
      entitlementSummary: '42 active entitlements',
      updatedAt: '2026-05-29T08:00:00.000Z',
      actions: ['Edit rule', 'Manual grant', 'Disable'],
    },
    {
      id: 'seed-benefit-video',
      code: 'video-minutes',
      name: 'Video generation minutes',
      kind: 'quota',
      plan: 'Team Yearly',
      quantity: '120',
      unit: 'minute',
      ruleSummary: '年度发放，支持团队共享。',
      entitlementSummary: '18 active entitlements',
      updatedAt: '2026-05-29T08:00:00.000Z',
      actions: ['Edit rule', 'Manual grant', 'Disable'],
    },
    {
      id: 'seed-benefit-support',
      code: 'priority-support',
      name: 'Priority support',
      kind: 'support',
      plan: 'Team Yearly',
      quantity: '1',
      unit: 'seat',
      ruleSummary: '后台工单优先级提升。',
      entitlementSummary: '18 active entitlements',
      updatedAt: '2026-05-29T08:00:00.000Z',
      actions: ['Edit rule', 'Manual grant', 'Disable'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '权益数', value: '3', hint: 'seed rules', tone: 'info' },
      { label: '额度类', value: '2', hint: 'quota', tone: 'success' },
      { label: '支持类', value: '1', hint: 'support', tone: 'default' },
      { label: '手动调整', value: 'ready', hint: 'Task 7 wiring', tone: 'warning' },
    ],
    filters: [
      { label: 'All', value: 'all', count: 3 },
      { label: 'Quota', value: 'quota', count: 2 },
      { label: 'Feature', value: 'feature' },
      { label: 'Support', value: 'support', count: 1 },
    ],
    records,
  };
}

export async function getAdminBenefits(): Promise<AdminModuleData<AdminBenefitRow>> {
  const database = ensureAdminReadSource('benefits');

  if (!database) {
    return getSeedBenefits();
  }

  const rows = await database
    .select({
      benefit: schema.benefits,
      plan: schema.membershipPlans,
    })
    .from(schema.benefits)
    .leftJoin(schema.membershipPlans, eq(schema.membershipPlans.id, schema.benefits.planId))
    .orderBy(desc(schema.benefits.updatedAt));

  const records = rows.map(({ benefit, plan }) => ({
    id: benefit.id,
    code: benefit.code,
    name: benefit.name,
    kind: benefit.kind,
    plan: plan?.name ?? 'Unknown plan',
    quantity: benefit.quantity === null ? 'unlimited' : String(benefit.quantity),
    unit: benefit.unit ?? 'unit',
    ruleSummary: `${benefit.kind} / ${benefit.quantity ?? 'unlimited'} ${benefit.unit ?? ''}`.trim(),
    entitlementSummary: 'Use entitlements table for active grants',
    updatedAt: formatIso(benefit.updatedAt),
    actions: ['Edit rule', 'Manual grant', 'Disable'],
  }));

  return {
    source: 'database',
    metrics: [
      { label: '权益数', value: String(records.length), hint: 'PostgreSQL', tone: 'info' },
      {
        label: '额度类',
        value: String(records.filter((record) => record.kind === 'quota').length),
        hint: 'quota',
        tone: 'success',
      },
      {
        label: '功能类',
        value: String(records.filter((record) => record.kind === 'feature').length),
        hint: 'feature',
        tone: 'default',
      },
      { label: '手动调整', value: 'ready', hint: 'Task 7 wiring', tone: 'warning' },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      { label: 'Quota', value: 'quota' },
      { label: 'Feature', value: 'feature' },
      { label: 'Support', value: 'support' },
    ],
    records,
  };
}
