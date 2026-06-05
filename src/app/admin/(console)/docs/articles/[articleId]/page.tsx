import { notFound } from 'next/navigation';

import { AdminDocEditor } from '@/features/admin/admin-doc-editor';
import type { AdminDocEditorData } from '@/features/admin/admin-docs-types';
import {
  getAdminDocArticle,
  listAdminDocCategories,
} from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

export default async function AdminDocArticleEditorPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const [categories, article] = await Promise.all([
    listAdminDocCategories(),
    articleId === 'new' ? Promise.resolve(null) : getAdminDocArticle(articleId),
  ]);

  if (articleId !== 'new' && !article) {
    notFound();
  }

  const data: AdminDocEditorData = article
    ? {
        categories,
        article: {
          id: article.id,
          categoryId: article.categoryId,
          title: article.title,
          slug: article.slug,
          summary: article.summary,
          coverImage: article.coverImage ?? '',
          status: article.status,
          blocks: article.blocks,
        },
      }
    : {
        categories,
        article: {
          categoryId: categories[0]?.id ?? '',
          title: '',
          slug: '',
          summary: '',
          coverImage: '',
          status: 'draft',
          blocks: [],
        },
      };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">
          {article ? '编辑文档' : '新建文档'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          结构化维护文档块内容，作为统一文档中心的唯一权威内容源。
        </p>
      </div>
      <AdminDocEditor data={data} />
    </div>
  );
}
