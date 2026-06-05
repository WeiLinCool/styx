# Admin Docs Operations Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the admin doc center into an operator-friendly workflow by making list filtering real, adding maintainable two-level category management, and replacing raw JSON editing with a block-list editor.

**Architecture:** Keep the existing `doc_categories`, `doc_articles`, and `doc_article_blocks` tables as the single persistence model. Route pages stay thin, API routes validate and translate requests, repository code owns query and mutation invariants, and client-side admin features own only transient editing state and local form errors.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Drizzle ORM repositories, Zod validation, node test runner via `pnpm exec tsx --test`, Tailwind/shadcn UI.

---

## File Structure

- Modify `src/server/repositories/docs.ts`: add category update/delete operations, category tree constraints, server-side list filtering input, and publish-safe article validation hooks.
- Modify `src/server/repositories/docs.test.ts`: cover category mutation constraints, filtered admin list queries, and publish validation behavior.
- Add `src/app/api/admin/docs/categories/[categoryId]/route.ts`: support `PATCH` and `DELETE` for category maintenance.
- Add `src/app/api/admin/docs/categories/[categoryId]/route.test.ts`: verify category body parsing and invalid request handling.
- Modify `src/app/api/admin/docs/categories/route.ts`: reuse shared request schemas and permit `parentId`.
- Modify `src/app/api/admin/docs/articles/route.ts`: keep create validation but reuse editor payload shape helpers.
- Modify `src/app/api/admin/docs/articles/[articleId]/route.ts`: keep update validation aligned with the new editor payload and save semantics.
- Modify `src/app/admin/(console)/docs/page.tsx` and `src/app/admin/(console)/docs/articles/page.tsx`: read `searchParams` and pass them into repository-backed list queries.
- Modify `src/features/admin/module-page.tsx`: stop rendering disabled fake filters; allow injected toolbar content from the docs module.
- Modify `src/features/admin/admin-docs-module.tsx`: render a real filter/search toolbar bound to URL params and keep the table itself generic.
- Add `src/features/admin/admin-docs-module.test.tsx`: cover filter UI state and empty-result rendering.
- Modify `src/app/admin/(console)/docs/categories/page.tsx`: replace read-only cards with a real management surface.
- Add `src/features/admin/admin-doc-categories-manager.tsx`: category create/edit/delete UI for two-level trees.
- Add `src/features/admin/admin-doc-categories-manager.test.tsx`: cover hierarchy rendering, disabled destructive actions, and form submission state.
- Modify `src/features/admin/admin-docs-types.ts`: add category tree/editor state types and block editor UI types.
- Modify `src/app/admin/(console)/docs/articles/[articleId]/page.tsx`: seed new articles with one starter block and pass richer editor props.
- Replace `src/features/admin/admin-doc-editor.tsx`: switch from raw JSON textarea to block-list editing.
- Add `src/features/admin/admin-doc-block-editor.tsx`: focused block list UI and per-block forms.
- Add `src/features/admin/admin-doc-block-editor.test.tsx`: cover add/move/delete/update flows and validation messages.
- Add `src/features/admin/admin-doc-blocks.ts`: UI adapters between `DocBlock[]` and editor-local block state.
- Add `src/features/admin/admin-doc-blocks.test.ts`: cover round-trip adapters and unsupported-block fallback.
- Add `docs/superpowers/verification/2026-06-05-admin-docs-operations-redesign.md`: record final command and browser verification evidence.

## Task 1: Repository And API Foundations

**Files:**
- Modify: `src/server/repositories/docs.ts`
- Modify: `src/server/repositories/docs.test.ts`
- Modify: `src/app/api/admin/docs/categories/route.ts`
- Add: `src/app/api/admin/docs/categories/[categoryId]/route.ts`
- Add: `src/app/api/admin/docs/categories/[categoryId]/route.test.ts`

- [ ] **Step 1: Write the failing repository tests**

Add these tests to `src/server/repositories/docs.test.ts` near the existing category/article mutation coverage:

