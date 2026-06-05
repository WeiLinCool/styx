import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { AccountDomainError } from '@/server/auth/account-types';
import { db, schema } from '@/server/db';
import { docBlockSchema, type DocBlock } from '@/server/docs/schema';
import {
  ensureAdminReadSource,
  formatIso,
  type AdminModuleData,
} from './admin-shared';

export type DocsAudience = 'user' | 'admin';
export type DocAudienceScope = 'user' | 'admin' | 'shared';
export type DocArticleStatus = 'draft' | 'published' | 'archived';

export type DocCategoryInput = {
  name: string;
  slug: string;
  description?: string;
  parentId?: string | null;
  audienceScope?: DocAudienceScope;
  sortOrder?: number;
};

export type DocArticleInput = {
  categoryId: string;
  title: string;
  slug: string;
  summary?: string;
  coverImage?: string | null;
  status?: DocArticleStatus;
  blocks: DocBlock[];
  actorId?: string | null;
};

export type DocImportJobInput = {
  sourceFilename: string;
  sourceChecksum: string;
  importStatus: 'parsed' | 'failed' | 'imported';
  previewSnapshot: unknown;
  errorSummary?: string | null;
  createdArticleId?: string | null;
  createdBy?: string | null;
};

export type AdminDocCategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string;
  audienceScope: DocAudienceScope;
  sortOrder: number;
  articleCount: number;
  updatedAt: string;
};

export type AdminDocArticleRow = {
  id: string;
  articleId: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  title: string;
  slug: string;
  summary: string;
  status: DocArticleStatus;
  publishedAt: string;
  archivedAt: string;
  updatedAt: string;
};

function requireDb(operation = 'docs repository') {
  const activeDb = docsRepositoryDbOverride ?? db;
  if (!activeDb) {
    throw new AccountDomainError(
      'database_unavailable',
      `Database connection is unavailable for ${operation}.`,
      503,
    );
  }

  return activeDb;
}

let docsRepositoryDbOverride: NonNullable<typeof db> | null = null;

export function setDocsRepositoryDbForTest(next: NonNullable<typeof db> | null) {
  docsRepositoryDbOverride = next;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function pushSearchText(parts: string[], ...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      parts.push(normalized);
    }
  }
}

export function resolveAudienceVisibility(scope: DocAudienceScope, current: DocsAudience) {
  return scope === 'shared' || scope === current;
}

export function mapArticleStatusUpdate(status: DocArticleStatus, now = new Date()) {
  if (status === 'published') {
    return {
      status,
      publishedAt: now,
      archivedAt: null,
      updatedAt: now,
    };
  }

  if (status === 'archived') {
    return {
      status,
      archivedAt: now,
      updatedAt: now,
    };
  }

  return {
    status,
    publishedAt: null,
    archivedAt: null,
    updatedAt: now,
  };
}

export function buildDocSearchText(title: string, summary: string, blocks: DocBlock[]) {
  const parts: string[] = [];
  pushSearchText(parts, title, summary);

  for (const block of blocks) {
    if (block.type === 'rich_text') {
      const visitNodes = (
        nodes: Array<{
          text?: string;
          content?: unknown[];
        }>,
      ) => {
        for (const node of nodes) {
          pushSearchText(parts, node.text);
          if (Array.isArray(node.content)) {
            visitNodes(node.content as Array<{ text?: string; content?: unknown[] }>);
          }
        }
      };

      visitNodes(block.content);
      continue;
    }

    if (block.type === 'step_media') {
      for (const step of block.steps) {
        pushSearchText(parts, step.title, step.body, step.imageUrl);
      }
      continue;
    }

    if (block.type === 'faq') {
      for (const item of block.items) {
        pushSearchText(parts, item.question, item.answer);
      }
      continue;
    }

    if (block.type === 'gallery') {
      for (const item of block.items) {
        pushSearchText(parts, item.title, item.description, item.imageUrl);
      }
      continue;
    }

    if (block.type === 'flowchart') {
      pushSearchText(parts, block.source);
      continue;
    }

    pushSearchText(parts, block.title, block.description, block.url);
  }

  return [...new Set(parts)].join(' ').trim();
}

