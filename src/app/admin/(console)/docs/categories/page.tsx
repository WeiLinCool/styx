import { listAdminDocCategories } from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

export default async function AdminDocCategoriesPage() {
  const categories = await listAdminDocCategories();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">文档分类</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          当前版本先通过 API 建分类，页面侧提供只读巡检，后续可继续扩充树形编辑能力。
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <section key={category.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-semibold text-foreground">{category.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{category.slug}</div>
            <div className="mt-3 text-sm text-muted-foreground">{category.description || '暂无描述'}</div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{category.audienceScope}</span>
              <span>{category.articleCount} 篇</span>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