```ts
test('listAdminDocArticles applies combined status category and search filters', async () => {
  const { stub, selectResults } = createDocsDbStub();
  setDocsRepositoryDbForTest(stub as never);
  selectResults.push([
    {
      articleId: 'article-1',
      categoryId: 'category-2',
      categoryName: '入门指南',
      categorySlug: 'guides',
      title: '快速开始',
      slug: 'quick-start',
      summary: '适合新运营',
      status: 'draft',
      publishedAt: null,
      archivedAt: null,
      updatedAt: new Date('2026-06-05T00:00:00.000Z'),
    },
  ]);

  const rows = await listAdminDocArticles({
    status: 'draft',
    categoryId: 'category-2',
    search: '快速',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.articleId, 'article-1');
});

test('deleteDocCategory rejects categories that still have children or articles', async () => {
  await assert.rejects(
    () => deleteDocCategory({ categoryId: 'category-1' }),
    /still has child categories|still has linked articles/,
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec tsx --test src/server/repositories/docs.test.ts
```

Expected: FAIL because `deleteDocCategory` does not exist yet and the current repository has no explicit constrained category maintenance API.

- [ ] **Step 3: Add category mutation invariants and filter input support**

In `src/server/repositories/docs.ts`, add focused helpers and new exports instead of burying logic inside routes:

```ts
export type AdminDocListInput = {
  status?: DocArticleStatus;
  categoryId?: string;
  search?: string;
};

function normalizeAdminDocListInput(input?: AdminDocListInput) {
  return {
    status: input?.status,
    categoryId: normalizeText(input?.categoryId) || undefined,
    search: normalizeText(input?.search) || undefined,
  };
}

async function assertCategoryDeleteAllowed(database: ReturnType<typeof requireDb>, categoryId: string) {
  const [childRow] = await database
    .select({ id: schema.docCategories.id })
    .from(schema.docCategories)
    .where(eq(schema.docCategories.parentId, categoryId))
    .limit(1);

  if (childRow) {
    throw new AccountDomainError('invalid_request', 'Doc category still has child categories.', 409);
  }

  const [articleRow] = await database
    .select({ id: schema.docArticles.id })
    .from(schema.docArticles)
    .where(eq(schema.docArticles.categoryId, categoryId))
    .limit(1);

  if (articleRow) {
    throw new AccountDomainError('invalid_request', 'Doc category still has linked articles.', 409);
  }
}
```

Then add:

```ts
export async function updateDocCategory(input: DocCategoryInput & { categoryId: string }) { /* normalize + validate parent level + update */ }

export async function deleteDocCategory(input: { categoryId: string }) {
  const database = requireDb('delete doc category');
  await assertCategoryDeleteAllowed(database, input.categoryId);
  const [deleted] = await database
    .delete(schema.docCategories)
    .where(eq(schema.docCategories.id, input.categoryId))
    .returning();

  if (!deleted) {
    throw new AccountDomainError('account_not_found', 'Doc category not found.', 404);
  }

  return deleted;
}
```

Keep the “max two levels” rule in repository code by rejecting a `parentId` whose own `parentId` is already non-null.

- [ ] **Step 4: Add category maintenance route contracts**

Create `src/app/api/admin/docs/categories/[categoryId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { deleteDocCategory, updateDocCategory } from '@/server/repositories/docs';

const bodySchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  description: z.string().trim().optional(),
  parentId: z.uuid().nullable().optional(),
  audienceScope: z.enum(['user', 'admin', 'shared']).optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ categoryId: string }> }) {
  const session = await requireAdmin();
  const { categoryId } = await context.params;
  const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
  const body = bodySchema.parse(parsedBody);

  return runProtectedMutation(/* same audit envelope */, async () => {
    const category = await updateDocCategory({ categoryId, ...body });
    return NextResponse.json({ ok: true, category });
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await context.params;
  const category = await deleteDocCategory({ categoryId });
  return NextResponse.json({ ok: true, category });
}
```

