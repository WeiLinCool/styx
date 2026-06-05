import { AdminDocImportModule } from '@/features/admin/admin-doc-import-module';
import { listAdminDocCategories } from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

export default async function AdminDocImportPage() {
  const categories = await listAdminDocCategories();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">导入文档</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          支持选择或粘贴文档内容，一次性转换为草稿文章，后续可继续校对和发布。
        </p>
      </div>
      <AdminDocImportModule categories={categories} />
    </div>
  );
}
