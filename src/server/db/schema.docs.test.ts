import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { DOC_BLOCK_TYPES } from '../docs/constants';
import { docBlockSchema } from '../docs/schema';
import {
  aiModels,
  docArticleBlocks,
  docArticleBlockType,
  docArticles,
  docArticleStatus,
  docAudienceScope,
  docCategories,
  docImportJobs,
} from './schema';

test('docs schema exposes expected enums', () => {
  assert.deepEqual(docAudienceScope.enumValues, ['user', 'admin', 'shared']);
  assert.deepEqual(docArticleStatus.enumValues, ['draft', 'published', 'archived']);
  assert.deepEqual(docArticleBlockType.enumValues, DOC_BLOCK_TYPES);
});

test('docs tables expose expected key columns and ordering constraints', () => {
  assert.equal(getTableConfig(docCategories).name, 'doc_categories');
  assert.equal(getTableConfig(docArticles).name, 'doc_articles');
  assert.equal(getTableConfig(docArticleBlocks).name, 'doc_article_blocks');
  assert.equal(getTableConfig(docImportJobs).name, 'doc_import_jobs');

  assert.equal(docCategories.slug.name, 'slug');
  assert.equal(docArticles.categoryId.name, 'category_id');
  assert.equal(docArticleBlocks.payload.name, 'payload');
  assert.equal(docImportJobs.createdArticleId.name, 'created_article_id');

  const categoryIndexes = getTableConfig(docCategories).indexes;
  const categorySlugIndex = categoryIndexes.find(
    (index) => index.config.name === 'doc_categories_slug_idx',
  );
  assert.ok(categorySlugIndex);
  assert.equal(categorySlugIndex.config.unique, true);
  assert.deepEqual(
    (categorySlugIndex.config.columns as Array<{ name?: string }>).map((column) => column.name),
    ['slug'],
  );

  const categoryAudienceSortIndex = categoryIndexes.find(
    (index) => index.config.name === 'doc_categories_audience_sort_idx',
  );
  assert.ok(categoryAudienceSortIndex);
  assert.equal(categoryAudienceSortIndex.config.unique, false);
  assert.deepEqual(
    (categoryAudienceSortIndex.config.columns as Array<{ name?: string }>).map(
      (column) => column.name,
    ),
    ['audience_scope', 'sort_order'],
  );

  const articleIndexes = getTableConfig(docArticles).indexes;
  const articleCategorySlugIndex = articleIndexes.find(
    (index) => index.config.name === 'doc_articles_category_slug_idx',
  );
  assert.ok(articleCategorySlugIndex);
  assert.equal(articleCategorySlugIndex.config.unique, true);
  assert.deepEqual(
    (articleCategorySlugIndex.config.columns as Array<{ name?: string }>).map(
      (column) => column.name,
    ),
    ['category_id', 'slug'],
  );

  const articleStatusUpdatedIndex = articleIndexes.find(
    (index) => index.config.name === 'doc_articles_status_updated_idx',
  );
  assert.ok(articleStatusUpdatedIndex);
  assert.equal(articleStatusUpdatedIndex.config.unique, false);
  assert.deepEqual(
    (articleStatusUpdatedIndex.config.columns as Array<{ name?: string }>).map(
      (column) => column.name,
    ),
    ['status', 'updated_at'],
  );

  const blockIndexes = getTableConfig(docArticleBlocks).indexes;
  const articleSortIndex = blockIndexes.find(
    (index) => index.config.name === 'doc_article_blocks_article_sort_idx',
  );
  assert.ok(articleSortIndex);
  assert.equal(articleSortIndex.config.unique, true);
  assert.deepEqual(
    (articleSortIndex.config.columns as Array<{ name?: string }>).map((column) => column.name),
    ['article_id', 'sort_order'],
  );
});

test('ai models schema exposes execution protocol column', () => {
  assert.equal(aiModels.executionProtocol.name, 'execution_protocol');
});

test('runtime block schema accepts every supported block variant', () => {
  const validBlocks = [
    {
      type: 'rich_text',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    },
    {
      type: 'step_media',
      steps: [{ title: 'Step 1', body: 'Do this', imageUrl: 'https://example.com/step.png' }],
    },
    {
      type: 'video',
      title: 'Walkthrough',
      url: 'https://example.com/video.mp4',
      coverImage: 'https://example.com/video-cover.png',
      description: 'Overview',
    },
    {
      type: 'audio',
      title: 'Narration',
      url: 'https://example.com/audio.mp3',
      description: 'Listen',
    },
    {
      type: 'faq',
      items: [{ question: 'Q1', answer: 'A1' }],
    },
    {
      type: 'flowchart',
      source: 'graph TD; A-->B;',
      format: 'mermaid',
    },
    {
      type: 'gallery',
      items: [{ imageUrl: 'https://example.com/demo.png', title: 'Demo', description: '' }],
    },
  ] as const;

  for (const block of validBlocks) {
    const parsed = docBlockSchema.parse(block);
    assert.equal(parsed.type, block.type);
  }
});

test('runtime block schema rejects variant-specific malformed payloads', () => {
  assert.throws(() =>
    docBlockSchema.parse({
      type: 'rich_text',
      content: ['not-a-node'],
    }),
  );

  assert.throws(() =>
    docBlockSchema.parse({
      type: 'step_media',
      steps: [{ title: '', body: 'Missing title' }],
    }),
  );

  assert.throws(() =>
    docBlockSchema.parse({
      type: 'video',
      title: 'Walkthrough',
      url: 'not-a-url',
    }),
  );

  assert.throws(() =>
    docBlockSchema.parse({
      type: 'audio',
      title: 'Narration',
      url: 'https://example.com/audio.mp3',
      extra: true,
    }),
  );

  assert.throws(() =>
    docBlockSchema.parse({
      type: 'faq',
      items: [{ question: 'Q', answer: 'A', extra: 'nope' }],
    }),
  );

  assert.throws(() =>
    docBlockSchema.parse({
      type: 'flowchart',
      source: 'graph TD; A-->B;',
      format: 'svg',
    }),
  );

  assert.throws(() =>
    docBlockSchema.parse({
      type: 'gallery',
      items: [{ imageUrl: 'invalid-url', title: 'Broken', description: '' }],
    }),
  );
});

test('runtime block schema rejects unknown top-level keys', () => {
  assert.throws(() =>
    docBlockSchema.parse({
      type: 'video',
      title: 'Walkthrough',
      url: 'https://example.com/video.mp4',
      unexpected: true,
    }),
  );
});
