# Doc Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a database-backed unified documentation center with admin operations, multimodal article blocks, publish/archive workflow, and one-time Markdown import.

**Architecture:** Add a dedicated `docs` domain across Drizzle schema, repository/service helpers, admin API routes, admin console pages, and public `/docs` pages. Persist articles as metadata plus ordered block records, keep audience filtering and publish-state enforcement in server code, and parse imported Markdown into the same internal block model before saving drafts.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, Zod, existing shadcn/Radix UI primitives.

---

## File map

### Create

- `src/server/db/schema.docs.test.ts`
- `src/server/docs/schema.ts`
- `src/server/docs/markdown-import.ts`
- `src/server/docs/markdown-import.test.ts`
- `src/server/repositories/docs.ts`
- `src/server/repositories/docs.test.ts`
- `src/features/admin/admin-docs-types.ts`
- `src/features/admin/admin-docs-actions.tsx`
- `src/features/admin/admin-docs-module.tsx`
- `src/features/admin/admin-doc-editor.tsx`
- `src/features/admin/admin-doc-import-module.tsx`
- `src/features/public/docs-center.tsx`
- `src/features/public/docs-article-page.tsx`
- `src/features/public/docs-navigation.tsx`
- `src/app/admin/(console)/docs/page.tsx`
- `src/app/admin/(console)/docs/categories/page.tsx`
- `src/app/admin/(console)/docs/articles/page.tsx`
- `src/app/admin/(console)/docs/import/page.tsx`
- `src/app/admin/(console)/docs/articles/[articleId]/page.tsx`
- `src/app/docs/page.tsx`
- `src/app/docs/[categorySlug]/page.tsx`
- `src/app/docs/[categorySlug]/[articleSlug]/page.tsx`
- `src/app/api/admin/docs/categories/route.ts`
- `src/app/api/admin/docs/articles/route.ts`
- `src/app/api/admin/docs/articles/[articleId]/route.ts`
- `src/app/api/admin/docs/articles/[articleId]/publish/route.ts`
- `src/app/api/admin/docs/articles/[articleId]/archive/route.ts`
- `src/app/api/admin/docs/import/route.ts`

### Modify

- `src/server/db/schema.ts`
- `src/features/admin/admin-nav-config.ts`
- `src/features/admin/admin-nav.test.tsx`
- `src/app/admin/(console)/layout.tsx`
- `package.json`

## Invariants

1. Public docs queries must only return `published` articles and categories visible to the current audience.
2. Admin save actions persist internal `DocBlock` records, never raw Markdown as the canonical article body.
3. Markdown import may downgrade unrecognized content to `rich_text`, but it must never create invalid block types.

### Task 1: Add docs schema and block domain

**Files:**
- Create: `src/server/db/schema.docs.test.ts`
- Create: `src/server/docs/schema.ts`
- Modify: `src/server/db/schema.ts`
- Test: `src/server/db/schema.docs.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  docAudienceScope,
  docArticleBlockType,
  docArticleStatus,
  docArticles,
  docArticleBlocks,
  docCategories,
  docImportJobs,
} from './schema';

test('docs schema exposes expected enums', () => {
  assert.deepEqual(docAudienceScope.enumValues, ['user', 'admin', 'shared']);
  assert.deepEqual(docArticleStatus.enumValues, ['draft', 'published', 'archived']);
  assert.deepEqual(docArticleBlockType.enumValues, [
    'rich_text',
    'step_media',
    'video',
    'audio',
    'faq',
    'flowchart',
    'gallery',
  ]);
});

test('docs tables expose expected key columns', () => {
  assert.equal(docCategories.slug.name, 'slug');
  assert.equal(docArticles.categoryId.name, 'category_id');
  assert.equal(docArticleBlocks.payload.name, 'payload');
  assert.equal(docImportJobs.createdArticleId.name, 'created_article_id');
});
```

- [ ] **Step 2: Run the schema test and confirm it fails**

Run: `pnpm exec tsx --test src/server/db/schema.docs.test.ts`

Expected: FAIL with missing exports for docs enums or tables.

- [ ] **Step 3: Add docs table and block schema definitions**