function audienceScopesFor(audience: DocsAudience): DocAudienceScope[] {
  return audience === 'admin' ? ['admin', 'shared'] : ['user', 'shared'];
}

export function normalizeDocArticleDraftInput(input: DocArticleInput) {
  const title = normalizeText(input.title);
  const slug = normalizeText(input.slug);
  const summary = normalizeText(input.summary);
  const coverImage = normalizeText(input.coverImage) || null;
  const blocks = input.blocks.map((block) => docBlockSchema.parse(block));

  return {
    categoryId: input.categoryId,
    title,
    slug,
    summary,
    coverImage,
    status: input.status ?? 'draft',
    blocks,
    actorId: input.actorId ?? null,
    searchText: buildDocSearchText(title, summary, blocks),
  };
}

export function normalizeDocImportJobInput(input: DocImportJobInput) {
  return {
    sourceFilename: normalizeText(input.sourceFilename),
    sourceChecksum: normalizeText(input.sourceChecksum),
    importStatus: input.importStatus,
    errorSummary: normalizeText(input.errorSummary) || null,
    previewSnapshot: input.previewSnapshot,
    createdArticleId: input.createdArticleId ?? null,
    createdBy: input.createdBy ?? null,
  };
}

function mapAdminDocArticleRow(row: {
  articleId: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  title: string;
  slug: string;
  summary: string;
  status: DocArticleStatus;
  publishedAt: Date | string | null;
  archivedAt: Date | string | null;
  updatedAt: Date | string | null;
}): AdminDocArticleRow {
  return {
    id: row.articleId,
    articleId: row.articleId,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    status: row.status,
    publishedAt: formatIso(row.publishedAt),
    archivedAt: formatIso(row.archivedAt),
    updatedAt: formatIso(row.updatedAt),
  };
}

export function mapPublishedDocsRow<T extends { status: string }>(
  row: T | null | undefined,
): T | null {
  if (!row || row.status !== 'published') {
    return null;
  }

  return row;
}

function buildPublishedDocsWhere(input: {
  audience: DocsAudience;
  categorySlug?: string;
  articleSlug?: string;
  search?: string;
}) {
  const clauses: SQL[] = [
    eq(schema.docArticles.status, 'published'),
    inArray(schema.docCategories.audienceScope, audienceScopesFor(input.audience)),
  ];

  if (input.categorySlug) {
    clauses.push(eq(schema.docCategories.slug, input.categorySlug));
  }

  if (input.articleSlug) {
    clauses.push(eq(schema.docArticles.slug, input.articleSlug));
  }

  const search = normalizeText(input.search);
  if (search) {
    const pattern = `%${search}%`;
    clauses.push(
      or(
        ilike(schema.docArticles.title, pattern),
        ilike(schema.docArticles.summary, pattern),
        ilike(schema.docArticles.searchText, pattern),
        ilike(schema.docCategories.name, pattern),
      )!,
    );
  }

  return and(...clauses);
}

function mapValidatedBlocks(rows: Array<{ blockType: string; payload: unknown }>) {
  return rows.map((row) =>
    docBlockSchema.parse({
      type: row.blockType,
      ...(row.payload as Record<string, unknown>),
    }),
  );
}

export async function listPublishedDocs(input: {
  audience: DocsAudience;
  search?: string;
}) {
  const database = requireDb('published docs list');

  return database
    .select({
      categoryId: schema.docCategories.id,
      categoryName: schema.docCategories.name,
      categorySlug: schema.docCategories.slug,
      audienceScope: schema.docCategories.audienceScope,
      categorySortOrder: schema.docCategories.sortOrder,
      articleId: schema.docArticles.id,
      articleSlug: schema.docArticles.slug,
      title: schema.docArticles.title,
      summary: schema.docArticles.summary,
      coverImage: schema.docArticles.coverImage,
      publishedAt: schema.docArticles.publishedAt,
      updatedAt: schema.docArticles.updatedAt,
    })
    .from(schema.docArticles)
    .innerJoin(schema.docCategories, eq(schema.docArticles.categoryId, schema.docCategories.id))
    .where(buildPublishedDocsWhere(input))
    .orderBy(
      asc(schema.docCategories.sortOrder),
      asc(schema.docCategories.name),
      desc(schema.docArticles.updatedAt),
    );
}

