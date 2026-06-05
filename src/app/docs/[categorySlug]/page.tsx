import { notFound } from 'next/navigation';

import { DocsCenter } from '@/features/public/docs-center';
import type { DocsNavItem } from '@/features/public/docs-navigation';
import { resolveSession } from '@/server/auth/session';
import { listPublishedDocs } from '@/server/repositories/docs';

export const dynamic = 'force-dynamic';

export default async function DocsCategoryPage({
  params,
}: {
  params: Promise<{ categorySlug: string }>;
}) {
  const { categorySlug } = await params;
  const session = await resolveSession();
  const audience =
    session.authenticated && session.user.adminRoles.length > 0 ? 'admin' : 'user';
  const docs = await listPublishedDocs({ audience });
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

  if (!items.some((item) => item.categorySlug === categorySlug)) {
    notFound();
  }

  return <DocsCenter items={items.filter((item) => item.categorySlug === categorySlug)} audience={audience} />;
}