```ts
export const docAudienceScope = pgEnum('doc_audience_scope', ['user', 'admin', 'shared']);
export const docArticleStatus = pgEnum('doc_article_status', ['draft', 'published', 'archived']);
export const docArticleBlockType = pgEnum('doc_article_block_type', [
  'rich_text',
  'step_media',
  'video',
  'audio',
  'faq',
  'flowchart',
  'gallery',
]);
export const docImportStatus = pgEnum('doc_import_status', ['parsed', 'failed', 'imported']);

export const docCategories = pgTable('doc_categories', {
  id,
  parentId: uuid('parent_id').references(() => docCategories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull().default(''),
  audienceScope: docAudienceScope('audience_scope').notNull().default('shared'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: now,
  updatedAt: updated,
}, (table) => ({
  slugIdx: uniqueIndex('doc_categories_slug_idx').on(table.slug),
  audienceSortIdx: index('doc_categories_audience_sort_idx').on(table.audienceScope, table.sortOrder),
}));

export const docArticles = pgTable('doc_articles', {
  id,
  categoryId: uuid('category_id').notNull().references(() => docCategories.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  summary: text('summary').notNull().default(''),
  coverImage: text('cover_image'),
  status: docArticleStatus('status').notNull().default('draft'),
  searchText: text('search_text').notNull().default(''),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: now,
  updatedAt: updated,
}, (table) => ({
  categorySlugIdx: uniqueIndex('doc_articles_category_slug_idx').on(table.categoryId, table.slug),
  statusUpdatedIdx: index('doc_articles_status_updated_idx').on(table.status, table.updatedAt),
}));

export const docArticleBlocks = pgTable('doc_article_blocks', {
  id,
  articleId: uuid('article_id').notNull().references(() => docArticles.id, { onDelete: 'cascade' }),
  blockType: docArticleBlockType('block_type').notNull(),
  sortOrder: integer('sort_order').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: now,
  updatedAt: updated,
}, (table) => ({
  articleSortIdx: uniqueIndex('doc_article_blocks_article_sort_idx').on(table.articleId, table.sortOrder),
}));

export const docImportJobs = pgTable('doc_import_jobs', {
  id,
  sourceFilename: text('source_filename').notNull(),
  sourceChecksum: text('source_checksum').notNull(),
  importStatus: docImportStatus('import_status').notNull(),
  errorSummary: text('error_summary'),
  previewSnapshot: jsonb('preview_snapshot').notNull(),
  createdArticleId: uuid('created_article_id').references(() => docArticles.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: now,
});
```

- [ ] **Step 4: Add runtime block validation schema**

```ts
import { z } from 'zod';

export const docBlockTypeSchema = z.enum([
  'rich_text',
  'step_media',
  'video',
  'audio',
  'faq',
  'flowchart',
  'gallery',
]);

export const docBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rich_text'), content: z.array(z.any()) }),
  z.object({ type: z.literal('step_media'), steps: z.array(z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    imageUrl: z.string().trim().min(1).optional(),
  })).min(1) }),
  z.object({ type: z.literal('video'), title: z.string().min(1), url: z.string().url(), coverImage: z.string().url().optional(), description: z.string().default('') }),
  z.object({ type: z.literal('audio'), title: z.string().min(1), url: z.string().url(), description: z.string().default('') }),
  z.object({ type: z.literal('faq'), items: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).min(1) }),
  z.object({ type: z.literal('flowchart'), source: z.string().min(1), format: z.enum(['mermaid', 'json']).default('mermaid') }),
  z.object({ type: z.literal('gallery'), items: z.array(z.object({ imageUrl: z.string().url(), title: z.string().default(''), description: z.string().default('') })).min(1) }),
]);
```

- [ ] **Step 5: Re-run the schema test**

Run: `pnpm exec tsx --test src/server/db/schema.docs.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema.ts src/server/db/schema.docs.test.ts src/server/docs/schema.ts
git commit -m "feat(docs): add docs schema and block contracts"
```

### Task 2: Add repositories and Markdown import parser

**Files:**
- Create: `src/server/docs/markdown-import.ts`
- Create: `src/server/docs/markdown-import.test.ts`
- Create: `src/server/repositories/docs.ts`
- Create: `src/server/repositories/docs.test.ts`
- Modify: `package.json`
- Test: `src/server/docs/markdown-import.test.ts`
- Test: `src/server/repositories/docs.test.ts`

