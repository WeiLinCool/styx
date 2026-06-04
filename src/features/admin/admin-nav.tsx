'use client';

import { Boxes, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { ADMIN_NAV_ITEMS } from './admin-nav-config';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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
  const grouped = useMemo(() => {
    const core = ADMIN_NAV_ITEMS.filter((item) => item.group !== 'more');
    const more = ADMIN_NAV_ITEMS.filter((item) => item.group === 'more');
    return { core, more };
  }, []);
  const hasMoreActive = grouped.more.some((item) => isAdminNavItemActive(item.href, pathname));
  const [moreOpen, setMoreOpen] = useState(hasMoreActive);

  return (
    <nav className={cn('flex flex-col gap-1', className)} aria-label="后台导航">
      {grouped.core.map((item) => {
        const Icon = item.icon;
        const isActive = isAdminNavItemActive(item.href, pathname);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              isActive && 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="mt-1">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex h-9 w-full items-center justify-between rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              hasMoreActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
            )}
          >
            <span>更多</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 transition-transform',
                moreOpen && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1 space-y-1">
          {grouped.more.map((item) => {
            const Icon = item.icon;
            const isActive = isAdminNavItemActive(item.href, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex h-9 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive && 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </CollapsibleContent>
      </Collapsible>

      <div className="mt-3 rounded-md border border-sidebar-border bg-card/80 p-3 text-xs text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
          <Boxes className="h-3.5 w-3.5" />
          运营范围
        </div>
        <p className="leading-5">客服可处理账号激活、订单和 AI 任务等运营事项。</p>
      </div>
    </nav>
  );
}
