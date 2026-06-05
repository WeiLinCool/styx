import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDocSearchText,
  createDocArticle,
  createDocCategory,
  createDocImportJob,
  deleteDocCategory,
  getAdminDocArticle,
  getPublishedDocArticle,
  listAdminDocCategories,
  listAdminDocArticles,
  listPublishedDocs,
  markDocImportJobImported,
  mapArticleStatusUpdate,
  mapPublishedDocsRow,
  normalizeDocArticleDraftInput,
  normalizeDocImportJobInput,
  resolveAudienceVisibility,
  setDocsRepositoryDbForTest,
  updateDocArticle,
  updateDocArticleStatus,
} from './docs';

function createDocsDbStub() {
  const calls: Array<{ kind: string; value?: unknown }> = [];
  const selectResults: unknown[][] = [];
  const insertResults: unknown[][] = [];
  const updateResults: unknown[][] = [];
  const deleteResults: unknown[][] = [];
  type WrappedSelectResult = unknown[] & {
    orderBy: () => WrappedSelectResult;
    limit: () => WrappedSelectResult;
    then: <TResult1 = unknown[], TResult2 = never>(
      onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise<TResult1 | TResult2>;
  };
  type DocsDbStub = {
    select: () => {
      from: () => {
        innerJoin: () => { where: () => WrappedSelectResult };
        leftJoin: () => { groupBy: () => { orderBy: () => WrappedSelectResult } };
        where: () => WrappedSelectResult;
      };
    };
    insert: () => { values: () => { returning: () => unknown[] } };
    update: () => { set: () => { where: () => { returning: () => unknown[] } } };
    delete: () => { where: () => { returning: () => unknown[] } };
    query: {
      docCategories: {
        findMany: () => Promise<unknown[]>;
      };
    };
    transaction: (callback: (tx: DocsDbStub) => Promise<unknown>) => Promise<unknown>;
  };
  const wrapSelectResult = (result: unknown[]) => {
    const array = [...result];
    const wrapped = Object.assign(array, {
      orderBy: () => wrapped,
      limit: () => wrapped,
      then: <TResult1 = unknown[], TResult2 = never>(
        onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve([...array]).then(onfulfilled, onrejected),
    });
    return wrapped satisfies WrappedSelectResult;
  };
  const stub: DocsDbStub = {
    select() {
      calls.push({ kind: 'select' });
      const result = selectResults.shift() ?? [];
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => wrapSelectResult(result),
          }),
          leftJoin: () => ({
            groupBy: () => ({
              orderBy: () => wrapSelectResult(result),
            }),
          }),
          where: () => wrapSelectResult(result),
        }),
      };
    },
    insert() {
      calls.push({ kind: 'insert' });
      return {
        values: () => ({
          returning: () => insertResults.shift() ?? [null],
        }),
      };
    },
    update() {
      calls.push({ kind: 'update' });
      return {
        set: () => ({
          where: () => ({
            returning: () => updateResults.shift() ?? [null],
          }),
        }),
      };
    },
    delete() {
      calls.push({ kind: 'delete' });
      return {
        where: () => ({
          returning: () => deleteResults.shift() ?? [null],
        }),
      };
    },
    query: {
      docCategories: {
        findMany() {
          calls.push({ kind: 'query.docCategories.findMany' });
          return Promise.resolve([]);
        },
      },
    },
    transaction(callback) {
      calls.push({ kind: 'transaction' });
      return callback(stub as never);
    },
  };

  return {
    stub,
    calls,
    selectResults,
    insertResults,
    updateResults,
    deleteResults,
  };
}

test('audience visibility allows shared docs for both surfaces', () => {
  assert.equal(resolveAudienceVisibility('shared', 'user'), true);
  assert.equal(resolveAudienceVisibility('shared', 'admin'), true);
  assert.equal(resolveAudienceVisibility('admin', 'user'), false);
  assert.equal(resolveAudienceVisibility('user', 'admin'), false);
});

test('status update timestamps published and archived transitions', () => {
  const now = new Date('2026-06-04T00:00:00.000Z');

  assert.equal(mapArticleStatusUpdate('published', now).publishedAt?.toISOString(), now.toISOString());
  assert.equal(mapArticleStatusUpdate('published', now).archivedAt, null);
  assert.equal(mapArticleStatusUpdate('archived', now).archivedAt?.toISOString(), now.toISOString());
});