- [ ] **Step 1: Add test coverage for Markdown mapping**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { importMarkdownToDocBlocks } from './markdown-import';

test('markdown import maps faq, media, and fallback rich text blocks', async () => {
  const result = await importMarkdownToDocBlocks(`# Getting Started

Q: How do I log in?
A: Use your bound account.

![Shot 1](https://cdn.example.com/shot-1.png)
![Shot 2](https://cdn.example.com/shot-2.png)

Video: https://cdn.example.com/demo.mp4`);

  assert.equal(result.title, 'Getting Started');
  assert.equal(result.blocks[0]?.type, 'faq');
  assert.equal(result.blocks[1]?.type, 'gallery');
  assert.equal(result.blocks[2]?.type, 'video');
});
```

- [ ] **Step 2: Add repository tests for publish filtering and transitions**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDocSearchText,
  mapArticleStatusUpdate,
  resolveAudienceVisibility,
} from './docs';

test('audience visibility allows shared docs for both surfaces', () => {
  assert.equal(resolveAudienceVisibility('shared', 'user'), true);
  assert.equal(resolveAudienceVisibility('shared', 'admin'), true);
  assert.equal(resolveAudienceVisibility('admin', 'user'), false);
});

test('status update timestamps published and archived transitions', () => {
  const now = new Date('2026-06-04T00:00:00.000Z');
  assert.equal(mapArticleStatusUpdate('published', now).publishedAt?.toISOString(), now.toISOString());
  assert.equal(mapArticleStatusUpdate('archived', now).archivedAt?.toISOString(), now.toISOString());
});

test('search text merges title summary and block content', () => {
  const text = buildDocSearchText('Title', 'Summary', [
    { type: 'faq', items: [{ question: 'Q1', answer: 'A1' }] },
  ]);
  assert.match(text, /Title/);
  assert.match(text, /Summary/);
  assert.match(text, /Q1/);
});
```

- [ ] **Step 3: Install Markdown parser dependencies**

```json
{
  "dependencies": {
    "remark": "^15.0.1",
    "remark-parse": "^11.0.0",
    "unist-util-visit": "^5.0.0"
  }
}
```

Run: `pnpm install`

Expected: lockfile and node_modules update successfully.

- [ ] **Step 4: Implement the Markdown import mapper**

```ts
export async function importMarkdownToDocBlocks(markdown: string) {
  const tree = unified().use(remarkParse).parse(markdown);
  const blocks: DocBlock[] = [];
  const title = extractTitle(tree) ?? 'Untitled document';
  const richTextBuffer: string[] = [];

  visit(tree, (node) => {
    if (isFaqPair(node)) {
      flushRichText(richTextBuffer, blocks);
      blocks.push({ type: 'faq', items: extractFaqItems(node) });
      return;
    }

    if (isMediaLink(node, '.mp4')) {
      flushRichText(richTextBuffer, blocks);
      blocks.push({ type: 'video', title: extractMediaTitle(node), url: extractUrl(node), description: '' });
      return;
    }

    if (isImageGalleryCandidate(node)) {
      flushRichText(richTextBuffer, blocks);
      blocks.push({ type: 'gallery', items: extractGalleryItems(node) });
      return;
    }

    richTextBuffer.push(stringifyMarkdownNode(node));
  });

  flushRichText(richTextBuffer, blocks);
  return { title, summary: summarizeMarkdown(markdown), blocks };
}
```

- [ ] **Step 5: Implement repository helpers and CRUD entry points**

```ts
export function resolveAudienceVisibility(scope: DocAudienceScope, current: 'user' | 'admin') {
  return scope === 'shared' || scope === current;
}

export function mapArticleStatusUpdate(status: DocArticleStatus, now = new Date()) {
  if (status === 'published') {
    return { status, publishedAt: now, archivedAt: null, updatedAt: now };
  }
  if (status === 'archived') {
    return { status, archivedAt: now, updatedAt: now };
  }
  return { status, updatedAt: now };
}

export async function listPublishedDocs(input: { audience: 'user' | 'admin' }) {
  const database = requireDb();
  return database
    .select({
      categorySlug: schema.docCategories.slug,
      articleSlug: schema.docArticles.slug,
      title: schema.docArticles.title,
      summary: schema.docArticles.summary,
    })
    .from(schema.docArticles)
    .innerJoin(schema.docCategories, eq(schema.docArticles.categoryId, schema.docCategories.id))
    .where(and(
      eq(schema.docArticles.status, 'published'),
      inArray(schema.docCategories.audienceScope, input.audience === 'admin' ? ['admin', 'shared'] : ['user', 'shared']),
    ));
}
```

