import {
  BookOpenText,
  Bot,
  Boxes,
  BrainCircuit,
  FileText,
  Gift,
  Handshake,
  KeyRound,
  LayoutDashboard,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: '仪表盘', icon: LayoutDashboard },
  { href: '/admin/users', label: '用户', icon: Users },
  { href: '/admin/memberships', label: '会员', icon: ShieldCheck },
  { href: '/admin/benefits', label: '权益', icon: Gift },
  { href: '/admin/orders', label: '订单', icon: ReceiptText },
  { href: '/admin/ai-jobs', label: 'AI 任务', icon: Bot },
  { href: '/admin/ai-models', label: 'AI 模型', icon: BrainCircuit },
  { href: '/admin/agent-capabilities', label: 'Agent 能力', icon: Boxes },
  { href: '/admin/partners', label: '合作', icon: Handshake },
  { href: '/admin/content', label: '内容', icon: FileText },
  { href: '/admin/permissions', label: '权限', icon: KeyRound },
  { href: '/admin/settings', label: '设置', icon: Settings },
  { href: '/admin/help-center', label: '帮助中心', icon: BookOpenText },
];

export function getAdminNavItemByHref(href: string) {
  return ADMIN_NAV_ITEMS.find((item) => item.href === href);
}
