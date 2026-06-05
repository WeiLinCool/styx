import { AdminModuleGuide } from '@/features/admin/admin-module-guide';
import { AdminModulePage, type AdminColumn } from '@/features/admin/module-page';
import { StatusBadge } from '@/features/admin/status-badge';
import type { AdminDocArticleRow, AdminDocCategoryRow } from '@/server/repositories/docs';
import { AdminDocRowActions, CreateDocArticleButton } from './admin-docs-actions';

const columns: AdminColumn<AdminDocArticleRow>[] = [
  {
    key: 'article',
    label: '文档',
    render: (article) => (
      <div>
        <div className="font-medium text-foreground">{article.title}</div>
        <div className="text-xs text-muted-foreground">{article.slug}</div>
      </div>
    ),
  },
  {
    key: 'category',
    label: '分类 / 角色',
    render: (article) => (
      <div>
        <div className="text-sm text-foreground">{article.categoryName}</div>
        <div className="text-xs text-muted-foreground">{article.categorySlug}</div>
      </div>
    ),
  },
  {
    key: 'summary',
    label: '摘要',
    render: (article) => <div className="max-w-xs text-xs text-muted-foreground">{article.summary || '未填写摘要'}</div>,
  },
  {
    key: 'status',
    label: '状态',
    render: (article) => <StatusBadge value={article.status} />,
  },
  {
    key: 'updatedAt',
    label: '更新时间',
    render: (article) => (
      <div className="text-xs text-muted-foreground">
        <div>{article.updatedAt}</div>
        <div>{article.publishedAt !== '未记录' ? `发布: ${article.publishedAt}` : '未发布'}</div>
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (article) => <AdminDocRowActions article={article} />,
  },
];

function CategoryStrip({ categories }: { categories: AdminDocCategoryRow[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => (
        <section key={category.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">{category.name}</div>
              <div className="text-xs text-muted-foreground">{category.slug}</div>
            </div>
            <StatusBadge value={category.audienceScope} tone="info" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{category.description || '暂无分类说明。'}</p>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{category.articleCount} 篇文档</span>
            <span>{category.updatedAt}</span>
          </div>
        </section>
      ))}
    </div>
  );
}

export function AdminDocsModule({
  source,
  metrics,
  filters,
  records,
  categories,
}: {
  source: 'database' | 'seed';
  metrics: Parameters<typeof AdminModulePage<AdminDocArticleRow>>[0]['metrics'];
  filters: Parameters<typeof AdminModulePage<AdminDocArticleRow>>[0]['filters'];
  records: AdminDocArticleRow[];
  categories: AdminDocCategoryRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <CreateDocArticleButton />
      </div>
      <CategoryStrip categories={categories} />
      <AdminModulePage
        title="文档中心"
        description="统一维护用户端与管理端操作说明，按角色控制可见范围，支持 Markdown 导入为多模态块内容。"
        source={source}
        metrics={metrics}
        filters={filters}
        records={records}
        columns={columns}
        searchPlaceholder="搜索分类、标题、slug 或摘要..."
        guide={
          <AdminModuleGuide
            title="文档运维建议"
            description="一套文档中心按角色切换内容；管理端负责结构维护、草稿校对、发布与下线。"
            steps={[
              '先维护分类与 audience 范围，确保用户端和管理端查阅路径清晰。',
              '新文档优先通过 Markdown 导入生成草稿，再到编辑页校对块结构、摘要和封面。',
              '发布前检查目标角色、分类归属和步骤图文/FAQ/媒体块是否完整，再执行发布。',
            ]}
            risks={[
              '已发布文档会立即影响 /docs 可见内容，错误 audience 可能导致角色错看或漏看。',
              'JSON 块内容是当前唯一权威内容源，手改时必须保持合法 block 结构。',
              'Markdown 导入只做一次转换，导入后需要在编辑页复核复杂媒体或流程图内容。',
            ]}
            defaultOpen
          />
        }
      />
    </div>
  );
}