- [ ] **Step 6: Run targeted tests**

Run: `pnpm exec tsx --test src/server/docs/markdown-import.test.ts src/server/repositories/docs.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/server/docs/markdown-import.ts src/server/docs/markdown-import.test.ts src/server/repositories/docs.ts src/server/repositories/docs.test.ts
git commit -m "feat(docs): add docs repository and markdown import"
```

### Task 3: Add admin docs routes and console UI

**Files:**
- Create: `src/features/admin/admin-docs-types.ts`
- Create: `src/features/admin/admin-docs-actions.tsx`
- Create: `src/features/admin/admin-docs-module.tsx`
- Create: `src/features/admin/admin-doc-editor.tsx`
- Create: `src/features/admin/admin-doc-import-module.tsx`
- Create: `src/app/admin/(console)/docs/page.tsx`
- Create: `src/app/admin/(console)/docs/categories/page.tsx`
- Create: `src/app/admin/(console)/docs/articles/page.tsx`
- Create: `src/app/admin/(console)/docs/import/page.tsx`
- Create: `src/app/admin/(console)/docs/articles/[articleId]/page.tsx`
- Create: `src/app/api/admin/docs/categories/route.ts`
- Create: `src/app/api/admin/docs/articles/route.ts`
- Create: `src/app/api/admin/docs/articles/[articleId]/route.ts`
- Create: `src/app/api/admin/docs/articles/[articleId]/publish/route.ts`
- Create: `src/app/api/admin/docs/articles/[articleId]/archive/route.ts`
- Create: `src/app/api/admin/docs/import/route.ts`
- Modify: `src/features/admin/admin-nav-config.ts`
- Modify: `src/features/admin/admin-nav.test.tsx`

- [ ] **Step 1: Add a failing admin nav test for the docs module**

```ts
test('admin nav config exposes docs entry', () => {
  const item = getAdminNavItemByHref('/admin/docs');
  assert.equal(item?.label, '文档中心');
});
```

- [ ] **Step 2: Run the admin nav test and confirm it fails**

Run: `pnpm exec tsx --test src/features/admin/admin-nav.test.tsx`

Expected: FAIL because `/admin/docs` is missing.

- [ ] **Step 3: Add admin nav entry and list/index pages**

```ts
{ href: '/admin/docs', label: '文档中心', icon: BookCopy, group: 'more' }
```

```tsx
export default async function AdminDocsPage() {
  const data = await getAdminDocsOverview();
  return <AdminDocsModule data={data} />;
}
```

```tsx
export function AdminDocsModule({ data }: { data: AdminDocsOverview }) {
  return (
    <div className="space-y-4">
      <AdminModuleGuide
        title="文档中心运维"
        description="统一维护用户端和管理端操作文档。"
        steps={[
          '先创建分类并设置 audience。',
          '再创建文章草稿并编辑块内容。',
          '导入 Markdown 时先预览再落草稿。',
        ]}
        risks={[
          '发布后会立即进入前台搜索。',
          'audience 配置错误会影响角色可见性。',
        ]}
      />
      <AdminModulePage {...buildOverviewTableProps(data)} />
    </div>
  );
}
```

- [ ] **Step 4: Add admin API route validation and repository calls**

```ts
const createArticleSchema = z.object({
  categoryId: z.uuid(),
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  summary: z.string().trim().default(''),
  coverImage: z.string().trim().nullable().optional(),
  blocks: z.array(docBlockSchema).min(1),
});

export async function POST(request: Request) {
  const session = await requireAdmin();
  const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
  const body = createArticleSchema.parse(parsedBody);
  return runProtectedMutation(
    { request, routeKind: 'admin-mutation', operation: 'POST /api/admin/docs/articles', actorType: 'admin', actorId: session.user.id, rawBody, decryptedRawBody, parsedBody },
    async () => NextResponse.json({ ok: true, article: await createDocArticle({ ...body, actorId: session.user.id }) }),
  );
}
```

