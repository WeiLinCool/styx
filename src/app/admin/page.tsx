import {
  AlertTriangle,
  Bot,
  Handshake,
  ReceiptText,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/features/admin/status-badge';
import {
  getAdminDashboard,
  type AdminDashboardData,
  type DashboardTone,
} from '@/server/repositories/admin-dashboard';

const kpiToneClassName: Record<DashboardTone, string> = {
  default: 'border-neutral-200 bg-white',
  success: 'border-emerald-200 bg-emerald-50',
  warning: 'border-amber-200 bg-amber-50',
  danger: 'border-red-200 bg-red-50',
  info: 'border-blue-200 bg-blue-50',
};

export const dynamic = 'force-dynamic';

function formatDateTime(value: string) {
  if (value === '未记录') {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 rounded-lg border-neutral-200 bg-white py-0 shadow-sm">
      <CardHeader className="flex h-11 flex-row items-center gap-2 border-b border-neutral-200 px-4 py-0">
        <div className="text-neutral-500">{icon}</div>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0 py-0">{children}</CardContent>
    </Card>
  );
}

function KpiGrid({ dashboard }: { dashboard: AdminDashboardData }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {dashboard.kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={`rounded-lg border p-4 shadow-sm ${kpiToneClassName[kpi.tone]}`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{kpi.label}</p>
            <StatusBadge value={kpi.change} tone={kpi.tone} />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-950">{kpi.value}</p>
        </div>
      ))}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const dashboard = await getAdminDashboard();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-950">Dashboard</h2>
          <p className="mt-1 text-sm text-neutral-600">账号、订单、AI 任务与合作线索的运营概览。</p>
        </div>
        <StatusBadge
          value={dashboard.source === 'database' ? 'PostgreSQL' : 'Seed fallback'}
          tone={dashboard.source === 'database' ? 'success' : 'warning'}
        />
      </div>

      <KpiGrid dashboard={dashboard} />

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Recent Users" icon={<Users className="h-4 w-4" />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.recentUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium text-neutral-950">{user.name}</div>
                    <div className="text-xs text-neutral-500">{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={user.accountState} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-neutral-500">
                    {formatDateTime(user.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="Recent AI Jobs" icon={<Bot className="h-4 w-4" />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.recentAiJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <div className="font-medium text-neutral-950">{job.type}</div>
                    <div className="text-xs text-neutral-500">{job.model} · {job.owner}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={job.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-neutral-500">
                    {formatDateTime(job.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="Recent Orders" icon={<ReceiptText className="h-4 w-4" />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="font-medium text-neutral-950">{order.orderNumber}</div>
                    <div className="text-xs text-neutral-500">{order.customer} · {formatDateTime(order.createdAt)}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={order.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium text-neutral-950">{order.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="Partner Leads" icon={<Handshake className="h-4 w-4" />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>公司</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">来源</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard.partnerLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="font-medium text-neutral-950">{lead.companyName}</div>
                    <div className="text-xs text-neutral-500">{lead.contactName} · {formatDateTime(lead.createdAt)}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={lead.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-neutral-500">{lead.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>

      <SectionCard title="Notices" icon={<AlertTriangle className="h-4 w-4" />}>
        <div className="divide-y divide-neutral-200">
          {dashboard.notices.map((notice) => (
            <div key={notice.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-950">{notice.title}</div>
                <div className="mt-1 text-sm text-neutral-600">{notice.description}</div>
              </div>
              <StatusBadge value={notice.tone} tone={notice.tone} />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
