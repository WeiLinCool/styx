import { asc, desc, eq } from 'drizzle-orm';

import { AccountDomainError } from '@/server/auth/account-types';
import { schema } from '@/server/db';
import { db } from '@/server/db';
import {
  defaultHomepageContent,
  isHomeContentSlug,
  mergeHomepageBlocks,
  parseHomepageBlockMetadata,
  type HomepageContent,
} from '@/features/public/home-content';
import {
  type AdminModuleData,
  ensureAdminReadSource,
  formatIso,
  metadataText,
} from './admin-shared';

export type AdminContentRow = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  status: string;
  owner: string;
  placement: string;
  mediaReference: string;
  body: string | null;
  metadata: Record<string, unknown>;
  bodySummary: string;
  publishedAt: string;
  updatedAt: string;
  actions: string[];
};

export type AdminContentMutationInput = {
  slug: string;
  title: string;
  metadata: unknown;
  body?: string | null;
  url?: string | null;
  actorId: string;
};

export type ContentStatusAction = 'publish' | 'draft' | 'archive';

function requireDb() {
  if (!db) {
    throw new AccountDomainError(
      'database_unavailable',
      'Database connection is unavailable.',
      503,
    );
  }

  return db;
}

function summarizeBody(body: string | null) {
  if (!body) {
    return '未填写正文';
  }

  return body.length > 90 ? `${body.slice(0, 90)}...` : body;
}

export function buildAdminContentMutationValues(input: AdminContentMutationInput) {
  if (!isHomeContentSlug(input.slug)) {
    throw new AccountDomainError(
      'account_not_found',
      `Unsupported homepage content slug: ${input.slug}`,
      400,
    );
  }

  const parsed = parseHomepageBlockMetadata(input.slug, input.metadata);
  if (!parsed.ok) {
    throw new AccountDomainError(
      'account_not_found',
      `Homepage content metadata is invalid: ${parsed.issues.join('; ')}`,
      400,
    );
  }

  return {
    slug: input.slug,
    title: input.title.trim(),
    kind: 'page' as const,
    status: 'draft' as const,
    body: input.body?.trim() || null,
    url: input.url?.trim() || null,
    metadata: parsed.value,
    createdByUserId: input.actorId,
  };
}

export function resolveContentStatusTransition(action: ContentStatusAction, now = new Date()) {
  if (action === 'publish') {
    return { status: 'published' as const, publishedAt: now, updatedAt: now };
  }

  if (action === 'draft') {
    return { status: 'draft' as const, updatedAt: now };
  }

  return { status: 'archived' as const, updatedAt: now };
}

export function mapPublishedHomepageRows(
  rows: Array<{
    slug: string;
    status: string;
    publishedAt: Date | null;
    updatedAt?: Date | null;
    metadata: unknown;
  }>,
) {
  const latestBySlug = new Map<string, { slug: string; metadata: unknown }>();

  for (const row of rows
    .filter((row) => row.status === 'published' && row.publishedAt)
    .sort((left, right) => {
      const leftTime = left.updatedAt?.getTime() ?? left.publishedAt?.getTime() ?? 0;
      const rightTime = right.updatedAt?.getTime() ?? right.publishedAt?.getTime() ?? 0;
      return leftTime - rightTime;
    })) {
    latestBySlug.set(row.slug, { slug: row.slug, metadata: row.metadata });
  }

  return [...latestBySlug.values()];
}

function getSeedContent(): AdminModuleData<AdminContentRow> {
  const records: AdminContentRow[] = [
    {
      id: 'seed-content-home',
      slug: 'home-hero',
      title: 'Home Hero',
      kind: 'page',
      status: 'published',
      owner: 'Styx Admin',
      placement: 'homepage hero',
      mediaReference: '/home/hero',
      body: '首页首屏标题、描述与主要 CTA。',
      metadata: {},
      bodySummary: '首页首屏标题、描述与主要 CTA。',
      publishedAt: '2026-05-29T08:00:00.000Z',
      updatedAt: '2026-05-29T08:00:00.000Z',
      actions: ['Edit draft', 'Publish', 'Archive'],
    },
    {
      id: 'seed-content-example',
      slug: 'tutorial-image-workflow',
      title: 'Image Workflow Tutorial',
      kind: 'document',
      status: 'draft',
      owner: 'Styx Admin',
      placement: 'tutorials',
      mediaReference: '/tutorials/image-workflow',
      body: '图像生成工作流教学内容，等待发布。',
      metadata: {},
      bodySummary: '图像生成工作流教学内容，等待发布。',
      publishedAt: '未记录',
      updatedAt: '2026-05-28T09:00:00.000Z',
      actions: ['Edit draft', 'Publish', 'Archive'],
    },
  ];

  return {
    source: 'seed',
    metrics: [
      { label: '内容项', value: '2', hint: 'seed assets', tone: 'info' },
      { label: '已发布', value: '1', hint: 'public visible', tone: 'success' },
      { label: '草稿', value: '1', hint: 'needs review', tone: 'warning' },
      { label: '媒体引用', value: '2', hint: 'linked assets', tone: 'default' },
    ],
    filters: [
      { label: 'All', value: 'all', count: 2 },
      { label: 'Published', value: 'published', count: 1 },
      { label: 'Draft', value: 'draft', count: 1 },
      { label: 'Page', value: 'page', count: 1 },
    ],
    records,
  };
}

