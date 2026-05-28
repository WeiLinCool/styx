import Link from 'next/link';
import {
  Bot,
  Boxes,
  FileText,
  Gift,
  Handshake,
  LayoutDashboard,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const adminNavItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/memberships', label: 'Memberships', icon: ShieldCheck },
  { href: '/admin/benefits', label: 'Benefits', icon: Gift },
  { href: '/admin/orders', label: 'Orders', icon: ReceiptText },
  { href: '/admin/ai-jobs', label: 'AI Jobs', icon: Bot },
  { href: '/admin/partners', label: 'Partners', icon: Handshake },
  { href: '/admin/content', label: 'Content', icon: FileText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

type AdminNavProps = {
  className?: string;
};

export function AdminNav({ className }: AdminNavProps) {
  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="Admin navigation">
      {adminNavItems.map((item) => {
        const Icon = item.icon;
        const isDashboard = item.href === '/admin';

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950',
              isDashboard && 'bg-neutral-950 text-white hover:bg-neutral-900 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      <div className="mt-3 rounded-md border border-neutral-200 bg-white p-3 text-xs text-neutral-600">
        <div className="mb-2 flex items-center gap-2 font-semibold text-neutral-950">
          <Boxes className="h-3.5 w-3.5" />
          Ops Scope
        </div>
        <p className="leading-5">Management modules are read-only until Task 7 wires mutation APIs.</p>
      </div>
    </nav>
  );
}