export async function getPublishedDocArticle(input: {
  audience: DocsAudience;
  categorySlug: string;
  articleSlug: string;
}) {
  const database = requireDb('published doc article');
  const [article] = await database
    .select({
      articleId: schema.docArticles.id,
      categoryId: schema.docCategories.id,
      categoryName: schema.docCategories.name,
      categorySlug: schema.docCategories.slug,
      audienceScope: schema.docCategories.audienceScope,
      title: schema.docArticles.title,
      slug: schema.docArticles.slug,
      summary: schema.docArticles.summary,
      coverImage: schema.docArticles.coverImage,
      status: schema.docArticles.status,
      publishedAt: schema.docArticles.publishedAt,
      updatedAt: schema.docArticles.updatedAt,
    })
    .from(schema.docArticles)
    .innerJoin(schema.docCategories, eq(schema.docArticles.categoryId, schema.docCategories.id))
    .where(
      buildPublishedDocsWhere({
        audience: input.audience,
        categorySlug: input.categorySlug,
        articleSlug: input.articleSlug,
      }),
    );

  if (!article) {
    return null;
  }

  const blockRows = await database
    .select({
      blockType: schema.docArticleBlocks.blockType,
      payload: schema.docArticleBlocks.payload,
      sortOrder: schema.docArticleBlocks.sortOrder,
    })
    .from(schema.docArticleBlocks)
    .where(eq(schema.docArticleBlocks.articleId, article.articleId))
    .orderBy(asc(schema.docArticleBlocks.sortOrder));

  return {
    ...article,
    blocks: mapValidatedBlocks(blockRows),
  };
}

export async function listAdminDocArticles(input?: {
  status?: DocArticleStatus;
  categoryId?: string;
  search?: string;
}) {
  const database = requireDb('admin docs list');
  const clauses: SQL[] = [];

  if (input?.status) {
    clauses.push(eq(schema.docArticles.status, input.status));
  }

  if (input?.categoryId) {
    clauses.push(eq(schema.docArticles.categoryId, input.categoryId));
  }

  const search = normalizeText(input?.search);
  if (search) {
    const pattern = `%${search}%`;
    clauses.push(
      or(
        ilike(schema.docArticles.title, pattern),
        ilike(schema.docArticles.summary, pattern),
        ilike(schema.docArticles.searchText, pattern),
        ilike(schema.docCategories.name, pattern),
      )!,
    );
  }

  const where = clauses.length > 0 ? and(...clauses) : undefined;

  const rows = await database
    .select({
      articleId: schema.docArticles.id,
      categoryId: schema.docCategories.id,
      categoryName: schema.docCategories.name,
      categorySlug: schema.docCategories.slug,
      title: schema.docArticles.title,
      slug: schema.docArticles.slug,
      summary: schema.docArticles.summary,
      status: schema.docArticles.status,
      publishedAt: schema.docArticles.publishedAt,
      archivedAt: schema.docArticles.archivedAt,
      updatedAt: schema.docArticles.updatedAt,
    })
    .from(schema.docArticles)
    .innerJoin(schema.docCategories, eq(schema.docArticles.categoryId, schema.docCategories.id))
    .where(where)
    .orderBy(desc(schema.docArticles.updatedAt), asc(schema.docArticles.title));

  return rows.map(mapAdminDocArticleRow);
}

