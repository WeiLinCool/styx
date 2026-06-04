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
  default: 'border-border bg-card',
  success: 'border-success/30 bg-success-surface',
  warning: 'border-warning/30 bg-warning-surface',
  danger: 'border-destructive/30 bg-destructive/10',
  info: 'border-info/30 bg-info-surface',
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
    <Card className="gap-0 rounded-lg border-border bg-card py-0 shadow-sm">
      <CardHeader className="flex h-11 flex-row items-center gap-2 border-b border-border px-4 py-0">
        <div className="text-muted-foreground">{icon}</div>
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
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
            <StatusBadge value={kpi.change} tone={kpi.tone} />
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{kpi.value}</p>
        </div>
      ))}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const dashboard = await getAdminDashboard();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">仪表盘</h2>
          <p className="mt-1 text-sm text-muted-foreground">账号、订单、AI 任务与合作线索的运营概览。</p>
        </div>
        <StatusBadge
          value={dashboard.source === 'database' ? '数据库' : '种子数据'}
          tone={dashboard.source === 'database' ? 'success' : 'warning'}
        />
      </div>

      <KpiGrid dashboard={dashboard} />

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="最近用户" icon={<Users className="h-4 w-4" />}>
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
                    <div className="font-medium text-foreground">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={user.accountState} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDateTime(user.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="最近 AI 任务" icon={<Bot className="h-4 w-4" />}>
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
                    <div className="font-medium text-foreground">{job.type}</div>
                    <div className="text-xs text-muted-foreground">{job.model} · {job.owner}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={job.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDateTime(job.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="最近订单" icon={<ReceiptText className="h-4 w-4" />}>
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
                    <div className="font-medium text-foreground">{order.orderNumber}</div>
                    <div className="text-xs text-muted-foreground">{order.customer} · {formatDateTime(order.createdAt)}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={order.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium text-foreground">{order.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="合作线索" icon={<Handshake className="h-4 w-4" />}>
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
                    <div className="font-medium text-foreground">{lead.companyName}</div>
                    <div className="text-xs text-muted-foreground">{lead.contactName} · {formatDateTime(lead.createdAt)}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={lead.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{lead.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>

      <SectionCard title="系统提示" icon={<AlertTriangle className="h-4 w-4" />}>
        <div className="divide-y divide-border">
          {dashboard.notices.map((notice) => (
            <div key={notice.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">{notice.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{notice.description}</div>
              </div>
              <StatusBadge value={notice.tone} tone={notice.tone} />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
