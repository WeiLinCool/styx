import {
  BookOpenText,
  BookMarked,
  Bot,
  Boxes,
  BrainCircuit,
  FileText,
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
  group?: 'core' | 'more';
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: '仪表盘', icon: LayoutDashboard, group: 'core' },
  { href: '/admin/users', label: '用户管理', icon: Users, group: 'core' },
  { href: '/admin/memberships', label: '会员方案', icon: ShieldCheck, group: 'core' },
  { href: '/admin/orders', label: '订单管理', icon: ReceiptText, group: 'core' },
  { href: '/admin/ai-jobs', label: 'AI 任务', icon: Bot, group: 'core' },
  { href: '/admin/ai-models', label: 'AI 模型', icon: BrainCircuit, group: 'core' },
  { href: '/admin/agent-capabilities', label: 'Agent 能力', icon: Boxes, group: 'more' },
  { href: '/admin/partners', label: '合作管理', icon: Handshake, group: 'more' },
  { href: '/admin/content', label: '内容管理', icon: FileText, group: 'more' },
  { href: '/admin/settings', label: '系统设置', icon: Settings, group: 'more' },
  { href: '/admin/docs', label: '文档中心', icon: BookMarked, group: 'more' },
  { href: '/admin/permissions', label: '权限', icon: KeyRound, group: 'more' },
  { href: '/admin/help-center', label: '帮助中心', icon: BookOpenText, group: 'more' },
];

export function getAdminNavItemByHref(href: string) {
  return ADMIN_NAV_ITEMS.find((item) => item.href === href);
}
