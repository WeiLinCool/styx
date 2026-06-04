'use client';

import { useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Route,
  ShieldAlert,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

type AdminModuleGuideProps = {
  title: string;
  description: string;
  steps: string[];
  risks?: string[];
  children?: ReactNode;
  defaultOpen?: boolean;
};

export function getAdminModuleGuideInitialOpen(defaultOpen = false) {
  return defaultOpen;
}

export function getAdminModuleGuideToggleLabel(open: boolean) {
  return open ? '收起' : '展开';
}

export function AdminModuleGuide({
  title,
  description,
  steps,
  risks = [],
  children,
  defaultOpen = false,
}: AdminModuleGuideProps) {
  const [open, setOpen] = useState(getAdminModuleGuideInitialOpen(defaultOpen));

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      asChild
    >
      <section
        aria-labelledby="admin-module-guide-title"
        className="rounded-lg border border-info/30 bg-info-surface p-4 text-sm text-muted-foreground shadow-sm"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md bg-card text-info">
                新手导航
              </Badge>
              <h3 id="admin-module-guide-title" className="text-sm font-semibold text-foreground">
                {title}
              </h3>
            </div>
            <p className="leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {children}
            <CollapsibleTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-8 rounded-md bg-card">
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {getAdminModuleGuideToggleLabel(open)}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-md border border-info/30 bg-card p-3">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <Route className="h-4 w-4 text-blue-600" />
                推荐路径
              </div>
              <ol className="space-y-2">
                {steps.map((step, index) => (
                  <li key={step} className="flex gap-2 leading-5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-md border border-warning/30 bg-card p-3">
              <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                {risks.length > 0 ? (
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
                发布前确认
              </div>
              {risks.length > 0 ? (
                <ul className="space-y-2">
                  {risks.map((risk) => (
                    <li key={risk} className="flex gap-2 leading-5">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="leading-5 text-muted-foreground">当前模块暂无额外风险提示。</p>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
