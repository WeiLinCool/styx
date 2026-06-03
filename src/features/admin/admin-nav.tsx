'use client';

import { Boxes } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { ADMIN_NAV_ITEMS } from './admin-nav-config';

type AdminNavProps = {
  className?: string;
};

export function isAdminNavItemActive(href: string, pathname: string) {
  if (href === '/admin') {
    return pathname === '/admin';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ className }: AdminNavProps) {
  const pathname = usePathname();

  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="后台导航">
      {ADMIN_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = isAdminNavItemActive(item.href, pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950',
              isActive && 'bg-neutral-950 text-white hover:bg-neutral-900 hover:text-white',
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
          运营范围
        </div>
        <p className="leading-5">客服可处理账号激活、订单和 AI 任务等运营事项。</p>
      </div>
    </nav>
  );
}
