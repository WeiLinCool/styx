import { desc, eq } from 'drizzle-orm';

import { schema } from '@/server/db';
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
  bodySummary: string;
  publishedAt: string;
  updatedAt: string;
  actions: string[];
};

function summarizeBody(body: string | null) {
  if (!body) {
    return '未填写正文';
  }

  return body.length > 90 ? `${body.slice(0, 90)}...` : body;
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
    bodySummary: summarizeBody(asset.body),
    publishedAt: formatIso(asset.publishedAt),
    updatedAt: formatIso(asset.updatedAt),
    actions: ['Edit draft', 'Publish', 'Archive'],
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