export async function createAdminContent(input: AdminContentMutationInput) {
  const database = requireDb();
  const values = buildAdminContentMutationValues(input);
  const [content] = await database.insert(schema.contentAssets).values(values).returning();

  if (!content) {
    throw new AccountDomainError(
      'database_unavailable',
      'Content could not be created.',
      500,
    );
  }

  return content;
}

export async function updateAdminContent(input: AdminContentMutationInput & { contentId: string }) {
  const database = requireDb();
  const values = buildAdminContentMutationValues(input);
  const [content] = await database
    .update(schema.contentAssets)
    .set({
      slug: values.slug,
      title: values.title,
      body: values.body,
      url: values.url,
      metadata: values.metadata,
      updatedAt: new Date(),
    })
    .where(eq(schema.contentAssets.id, input.contentId))
    .returning();

  if (!content) {
    throw new AccountDomainError('account_not_found', 'Content not found.', 404);
  }

  return content;
}

export async function updateAdminContentStatus(input: {
  contentId: string;
  action: ContentStatusAction;
}) {
  const database = requireDb();
  const next = resolveContentStatusTransition(input.action);
  const [content] = await database
    .update(schema.contentAssets)
    .set(next)
    .where(eq(schema.contentAssets.id, input.contentId))
    .returning();

  if (!content) {
    throw new AccountDomainError('account_not_found', 'Content not found.', 404);
  }

  return content;
}

export async function getPublicHomepageContent(): Promise<HomepageContent> {
  const database = db;

  if (!database) {
    return defaultHomepageContent;
  }

  const rows = await database
    .select({
      slug: schema.contentAssets.slug,
      status: schema.contentAssets.status,
      publishedAt: schema.contentAssets.publishedAt,
      updatedAt: schema.contentAssets.updatedAt,
      metadata: schema.contentAssets.metadata,
    })
    .from(schema.contentAssets)
    .where(eq(schema.contentAssets.kind, 'page'))
    .orderBy(asc(schema.contentAssets.updatedAt));

  return mergeHomepageBlocks(defaultHomepageContent, mapPublishedHomepageRows(rows));
}

export async function getAdminContent(): Promise<AdminModuleData<AdminContentRow>> {
  const database = ensureAdminReadSource('content');

  if (!database) {
    return getSeedContent();
  }

  const rows = await database
    .select({
      asset: schema.contentAssets,
      owner: schema.users,
    })
    .from(schema.contentAssets)
    .leftJoin(schema.users, eq(schema.users.id, schema.contentAssets.createdByUserId))
    .orderBy(desc(schema.contentAssets.updatedAt))
    .limit(100);

  const records = rows.map(({ asset, owner }) => ({
    id: asset.id,
    slug: asset.slug,
    title: asset.title,
    kind: asset.kind,
    status: asset.status,
    owner: owner?.displayName ?? '系统',
    placement: metadataText(asset.metadata, 'placement', asset.kind),
    mediaReference: asset.url ?? metadataText(asset.metadata, 'mediaReference', 'none'),
    body: asset.body,
    metadata: asset.metadata,
    bodySummary: summarizeBody(asset.body),
    publishedAt: formatIso(asset.publishedAt),
    updatedAt: formatIso(asset.updatedAt),
    actions:
      asset.status === 'published'
        ? ['Edit', 'Unpublish', 'Archive']
        : ['Edit', 'Publish', 'Archive'],
  }));

  return {
    source: 'database',
    metrics: [
      { label: '内容项', value: String(records.length), hint: '数据库', tone: 'info' },
      {
        label: '已发布',
        value: String(records.filter((record) => record.status === 'published').length),
        hint: 'public visible',
        tone: 'success',
      },
      {
        label: '草稿',
        value: String(records.filter((record) => record.status === 'draft').length),
        hint: 'needs review',
        tone: 'warning',
      },
      {
        label: '媒体引用',
        value: String(records.filter((record) => record.mediaReference !== 'none').length),
        hint: 'linked assets',
        tone: 'default',
      },
    ],
    filters: [
      { label: 'All', value: 'all', count: records.length },
      { label: 'Published', value: 'published' },
      { label: 'Draft', value: 'draft' },
      { label: 'Page', value: 'page' },
      { label: 'Prompt', value: 'prompt' },
    ],
    records,
  };
}
