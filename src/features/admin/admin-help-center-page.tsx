import Link from 'next/link';
import {
  ArrowRight,
  BookOpenText,
  Boxes,
  Database,
  LayoutPanelTop,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ADMIN_HELP_CENTER_LAYERS,
  ADMIN_HELP_CENTER_RELATIONSHIPS,
  getAdminHelpCenterGroups,
  getAdminHelpCenterQuickLinks,
} from './admin-help-center-config';

const layerIcons = {
  frontend: LayoutPanelTop,
  admin: BookOpenText,
  agent: Sparkles,
  data: Database,
} as const;

export function AdminHelpCenterPage() {
  const groups = getAdminHelpCenterGroups();
  const quickLinks = getAdminHelpCenterQuickLinks();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <BookOpenText className="h-4 w-4" />
              帮助中心
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
              用一页看懂后台模块、前台触点、Agent 能力和数据规则如何协同
            </h2>
            <p className="mt-3 text-sm leading-6 text-neutral-600">
              这里不是操作队列，而是后台运营知识入口。你可以先看系统总览，再按模块分区理解上游依赖、下游影响和常见操作，最后直接跳转到真实管理页。
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {quickLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link key={item.href} href={item.href} className="block">
                  <div className="flex min-w-40 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <Card className="rounded-xl border-neutral-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-neutral-500" />
            <CardTitle className="text-base font-semibold text-neutral-950">系统总览</CardTitle>
          </div>
          <p className="text-sm leading-6 text-neutral-600">
            帮助中心首版把平台拆成四层来看，先判断用户看到什么，再回看后台如何配置、Agent 如何供给、数据规则如何生效。
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 py-5 lg:grid-cols-4">
          {ADMIN_HELP_CENTER_LAYERS.map((layer) => {
            const Icon = layerIcons[layer.id as keyof typeof layerIcons];

            return (
              <div key={layer.id} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-neutral-600" />
                  <h3 className="text-sm font-semibold text-neutral-950">{layer.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-neutral-600">{layer.description}</p>
                <ul className="mt-3 space-y-2 text-sm text-neutral-700">
                  {layer.bullets.map((bullet) => (
                    <li key={bullet} className="rounded-md border border-neutral-200 bg-white px-2.5 py-2">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.id} className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-neutral-950">{group.title}</h3>
              <p className="mt-1 text-sm text-neutral-600">{group.description}</p>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {group.modules.map((module) => {
                const Icon = module.navItem.icon;

                return (
                  <Card key={module.navHref} className="rounded-xl border-neutral-200 bg-white py-0 shadow-sm">
                    <CardHeader className="border-b border-neutral-200 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-neutral-600" />
                            <CardTitle className="text-base font-semibold text-neutral-950">
                              {module.navItem.label}
                            </CardTitle>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-neutral-600">{module.role}</p>
                        </div>
                        <Badge variant="secondary" className="rounded-md bg-neutral-100 text-neutral-700">
                          模块卡片
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 px-5 py-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <DetailBlock title="关联前台" items={module.relatedFrontend} />
                        <DetailBlock title="依赖上游" items={module.upstream} />
                        <DetailBlock title="影响下游" items={module.downstream} />
                        <DetailBlock title="常见操作" items={module.actions} />
                      </div>
                      <div className="flex justify-end">
                        <Button asChild size="sm" className="rounded-md">
                          <Link href={module.navHref}>
                            进入模块
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Card className="rounded-xl border-neutral-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-neutral-200 px-5 py-4">
          <CardTitle className="text-base font-semibold text-neutral-950">关键链路</CardTitle>
          <p className="text-sm leading-6 text-neutral-600">
            如果你要排查“为什么用户看到的是现在这样”，优先从下面三条链路逆推。
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 py-5 lg:grid-cols-3">
          {ADMIN_HELP_CENTER_RELATIONSHIPS.map((relationship) => (
            <div key={relationship.title} className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <h3 className="text-sm font-semibold text-neutral-950">{relationship.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{relationship.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
