import { AdminDocCategoriesManager } from '@/features/admin/admin-doc-categories-manager';
import { listAdminDocCategories } from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

export default async function AdminDocCategoriesPage() {
  const categories = await listAdminDocCategories();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">分类目录</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          维护两级目录、可见范围与排序；禁止删除仍有关联文档或子分类的节点。
        </p>
      </div>
      <AdminDocCategoriesManager categories={categories} />
    </div>
  );
}
