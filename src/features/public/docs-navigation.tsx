import Link from 'next/link';

import { cn } from '@/lib/utils';

export type DocsNavItem = {
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  audienceScope: 'user' | 'admin' | 'shared';
  articleId: string;
  articleSlug: string;
  title: string;
  summary: string;
};

export function DocsNavigation({
  items,
  activeCategorySlug,
  activeArticleSlug,
}: {
  items: DocsNavItem[];
  activeCategorySlug?: string;
  activeArticleSlug?: string;
}) {
  const groups = items.reduce<Record<string, { name: string; items: DocsNavItem[] }>>((acc, item) => {
    if (!acc[item.categorySlug]) {
      acc[item.categorySlug] = { name: item.categoryName, items: [] };
    }
    acc[item.categorySlug]?.items.push(item);
    return acc;
  }, {});

  return (
    <aside className="rounded-3xl border border-stone-200 bg-white/85 p-5 shadow-sm backdrop-blur">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Doc Center</div>
        <div className="mt-1 text-lg font-semibold text-stone-950">文档导航</div>
      </div>
      <div className="space-y-5">
        {Object.entries(groups).map(([categorySlug, group]) => (
          <section key={categorySlug} className="space-y-2">
            <Link
              href={`/docs/${categorySlug}`}
              className={cn(
                'block rounded-2xl px-3 py-2 text-sm font-semibold transition-colors',
                activeCategorySlug === categorySlug
                  ? 'bg-stone-900 text-stone-50'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200',
              )}
            >
              {group.name}
            </Link>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active =
                  activeCategorySlug === item.categorySlug && activeArticleSlug === item.articleSlug;

                return (
                  <Link
                    key={item.articleId}
                    href={`/docs/${item.categorySlug}/${item.articleSlug}`}
                    className={cn(
                      'block rounded-2xl px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-amber-100 text-amber-950'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                    )}
                  >
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs text-stone-500">{item.summary || '暂无摘要'}</div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
