import Link from 'next/link';

import { AdminModuleGuide } from '@/features/admin/admin-module-guide';
import { AdminModulePage, type AdminColumn } from '@/features/admin/module-page';
import { StatusBadge } from '@/features/admin/status-badge';
import type { AdminDocArticleRow, AdminDocCategoryRow } from '@/server/repositories/docs';
import { AdminDocRowActions, DocCenterActionButtons } from './admin-docs-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ActiveFilters = {
  status: 'all' | 'draft' | 'published' | 'archived';
  categoryId: string;
  search: string;
};

function formatAudienceScope(scope: AdminDocCategoryRow['audienceScope']) {
  if (scope === 'user') {
    return '用户可见';
  }
  if (scope === 'admin') {
    return '管理端可见';
  }
  return '全部可见';
}

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
            <StatusBadge value={formatAudienceScope(category.audienceScope)} tone="info" />
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

function buildDocListHref(filters: ActiveFilters) {
  const params = new URLSearchParams();
  if (filters.status !== 'all') {
    params.set('status', filters.status);
  }
  if (filters.categoryId) {
    params.set('categoryId', filters.categoryId);
  }
  if (filters.search) {
    params.set('search', filters.search);
  }

  const query = params.toString();
  return query ? `/admin/docs?${query}` : '/admin/docs';
}

function DocsToolbar({
  filters,
  categories,
  activeFilters,
}: {
  filters: Parameters<typeof AdminModulePage<AdminDocArticleRow>>[0]['filters'];
  categories: AdminDocCategoryRow[];
  activeFilters: ActiveFilters;
}) {
  return (
    <div className="flex flex-col gap-3">
      <form action="/admin/docs" className="flex flex-col gap-2 md:flex-row md:items-center">
        {activeFilters.status !== 'all' ? <input type="hidden" name="status" value={activeFilters.status} /> : null}
        <div className="relative w-full md:w-80">
          <Input
            name="search"
            defaultValue={activeFilters.search}
            placeholder="搜索分类、标题、访问路径标识或摘要..."
            className="h-9 rounded-md border-input bg-background text-sm"
          />
        </div>
        <select
          name="categoryId"
          defaultValue={activeFilters.categoryId}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs"
        >
          <option value="">全部分类</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" className="h-9 rounded-md">
          筛选
        </Button>
        <Button type="button" variant="outline" className="h-9 rounded-md" asChild>
          <Link href="/admin/docs">清除</Link>
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {filters.map((filter) => {
          const nextFilters: ActiveFilters = {
            ...activeFilters,
            status:
              filter.value === 'draft' || filter.value === 'published' || filter.value === 'archived'
                ? filter.value
                : 'all',
          };
          const active = nextFilters.status === activeFilters.status;

          return (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              className="h-7 rounded-md px-2 text-xs"
              asChild
            >
              <Link href={buildDocListHref(nextFilters)}>
                {filter.label}
                {typeof filter.count === 'number' ? ` ${filter.count}` : ''}
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function AdminDocsModule({
  source,
  metrics,
  filters,
  records,
  categories,
  activeFilters,
}: {
  source: 'database' | 'seed';
  metrics: Parameters<typeof AdminModulePage<AdminDocArticleRow>>[0]['metrics'];
  filters: Parameters<typeof AdminModulePage<AdminDocArticleRow>>[0]['filters'];
  records: AdminDocArticleRow[];
  categories: AdminDocCategoryRow[];
  activeFilters: ActiveFilters;
}) {
  return (
    <div className="space-y-4">
      <DocCenterActionButtons />
      <CategoryStrip categories={categories} />
      <AdminModulePage
        title="文档中心"
        description="统一维护用户端与管理端操作说明，按可见范围控制查阅对象，支持导入文档并生成多模态块内容。"
        source={source}
        metrics={metrics}
        filters={filters}
        records={records}
        columns={columns}
        searchPlaceholder="搜索分类、标题、访问路径标识或摘要..."
        toolbar={<DocsToolbar filters={filters} categories={categories} activeFilters={activeFilters} />}
        guide={
          <AdminModuleGuide
            title="文档运维建议"
            description="一套文档中心按角色切换内容；管理端负责结构维护、草稿校对、发布与下线。"
            steps={[
              '先维护分类与可见范围，确保用户端和管理端查阅路径清晰。',
              '新文档优先通过导入文档生成草稿，再到编辑页校对块结构、摘要和封面。',
              '发布前检查目标角色、分类归属和步骤图文/FAQ/媒体块是否完整，再执行发布。',
            ]}
            risks={[
              '已发布文档会立即影响 /docs 可见内容，错误可见范围可能导致角色错看或漏看。',
              'JSON 块内容是当前唯一权威内容源，手改时必须保持合法 block 结构。',
              '文档导入只做一次转换，导入后需要在编辑页复核复杂媒体或流程图内容。',
            ]}
            defaultOpen
          />
        }
      />
    </div>
  );
}
