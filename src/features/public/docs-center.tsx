import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DocsNavigation, type DocsNavItem } from './docs-navigation';

export function DocsCenter({
  items,
  audience,
}: {
  items: DocsNavItem[];
  audience: 'user' | 'admin';
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.18),_transparent_32%),linear-gradient(180deg,_#f8f5ef_0%,_#f3efe7_48%,_#ebe5d9_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 lg:flex-row lg:px-6">
        <div className="lg:w-80">
          <DocsNavigation items={items} />
        </div>
        <main className="min-w-0 flex-1 space-y-6">
          <section className="rounded-[2rem] border border-stone-200 bg-white/80 p-8 shadow-sm backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">
              {audience === 'admin' ? 'Admin Docs' : 'User Docs'}
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-950">系统操作说明中心</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
              同一套文档中心根据角色切换内容。这里汇总图文步骤、音视频说明、FAQ、流程图和截图轮播，统一走已发布内容。
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Card key={item.articleId} className="gap-0 rounded-[1.75rem] border-stone-200 bg-white/85 py-0">
                <CardHeader className="gap-3 px-6 py-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                    {item.categoryName}
                  </div>
                  <CardTitle className="text-xl text-stone-950">{item.title}</CardTitle>
                  <CardDescription className="line-clamp-3 leading-6">{item.summary || '暂无摘要'}</CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <Link
                    href={`/docs/${item.categorySlug}/${item.articleSlug}`}
                    className="inline-flex rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700"
                  >
                    查看文档
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