export async function getAdminDocArticle(articleId: string) {
  const database = requireDb('admin doc article');
  const [article] = await database
    .select({
      id: schema.docArticles.id,
      categoryId: schema.docArticles.categoryId,
      title: schema.docArticles.title,
      slug: schema.docArticles.slug,
      summary: schema.docArticles.summary,
      coverImage: schema.docArticles.coverImage,
      status: schema.docArticles.status,
      searchText: schema.docArticles.searchText,
      publishedAt: schema.docArticles.publishedAt,
      archivedAt: schema.docArticles.archivedAt,
      createdAt: schema.docArticles.createdAt,
      updatedAt: schema.docArticles.updatedAt,
      categoryName: schema.docCategories.name,
      categorySlug: schema.docCategories.slug,
      audienceScope: schema.docCategories.audienceScope,
    })
    .from(schema.docArticles)
    .innerJoin(schema.docCategories, eq(schema.docArticles.categoryId, schema.docCategories.id))
    .where(eq(schema.docArticles.id, articleId));

  if (!article) {
    return null;
  }

  const blockRows = await database
    .select({
      blockType: schema.docArticleBlocks.blockType,
      payload: schema.docArticleBlocks.payload,
      sortOrder: schema.docArticleBlocks.sortOrder,
    })
    .from(schema.docArticleBlocks)
    .where(eq(schema.docArticleBlocks.articleId, articleId))
    .orderBy(asc(schema.docArticleBlocks.sortOrder));

  return {
    ...article,
    blocks: mapValidatedBlocks(blockRows),
  };
}

export async function listAdminDocCategories() {
  const activeDb = ensureAdminReadSource('docs categories') ?? requireDb('admin doc categories');

  const rows = await activeDb
    .select({
      id: schema.docCategories.id,
      parentId: schema.docCategories.parentId,
      name: schema.docCategories.name,
      slug: schema.docCategories.slug,
      description: schema.docCategories.description,
      audienceScope: schema.docCategories.audienceScope,
      sortOrder: schema.docCategories.sortOrder,
      updatedAt: schema.docCategories.updatedAt,
      articleCount: sql<number>`count(${schema.docArticles.id})`,
    })
    .from(schema.docCategories)
    .leftJoin(schema.docArticles, eq(schema.docArticles.categoryId, schema.docCategories.id))
    .groupBy(schema.docCategories.id)
    .orderBy(
      asc(schema.docCategories.sortOrder),
      asc(schema.docCategories.name),
    );

  return rows.map((row) => ({
    ...row,
    articleCount: Number(row.articleCount ?? 0),
    updatedAt: formatIso(row.updatedAt),
  })) satisfies AdminDocCategoryRow[];
}