Add a focused route test in `src/app/api/admin/docs/categories/[categoryId]/route.test.ts` that asserts invalid `sortOrder` or third-level parenting fails with 400/409.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
pnpm exec tsx --test src/server/repositories/docs.test.ts 'src/app/api/admin/docs/categories/[categoryId]/route.test.ts'
```

Expected: PASS.

Commit:

```bash
git add src/server/repositories/docs.ts src/server/repositories/docs.test.ts src/app/api/admin/docs/categories/route.ts 'src/app/api/admin/docs/categories/[categoryId]/route.ts' 'src/app/api/admin/docs/categories/[categoryId]/route.test.ts'
git commit -m "feat: add admin doc category maintenance invariants"
```

## Task 2: Real List Filtering On `/admin/docs`

**Files:**
- Modify: `src/app/admin/(console)/docs/page.tsx`
- Modify: `src/app/admin/(console)/docs/articles/page.tsx`
- Modify: `src/server/repositories/docs.ts`
- Modify: `src/features/admin/module-page.tsx`
- Modify: `src/features/admin/admin-docs-module.tsx`
- Add: `src/features/admin/admin-docs-module.test.tsx`

- [ ] **Step 1: Write the failing UI and page tests**

Add `src/features/admin/admin-docs-module.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminDocsModule } from './admin-docs-module';

test('admin docs module reflects active filters in links and empty state', () => {
  const html = renderToStaticMarkup(
    <AdminDocsModule
      source="database"
      metrics={[]}
      filters={[{ label: '草稿', value: 'draft', count: 1 }]}
      records={[]}
      categories={[{ id: 'category-1', parentId: null, name: '指南', slug: 'guides', description: '', audienceScope: 'shared', sortOrder: 0, articleCount: 0, updatedAt: '2026-06-05T00:00:00.000Z' }]}
      activeFilters={{ status: 'draft', categoryId: 'category-1', search: '快速' }}
    />,
  );

  assert.match(html, /value="快速"/);
  assert.match(html, /草稿/);
  assert.match(html, /暂无记录/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-docs-module.test.tsx src/server/repositories/docs.test.ts
```

Expected: FAIL because `AdminDocsModule` does not accept `activeFilters` and the pages do not wire `searchParams`.

- [ ] **Step 3: Wire list filters from URL into repository calls**

Update both list pages to accept `searchParams` and call `getAdminDocsModuleData` with normalized filters:

```ts
export default async function AdminDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; categoryId?: string; search?: string }>;
}) {
  const params = await searchParams;
  const data = await getAdminDocsModuleData({
    status: params.status === 'draft' || params.status === 'published' || params.status === 'archived'
      ? params.status
      : undefined,
    categoryId: params.categoryId,
    search: params.search,
  });

  return <AdminDocsModule {...data} activeFilters={data.activeFilters} />;
}
```

In `src/server/repositories/docs.ts`, change `getAdminDocsModuleData()` to accept `AdminDocListInput`, pass it to `listAdminDocArticles`, and return `activeFilters`.

- [ ] **Step 4: Replace fake disabled filter chrome with a real docs toolbar**

Keep `AdminModulePage` generic by adding an optional `toolbar?: ReactNode` prop:

```tsx
type AdminModulePageProps<TRecord extends { id: string }> = {
  /* existing props */
  toolbar?: ReactNode;
};

{toolbar ?? (
  <div className="flex flex-col gap-2 md:flex-row md:items-center">
    {/* existing disabled fallback if other modules still rely on it */}
  </div>
)}
```

Then in `src/features/admin/admin-docs-module.tsx`, inject a real GET filter form:

```tsx
<form action="/admin/docs" className="flex flex-col gap-2 md:flex-row md:items-center">
  <Input name="search" defaultValue={activeFilters.search} placeholder="搜索分类、标题、slug 或摘要..." />
  <Select name="categoryId" defaultValue={activeFilters.categoryId || 'all'}>{/* category options */}</Select>
  <Button type="submit" variant="outline">筛选</Button>
  <Button type="button" variant={activeFilters.status === 'draft' ? 'default' : 'outline'} asChild>
    <a href={buildDocListHref({ ...activeFilters, status: 'draft' })}>草稿</a>
  </Button>
