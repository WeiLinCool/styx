import { desc, eq } from 'drizzle-orm';

import { schema } from '@/server/db';
import {
  type AdminModuleData,
  ensureAdminReadSource,
  formatIso,
  metadataText,
} from './admin-shared';

export type AdminPartnerRow = {
  id: string;
  companyName: string;
  contact: string;
  status: string;
  source: string;
  owner: string;
  benefitInterest: string;
  nextAction: string;
  notes: string;
  createdAt: string;
  actions: string[];
};

function getSeedPartners(): AdminModuleData<AdminPartnerRow> {
  const records: AdminPartnerRow[] = [
    {
      id: 'seed-lead-1',
      companyName: 'Seed Partner Co.',
      contact: 'Seed Contact / partner@styx.local',
      status: 'qualified',
      source: 'partner-benefits',
      owner: 'Styx Admin',
      benefitInterest: '渠道分佣 / 团队套餐',
      nextAction: '安排商务演示',
      notes: 'Representative partner lead for admin views.',
      createdAt: '2026-05-29T03:00:00.000Z',
      actions: ['Assign owner', 'Advance stage', 'Close'],
    },
    {
      id: 'seed-lead-2',
      companyName: 'Creator Studio',
      contact: 'Lin / +86 139 0000 0000',
      status: 'contacted',
      source: 'homepage',
      owner: '未分配',
      benefitInterest: 'API usage / media credits',
      nextAction: '补充用量需求',
      notes: '等待对方确认团队规模。',
      createdAt: '2026-05-28T12:00:00.000Z',
      actions: ['Assign owner', 'Advance stage', 'Close'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '线索数', value: '2', hint: 'seed leads', tone: 'info' },
      { label: '已联系', value: '1', hint: 'contacted', tone: 'warning' },
      { label: '已确认', value: '1', hint: 'qualified', tone: 'success' },
      { label: '待分配', value: '1', hint: 'owner empty', tone: 'default' },
    ],
    filters: [
      { label: 'All', value: 'all', count: 2 },
      { label: 'New', value: 'new' },
      { label: 'Contacted', value: 'contacted', count: 1 },
      { label: 'Qualified', value: 'qualified', count: 1 },
    ],
    records,
  };
}

export async function getAdminPartners(): Promise<AdminModuleData<AdminPartnerRow>> {
  const database = ensureAdminReadSource('partners');

  if (!database) {
    return getSeedPartners();
  }

  const rows = await database
    .select({
      lead: schema.partnerLeads,
      owner: schema.users,
    })
    .from(schema.partnerLeads)
    .leftJoin(schema.users, eq(schema.users.id, schema.partnerLeads.ownerUserId))
    .orderBy(desc(schema.partnerLeads.createdAt))
    .limit(100);

  const records = rows.map(({ lead, owner }) => ({
    id: lead.id,
    companyName: lead.companyName,
    contact: [lead.contactName, lead.contactEmail ?? lead.contactPhone].filter(Boolean).join(' / '),
    status: lead.status,
    source: lead.source ?? 'unknown',
    owner: owner?.displayName ?? '未分配',
    benefitInterest: metadataText(lead.metadata, 'benefitInterest', '待补充'),
    nextAction: metadataText(lead.metadata, 'nextAction', '运营跟进'),
    notes: lead.notes ?? '未记录',
    createdAt: formatIso(lead.createdAt),
    actions: ['Assign owner', 'Advance stage', 'Close'],
  }));

  return {
    source: 'database',
    metrics: [
      { label: '线索数', value: String(records.length), hint: 'PostgreSQL', tone: 'info' },
      {
        label: '新线索',
        value: String(records.filter((record) => record.status === 'new').length),
        hint: 'new',
        tone: 'warning',
      },
      {
        label: '已确认',
        value: String(records.filter((record) => record.status === 'qualified').length),
        hint: 'qualified',
        tone: 'success',
      },
      {
        label: '待分配',
        value: String(records.filter((record) => record.owner === '未分配').length),
        hint: 'owner empty',
        tone: 'default',
      },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      { label: 'New', value: 'new' },
      { label: 'Contacted', value: 'contacted' },
      { label: 'Qualified', value: 'qualified' },
      { label: 'Converted', value: 'converted' },
    ],
    records,
  };
}