- [ ] **Step 5: Build the editor and import UI**

```tsx
export function AdminDocEditor({ article }: { article: AdminDocEditorState }) {
  return (
    <form className="grid gap-4 xl:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader><CardTitle>文章设置</CardTitle></CardHeader>
        <CardContent>{/* title, slug, category, summary, audience badges */}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>内容块</CardTitle></CardHeader>
        <CardContent>{/* per-block editors and preview actions */}</CardContent>
      </Card>
    </form>
  );
}
```

```tsx
export function AdminDocImportModule() {
  return (
    <div className="space-y-4">
      <Card>{/* file upload */}</Card>
      <Card>{/* preview summary + create draft action */}</Card>
    </div>
  );
}
```

- [ ] **Step 6: Run targeted validation for admin tests and build**

Run: `pnpm exec tsx --test src/features/admin/admin-nav.test.tsx`

Expected: PASS

Run: `pnpm validate`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/admin-nav-config.ts src/features/admin/admin-nav.test.tsx src/features/admin/admin-docs-types.ts src/features/admin/admin-docs-actions.tsx src/features/admin/admin-docs-module.tsx src/features/admin/admin-doc-editor.tsx src/features/admin/admin-doc-import-module.tsx src/app/admin/'(console)'/docs src/app/api/admin/docs
git commit -m "feat(docs): add admin docs console and api"
```

### Task 4: Add public `/docs` pages and end-to-end verification

**Files:**
- Create: `src/features/public/docs-center.tsx`
- Create: `src/features/public/docs-article-page.tsx`
- Create: `src/features/public/docs-navigation.tsx`
- Create: `src/app/docs/page.tsx`
- Create: `src/app/docs/[categorySlug]/page.tsx`
- Create: `src/app/docs/[categorySlug]/[articleSlug]/page.tsx`
- Modify: `src/app/admin/(console)/layout.tsx`
- Test: `src/server/repositories/docs.test.ts`

- [ ] **Step 1: Add repository test for public category and article lookup**

```ts
test('public docs lookup rejects non-published articles', async () => {
  const record = mapPublicDocArticle({
    articleStatus: 'draft',
    articleSlug: 'how-to-login',
    categorySlug: 'user-center',
  });
  assert.equal(record, null);
});
```

- [ ] **Step 2: Implement public docs pages and navigation**

```tsx
export default async function DocsHomePage() {
  const audience = await resolveCurrentDocsAudience();
  const data = await getPublicDocsHome({ audience });
  return <DocsCenter data={data} />;
}
```

```tsx
export function DocsArticlePage({ article, navigation }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <DocsNavigation tree={navigation} activeSlug={article.slug} />
      <article className="space-y-6">{renderDocBlocks(article.blocks)}</article>
    </div>
  );
}
```

- [ ] **Step 3: Run focused tests and production build**

Run: `pnpm exec tsx --test src/server/repositories/docs.test.ts`

Expected: PASS

Run: `pnpm build`

Expected: PASS

- [ ] **Step 4: Run browser verification**

Run: `pnpm dev`

Expected: local app starts successfully.

Verify manually:
- Open `/admin/docs` and confirm overview, article list, import page, and editor route render.
- Create a draft article, publish it, then confirm it appears under `/docs`.
- Archive the article and confirm it disappears from `/docs`.

- [ ] **Step 5: Commit**

```bash
git add src/features/public/docs-center.tsx src/features/public/docs-article-page.tsx src/features/public/docs-navigation.tsx src/app/docs src/server/repositories/docs.test.ts src/app/admin/'(console)'/layout.tsx
git commit -m "feat(docs): add public docs center"
```

## Self-review checklist

- Spec coverage: schema, status flow, admin ops, public docs pages, Markdown import, and verification are all mapped to tasks above.
- Placeholder scan: every task includes concrete files, commands, and starter code to implement.
- Type consistency: uses `doc_categories`, `doc_articles`, `doc_article_blocks`, `DocBlock`, and `published|draft|archived` consistently across tasks.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-doc-center-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