export async function createDocCategory(input: DocCategoryInput) {
  const database = requireDb('create doc category');
  const [category] = await database
    .insert(schema.docCategories)
    .values({
      name: normalizeText(input.name),
      slug: normalizeText(input.slug),
      description: normalizeText(input.description),
      parentId: input.parentId ?? null,
      audienceScope: input.audienceScope ?? 'shared',
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  if (!category) {
    throw new AccountDomainError('database_unavailable', 'Doc category could not be created.', 500);
  }

  return category;
}

export async function createDocArticle(input: DocArticleInput) {
  const database = requireDb('create doc article');
  const normalized = normalizeDocArticleDraftInput(input);

  return database.transaction(async (tx) => {
    const now = new Date();
    const statusFields = mapArticleStatusUpdate(normalized.status, now);
    const [article] = await tx
      .insert(schema.docArticles)
      .values({
        categoryId: normalized.categoryId,
        title: normalized.title,
        slug: normalized.slug,
        summary: normalized.summary,
        coverImage: normalized.coverImage,
        searchText: normalized.searchText,
        createdBy: normalized.actorId,
        updatedBy: normalized.actorId,
        ...statusFields,
      })
      .returning();

    if (!article) {
      throw new AccountDomainError('database_unavailable', 'Doc article could not be created.', 500);
    }

    if (normalized.blocks.length > 0) {
      await tx.insert(schema.docArticleBlocks).values(
        normalized.blocks.map((block, index) => {
          const { type, ...payload } = block;
          return {
            articleId: article.id,
            blockType: type,
            sortOrder: index,
            payload,
          };
        }),
      );
    }

    return article;
  });
}

export async function updateDocArticle(
  input: DocArticleInput & {
    articleId: string;
  },
) {
  const database = requireDb('update doc article');
  const normalized = normalizeDocArticleDraftInput(input);

  return database.transaction(async (tx) => {
    const statusFields = mapArticleStatusUpdate(normalized.status);
    const [article] = await tx
      .update(schema.docArticles)
      .set({
        categoryId: normalized.categoryId,
        title: normalized.title,
        slug: normalized.slug,
        summary: normalized.summary,
        coverImage: normalized.coverImage,
        searchText: normalized.searchText,
        updatedBy: normalized.actorId,
        ...statusFields,
      })
      .where(eq(schema.docArticles.id, input.articleId))
      .returning();

    if (!article) {
      throw new AccountDomainError('account_not_found', 'Doc article not found.', 404);
    }

    await tx.delete(schema.docArticleBlocks).where(eq(schema.docArticleBlocks.articleId, input.articleId));

    if (normalized.blocks.length > 0) {
      await tx.insert(schema.docArticleBlocks).values(
        normalized.blocks.map((block, index) => {
          const { type, ...payload } = block;
          return {
            articleId: input.articleId,
            blockType: type,
            sortOrder: index,
            payload,
          };
        }),
      );
    }

    return article;
  });
}

export async function updateDocArticleStatus(input: {
  articleId: string;
  status: DocArticleStatus;
}) {
  const database = requireDb('update doc article status');
  const [article] = await database
    .update(schema.docArticles)
    .set(mapArticleStatusUpdate(input.status))
    .where(eq(schema.docArticles.id, input.articleId))
    .returning();

  if (!article) {
    throw new AccountDomainError('account_not_found', 'Doc article not found.', 404);
  }

  return article;
}

export async function getAdminDocsModuleData(): Promise<
  AdminModuleData<AdminDocArticleRow> & {
    categories: AdminDocCategoryRow[];
  }
> {
  const [categories, records] = await Promise.all([
    listAdminDocCategories(),
    listAdminDocArticles(),
  ]);

  const draftCount = records.filter((record) => record.status === 'draft').length;
  const publishedCount = records.filter((record) => record.status === 'published').length;
  const archivedCount = records.filter((record) => record.status === 'archived').length;

  return {
    source: db && process.env.DATABASE_URL ? 'database' : 'seed',
    categories,
    records,
    metrics: [
      { label: '分类数', value: String(categories.length), hint: '结构', tone: 'info' },
      { label: '草稿', value: String(draftCount), hint: '待校对', tone: draftCount > 0 ? 'warning' : 'default' },
      { label: '已发布', value: String(publishedCount), hint: '线上', tone: publishedCount > 0 ? 'success' : 'default' },
      { label: '已下线', value: String(archivedCount), hint: '归档', tone: archivedCount > 0 ? 'default' : 'info' },
    ],
    filters: [
      { label: '全部', value: 'all', count: records.length },
      { label: '草稿', value: 'draft', count: draftCount },
      { label: '已发布', value: 'published', count: publishedCount },
      { label: '已下线', value: 'archived', count: archivedCount },
    ],
  };
}

export async function createDocImportJob(input: DocImportJobInput) {
  const database = requireDb('create doc import job');
  const normalized = normalizeDocImportJobInput(input);
  const [job] = await database
    .insert(schema.docImportJobs)
    .values({
      sourceFilename: normalized.sourceFilename,
      sourceChecksum: normalized.sourceChecksum,
      importStatus: normalized.importStatus,
      errorSummary: normalized.errorSummary,
      previewSnapshot: normalized.previewSnapshot,
      createdArticleId: normalized.createdArticleId,
      createdBy: normalized.createdBy,
    })
    .returning();

  if (!job) {
    throw new AccountDomainError('database_unavailable', 'Doc import job could not be created.', 500);
  }

  return job;
}

export async function markDocImportJobImported(input: {
  jobId: string;
  createdArticleId: string;
}) {
  const database = requireDb('mark doc import job imported');
  const [job] = await database
    .update(schema.docImportJobs)
    .set({
      importStatus: 'imported',
      createdArticleId: input.createdArticleId,
      errorSummary: null,
    })
    .where(eq(schema.docImportJobs.id, input.jobId))
    .returning();

  if (!job) {
    throw new AccountDomainError('account_not_found', 'Doc import job not found.', 404);
  }

  return job;
}