test('draft status clears public visibility timestamps', () => {
  const next = mapArticleStatusUpdate('draft', new Date('2026-06-04T00:00:00.000Z'));

  assert.equal(next.status, 'draft');
  assert.equal(next.publishedAt, null);
  assert.equal(next.archivedAt, null);
});

test('search text merges title summary and block content', () => {
  const text = buildDocSearchText('Title', 'Summary', [
    { type: 'faq', items: [{ question: 'Q1', answer: 'A1' }] },
    {
      type: 'gallery',
      items: [
        {
          imageUrl: 'https://cdn.example.com/shot.png',
          title: 'Shot',
          description: 'Walkthrough screenshot',
        },
      ],
    },
    {
      type: 'rich_text',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Extra body copy' }],
        },
      ],
    },
  ]);

  assert.match(text, /Title/);
  assert.match(text, /Summary/);
  assert.match(text, /Q1/);
  assert.match(text, /Walkthrough screenshot/);
  assert.match(text, /Extra body copy/);
});

test('normalizeDocArticleDraftInput normalizes editable fields and validated blocks', () => {
  const input = normalizeDocArticleDraftInput({
    categoryId: 'category-1',
    title: '  Title  ',
    slug: '  title-1  ',
    summary: '  Summary  ',
    coverImage: '  https://cdn.example.com/cover.png  ',
    blocks: [
      {
        type: 'faq',
        items: [{ question: 'Q1', answer: 'A1' }],
      },
    ],
    actorId: 'user-1',
  });

  assert.equal(input.title, 'Title');
  assert.equal(input.slug, 'title-1');
  assert.equal(input.summary, 'Summary');
  assert.equal(input.coverImage, 'https://cdn.example.com/cover.png');
  assert.equal(input.blocks.length, 1);
});

test('mapPublishedDocsRow keeps published article rows and strips draft rows', () => {
  assert.equal(
    mapPublishedDocsRow({
      status: 'published',
      publishedAt: new Date('2026-06-04T00:00:00.000Z'),
      title: 'Title',
      summary: 'Summary',
      blocks: [],
    })?.title,
    'Title',
  );

  assert.equal(
    mapPublishedDocsRow({
      status: 'draft',
      publishedAt: null,
      title: 'Draft',
      summary: 'Draft',
      blocks: [],
    }),
    null,
  );
});

test('normalizeDocImportJobInput normalizes import job payloads', () => {
  const job = normalizeDocImportJobInput({
    sourceFilename: '  guide.md  ',
    sourceChecksum: '  checksum  ',
    importStatus: 'parsed',
    previewSnapshot: { title: 'Guide' },
    errorSummary: '  ',
    createdArticleId: 'article-1',
    createdBy: 'user-1',
  });

  assert.equal(job.sourceFilename, 'guide.md');
  assert.equal(job.sourceChecksum, 'checksum');
  assert.equal(job.errorSummary, null);
  assert.equal(job.importStatus, 'parsed');
});

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

  setDocsRepositoryDbForTest(null);
});

test('deleteDocCategory rejects categories that still have children or articles', async () => {
  const { stub, selectResults } = createDocsDbStub();
  setDocsRepositoryDbForTest(stub as never);
  selectResults.push([{ id: 'child-1' }]);

  await assert.rejects(
    () => deleteDocCategory({ categoryId: 'category-1' }),
    /still has child categories|still has linked articles/,
  );

  setDocsRepositoryDbForTest(null);
});