</form>
```

The docs module owns the URL-building helper; the generic table component does not.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-docs-module.test.tsx src/server/repositories/docs.test.ts
pnpm run validate
```

Expected: PASS.

Commit:

```bash
git add 'src/app/admin/(console)/docs/page.tsx' 'src/app/admin/(console)/docs/articles/page.tsx' src/server/repositories/docs.ts src/features/admin/module-page.tsx src/features/admin/admin-docs-module.tsx src/features/admin/admin-docs-module.test.tsx
git commit -m "feat: wire admin docs list filters to repository queries"
```

## Task 3: Two-Level Category Management UI

**Files:**
- Modify: `src/app/admin/(console)/docs/categories/page.tsx`
- Add: `src/features/admin/admin-doc-categories-manager.tsx`
- Add: `src/features/admin/admin-doc-categories-manager.test.tsx`
- Modify: `src/features/admin/admin-docs-types.ts`

- [ ] **Step 1: Write the failing component test**

Create `src/features/admin/admin-doc-categories-manager.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminDocCategoriesManager } from './admin-doc-categories-manager';

test('category manager renders grouped parent and child categories', () => {
  const html = renderToStaticMarkup(
    <AdminDocCategoriesManager
      categories={[
        { id: 'parent-1', parentId: null, name: '新手入门', slug: 'onboarding', description: '', audienceScope: 'shared', sortOrder: 0, articleCount: 0, updatedAt: '2026-06-05T00:00:00.000Z' },
        { id: 'child-1', parentId: 'parent-1', name: '账号操作', slug: 'account', description: '', audienceScope: 'shared', sortOrder: 1, articleCount: 2, updatedAt: '2026-06-05T00:00:00.000Z' },
      ]}
    />,
  );

  assert.match(html, /新手入门/);
  assert.match(html, /账号操作/);
  assert.match(html, /新增二级分类/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-doc-categories-manager.test.tsx
```

Expected: FAIL because the category manager component does not exist yet.

- [ ] **Step 3: Add the category management component**

Create `src/features/admin/admin-doc-categories-manager.tsx` with explicit, non-drag-and-drop interactions:

```tsx
'use client';

export function AdminDocCategoriesManager({ categories }: { categories: AdminDocCategoryRow[] }) {
  const tree = buildAdminDocCategoryTree(categories);

  return (
    <div className="space-y-4">
      <CreateCategoryCard parentId={null} title="新增一级分类" />
      {tree.map((parent) => (
        <section key={parent.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <CategoryForm category={parent} />
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {parent.children.map((child) => (
              <CategoryForm key={child.id} category={child} />
            ))}
            <CreateCategoryCard parentId={parent.id} title="新增二级分类" />
          </div>
        </section>
      ))}
    </div>
  );
}
```

Use disabled delete buttons when `articleCount > 0` or `children.length > 0`, but still let the API remain authoritative.

- [ ] **Step 4: Swap the page from read-only to manager mode**

In `src/app/admin/(console)/docs/categories/page.tsx`, replace the static cards:

```tsx
import { AdminDocCategoriesManager } from '@/features/admin/admin-doc-categories-manager';

export default async function AdminDocCategoriesPage() {
  const categories = await listAdminDocCategories();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">分类目录</h2>
        <p className="mt-1 text-sm text-muted-foreground">维护两级目录、可见范围与排序；禁止删除仍有关联内容的分类。</p>
      </div>
      <AdminDocCategoriesManager categories={categories} />
    </div>
  );
}
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-doc-categories-manager.test.tsx src/server/repositories/docs.test.ts 'src/app/api/admin/docs/categories/[categoryId]/route.test.ts'
```

