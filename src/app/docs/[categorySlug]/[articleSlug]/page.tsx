import { notFound } from 'next/navigation';

import { DocsArticlePage } from '@/features/public/docs-article-page';
import type { DocsNavItem } from '@/features/public/docs-navigation';
import { resolveSession } from '@/server/auth/session';
import {
  getPublishedDocArticle,
  listPublishedDocs,
} from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

export default async function DocsArticleRoutePage({
  params,
}: {
  params: Promise<{ categorySlug: string; articleSlug: string }>;
}) {
  const { categorySlug, articleSlug } = await params;
  const session = await resolveSession();
  const audience =
    session.authenticated && session.user.adminRoles.length > 0 ? 'admin' : 'user';
  const [docs, article] = await Promise.all([
    listPublishedDocs({ audience }),
    getPublishedDocArticle({ audience, categorySlug, articleSlug }),
  ]);

  if (!article) {
    notFound();
  }

  const items: DocsNavItem[] = docs.map((item) => ({
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    categorySlug: item.categorySlug,
    audienceScope: item.audienceScope,
    articleId: item.articleId,
    articleSlug: item.articleSlug,
    title: item.title,
    summary: item.summary,
  }));

  return (
    <DocsArticlePage
      navigationItems={items}
      article={{
        categoryName: article.categoryName,
        categorySlug: article.categorySlug,
        title: article.title,
        summary: article.summary,
        coverImage: article.coverImage,
        blocks: article.blocks,
      }}
    />
  );
}