test('docs repository entry points call through the expected query surfaces', async () => {
  const { stub, calls, selectResults, insertResults, updateResults } = createDocsDbStub();
  setDocsRepositoryDbForTest(stub as never);

  selectResults.push([
    {
      id: 'category-1',
      parentId: null,
      name: 'Guides',
      slug: 'guides',
      description: 'How-to docs',
      audienceScope: 'shared',
      sortOrder: 1,
      updatedAt: new Date('2026-06-04T00:00:00.000Z'),
      articleCount: 2,
    },
  ]);
  selectResults.push([]);
  selectResults.push([
    {
      articleId: 'article-1',
      categoryId: 'category-1',
      categoryName: 'Guides',
      categorySlug: 'admin-docs',
      audienceScope: 'admin',
      title: 'Getting Started',
      slug: 'getting-started',
      summary: 'Hello',
      coverImage: null,
      status: 'published',
      publishedAt: new Date('2026-06-04T00:00:00.000Z'),
      updatedAt: new Date('2026-06-04T00:00:00.000Z'),
    },
  ]);
  selectResults.push([]);
  selectResults.push([
    {
      articleId: 'article-1',
      categoryId: 'category-1',
      categoryName: 'Guides',
      categorySlug: 'admin-docs',
      title: 'Admin Guide',
      slug: 'admin-guide',
      summary: 'Admin summary',
      status: 'draft',
      publishedAt: null,
      archivedAt: null,
      updatedAt: new Date('2026-06-04T00:00:00.000Z'),
    },
  ]);
  selectResults.push([
    {
      id: 'article-1',
      categoryId: 'category-1',
      title: 'Admin Guide',
      slug: 'admin-guide',
      summary: 'Admin summary',
      coverImage: null,
      status: 'draft',
      searchText: 'Admin summary',
      publishedAt: null,
      archivedAt: null,
      createdAt: new Date('2026-06-04T00:00:00.000Z'),
      updatedAt: new Date('2026-06-04T00:00:00.000Z'),
      categoryName: 'Guides',
      categorySlug: 'admin-docs',
      audienceScope: 'admin',
    },
  ]);
  selectResults.push([]);
  insertResults.push([{ id: 'category-1' }]);
  insertResults.push([{ id: 'article-1' }]);
  insertResults.push([{ id: 'job-1' }]);
  updateResults.push([{ id: 'article-1', status: 'draft' }]);
  updateResults.push([{ id: 'article-1', status: 'published' }]);
  updateResults.push([{ id: 'job-1' }]);

  const categories = await listAdminDocCategories();
  const publishedDocs = await listPublishedDocs({ audience: 'user', search: 'guide' });
  const publishedArticle = await getPublishedDocArticle({
    audience: 'admin',
    categorySlug: 'admin-docs',
    articleSlug: 'getting-started',
  });
  const adminArticles = await listAdminDocArticles({ status: 'draft', search: 'import' });
  const adminArticle = await getAdminDocArticle('article-1');
  const category = await createDocCategory({
    name: 'Guides',
    slug: 'guides',
    description: 'How-to docs',
    audienceScope: 'shared',
    sortOrder: 1,
  });
  const article = await createDocArticle({
    categoryId: 'category-1',
    title: 'Admin Guide',
    slug: 'admin-guide',
    summary: 'Admin summary',
    blocks: [
      {
        type: 'faq',
        items: [{ question: 'Q1', answer: 'A1' }],
      },
    ],
    actorId: 'user-1',
  });
  const importJob = await createDocImportJob({
    sourceFilename: 'guide.md',
    sourceChecksum: 'sha256:abc',
    importStatus: 'parsed',
    previewSnapshot: { title: 'Guide' },
    createdBy: 'user-1',
  });
  const updatedArticle = await updateDocArticle({
    articleId: 'article-1',
    categoryId: 'category-1',
    title: 'Admin Guide',
    slug: 'admin-guide',
    summary: 'Updated summary',
    blocks: [
      {
        type: 'rich_text',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
      },
    ],
    actorId: 'user-1',
  });
  const publishedAdminArticle = await updateDocArticleStatus({
    articleId: 'article-1',
    status: 'published',
  });
  const importedJob = await markDocImportJobImported({
    jobId: 'job-1',
    createdArticleId: 'article-1',
  });

  assert.equal(categories.length, 1);
  assert.deepEqual(publishedDocs, []);
  assert.equal(publishedArticle?.articleId, 'article-1');
  assert.equal(adminArticles.length, 1);
  assert.equal(adminArticles[0]?.articleId, 'article-1');
  assert.equal(adminArticle?.id, 'article-1');
  assert.equal(category?.id, 'category-1');
  assert.equal(article?.id, 'article-1');
  assert.equal(importJob?.id, 'job-1');
  assert.equal(updatedArticle?.id, 'article-1');
  assert.equal(publishedAdminArticle?.status, 'published');
  assert.equal(importedJob?.id, 'job-1');
  assert.ok(calls.some((call) => call.kind === 'select'));
  assert.ok(calls.some((call) => call.kind === 'insert'));
  assert.ok(calls.some((call) => call.kind === 'update'));
  assert.ok(calls.some((call) => call.kind === 'transaction'));

  setDocsRepositoryDbForTest(null);
});
