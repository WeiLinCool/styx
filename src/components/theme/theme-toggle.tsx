'use client';

import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '夜间', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const;

type ThemeToggleProps = {
  className?: string;
  variant?: 'ghost' | 'outline';
  align?: 'start' | 'center' | 'end';
};

export function ThemeToggle({
  className,
  variant = 'outline',
  align = 'end',
}: ThemeToggleProps) {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2];
  const CurrentIcon = current.icon;

  if (!mounted) {
    return (
      <Button
        type="button"
        variant={variant}
        size="icon"
        className={cn('shrink-0', className)}
        aria-label="主题切换"
      >
        <Monitor className="size-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="icon"
          className={cn('shrink-0', className)}
          aria-label="主题切换"
        >
          <CurrentIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-40">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = option.value === theme;

          return (
            <DropdownMenuItem
              key={option.value}
              className="flex items-center justify-between"
              onClick={() => setTheme(option.value)}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4" />
                {option.label}
              </span>
              {active ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