Expected: PASS.

Commit:

```bash
git add 'src/app/admin/(console)/docs/categories/page.tsx' src/features/admin/admin-doc-categories-manager.tsx src/features/admin/admin-doc-categories-manager.test.tsx src/features/admin/admin-docs-types.ts
git commit -m "feat: add two-level admin doc category manager"
```

## Task 4: Block-List Editor And New-Doc Defaults

**Files:**
- Modify: `src/app/admin/(console)/docs/articles/[articleId]/page.tsx`
- Modify: `src/features/admin/admin-doc-editor.tsx`
- Add: `src/features/admin/admin-doc-block-editor.tsx`
- Add: `src/features/admin/admin-doc-block-editor.test.tsx`
- Add: `src/features/admin/admin-doc-blocks.ts`
- Add: `src/features/admin/admin-doc-blocks.test.ts`
- Modify: `src/features/admin/admin-docs-types.ts`
- Modify: `src/app/api/admin/docs/articles/route.ts`
- Modify: `src/app/api/admin/docs/articles/[articleId]/route.ts`

- [ ] **Step 1: Write failing adapter and editor tests**

Create `src/features/admin/admin-doc-blocks.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { createStarterDocBlocks, fromDocBlocks, toDocBlocks } from './admin-doc-blocks';

test('starter blocks create one editable paragraph block', () => {
  const blocks = createStarterDocBlocks();
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.type, 'rich_text');
});

test('unsupported blocks round-trip as readonly fallback items', () => {
  const state = fromDocBlocks([{ type: 'flowchart', source: 'graph TD;A-->B', format: 'mermaid' }]);
  assert.equal(state[0]?.kind, 'unsupported');
  assert.deepEqual(toDocBlocks(state), [{ type: 'flowchart', source: 'graph TD;A-->B', format: 'mermaid' }]);
});
```

Create `src/features/admin/admin-doc-block-editor.test.tsx`:

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminDocBlockEditor } from './admin-doc-block-editor';

