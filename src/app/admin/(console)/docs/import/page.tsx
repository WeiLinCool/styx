import { AdminDocImportModule } from '@/features/admin/admin-doc-import-module';
import { listAdminDocCategories } from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

export default async function AdminDocImportPage() {
  const categories = await listAdminDocCategories();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Markdown 导入</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          支持将 Markdown 一次性解析为内部块模型，并直接生成草稿文章供后续校对。
        </p>
      </div>
      <AdminDocImportModule categories={categories} />
    </div>
  );
}