test('block editor renders ordered cards and add-block affordance', () => {
  const html = renderToStaticMarkup(
    <AdminDocBlockEditor
      blocks={createStarterDocBlocks()}
      onChange={() => {}}
      errorMessages={[]}
    />,
  );

  assert.match(html, /新增内容块/);
  assert.match(html, /上移|下移/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-doc-blocks.test.ts src/features/admin/admin-doc-block-editor.test.tsx
```

Expected: FAIL because the block adapter/editor modules do not exist.

- [ ] **Step 3: Add block adapters and starter block helpers**

Create `src/features/admin/admin-doc-blocks.ts` with UI-local block items that map to the existing `DocBlock` schema:

```ts
export type AdminEditableDocBlock =
  | { id: string; kind: 'rich_text'; title: string; body: string }
  | { id: string; kind: 'faq'; items: Array<{ id: string; question: string; answer: string }> }
  | { id: string; kind: 'step_media'; steps: Array<{ id: string; title: string; body: string; imageUrl: string }> }
  | { id: string; kind: 'gallery'; items: Array<{ id: string; imageUrl: string; title: string; description: string }> }
  | { id: string; kind: 'video'; title: string; url: string; coverImage: string; description: string }
  | { id: string; kind: 'audio'; title: string; url: string; description: string }
  | { id: string; kind: 'unsupported'; raw: DocBlock };

export function createStarterDocBlocks(): AdminEditableDocBlock[] {
  return [{ id: crypto.randomUUID(), kind: 'rich_text', title: '正文', body: '' }];
}
```

Keep `fromDocBlocks` / `toDocBlocks` as pure functions so they stay easy to unit-test.

- [ ] **Step 4: Replace the raw JSON editor with block-list editing**

In `src/app/admin/(console)/docs/articles/[articleId]/page.tsx`, seed new articles with starter blocks:

```ts
blocks: createStarterDocBlocksMappedToDocBlocks(),
```

Then rewrite `src/features/admin/admin-doc-editor.tsx` to:

```tsx
const [blocks, setBlocks] = useState(() => fromDocBlocks(data.article.blocks.length ? data.article.blocks : createStarterDocBlocksMappedToDocBlocks()));

async function submit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const blockResult = validateAdminEditableBlocks(blocks);
  if (!blockResult.ok) {
    setMessage(blockResult.message);
    return;
  }

  const payload = {
    categoryId: state.categoryId,
    title: state.title,
    slug: state.slug || slugify(state.title),
    summary: state.summary,
    coverImage: state.coverImage || null,
    status: state.status,
    blocks: toDocBlocks(blocks),
  };

  await postJson(url, payload);
}

<AdminDocBlockEditor blocks={blocks} onChange={setBlocks} errorMessages={blockErrors} />
```

The editor should show per-block validation messages such as `第 2 个内容块：FAQ 答案不能为空`, not raw Zod traces or JSON parse failures.

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-doc-blocks.test.ts src/features/admin/admin-doc-block-editor.test.tsx src/server/repositories/docs.test.ts
pnpm run build
```

Expected: PASS.

Commit:

```bash
git add 'src/app/admin/(console)/docs/articles/[articleId]/page.tsx' src/features/admin/admin-doc-editor.tsx src/features/admin/admin-doc-block-editor.tsx src/features/admin/admin-doc-block-editor.test.tsx src/features/admin/admin-doc-blocks.ts src/features/admin/admin-doc-blocks.test.ts src/features/admin/admin-docs-types.ts src/app/api/admin/docs/articles/route.ts 'src/app/api/admin/docs/articles/[articleId]/route.ts'
git commit -m "feat: replace admin doc json editing with block editor"
```

## Task 5: Final Verification And Evidence

**Files:**
- Add: `docs/superpowers/verification/2026-06-05-admin-docs-operations-redesign.md`

- [ ] **Step 1: Run the full targeted test set**

Run:

```bash
pnpm exec tsx --test src/server/repositories/docs.test.ts 'src/app/api/admin/docs/categories/[categoryId]/route.test.ts' src/features/admin/admin-docs-module.test.tsx src/features/admin/admin-doc-categories-manager.test.tsx src/features/admin/admin-doc-blocks.test.ts src/features/admin/admin-doc-block-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run baseline static verification**

Run:

```bash
pnpm run validate
pnpm run build
```

Expected: PASS.

- [ ] **Step 3: Run browser verification**

Run:

```bash
pnpm run dev:pw
```

Then verify in Browser or Playwright:

- `/admin/docs` keeps `search`, `status`, and `categoryId` in the URL and changes table rows
- `/admin/docs/categories` can create a parent and child category and blocks delete when `articleCount > 0`
- `/admin/docs/articles/new` opens with one starter block, allows add/move/delete, and saves without touching JSON

- [ ] **Step 4: Record evidence**

Write `docs/superpowers/verification/2026-06-05-admin-docs-operations-redesign.md` with:

```md
- Commands run
- PASS/FAIL per command
- Browser scenarios exercised
- Any blocked checks with exact blocker
```

- [ ] **Step 5: Commit verification notes**

```bash
git add docs/superpowers/verification/2026-06-05-admin-docs-operations-redesign.md
git commit -m "docs: add admin docs operations redesign verification"
```

## Self-Review

- Spec coverage: covered list filtering, two-level category maintenance, block-list editing, new-doc defaults, and verification evidence. Explicitly left out drag-and-drop, versioning, workflow approval, and public docs IA changes per spec.
- Placeholder scan: removed `TODO`/`TBD`; each task names exact files, commands, and representative code to add.
- Type consistency: the plan consistently uses `AdminDocListInput`, `updateDocCategory`, `deleteDocCategory`, `AdminDocCategoriesManager`, `AdminDocBlockEditor`, and adapter helpers `fromDocBlocks` / `toDocBlocks`.
