import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminContentMutationValues,
  mapPublishedHomepageRows,
  resolveContentStatusTransition,
} from './content';

test('buildAdminContentMutationValues rejects unsupported homepage slugs', () => {
  assert.throws(
    () =>
      buildAdminContentMutationValues({
        slug: 'home.unsupported',
        title: 'Unsupported',
        metadata: {},
        body: null,
        url: null,
        actorId: '00000000-0000-4000-8000-000000000001',
      }),
    /Unsupported homepage content slug/,
  );
});

test('buildAdminContentMutationValues accepts valid homepage metadata', () => {
  const values = buildAdminContentMutationValues({
    slug: 'home.hero',
    title: 'Homepage Hero',
    metadata: {
      eyebrow: '后台',
      headline: '后台首页',
      subheadline: '后台副标题',
      body: '后台正文',
      primaryCta: { label: '开始', href: '/image-gen' },
      secondaryCta: { label: '商城', href: '/shop' },
    },
    body: '后台正文',
    url: null,
    actorId: '00000000-0000-4000-8000-000000000001',
  });

  assert.equal(values.slug, 'home.hero');
  assert.equal(values.kind, 'page');
  assert.equal(values.status, 'draft');
});

test('resolveContentStatusTransition publishes with timestamp', () => {
  const now = new Date('2026-06-02T00:00:00.000Z');
  const next = resolveContentStatusTransition('publish', now);

  assert.equal(next.status, 'published');
  assert.equal(next.publishedAt?.toISOString(), '2026-06-02T00:00:00.000Z');
});

test('resolveContentStatusTransition draft removes public visibility', () => {
  const next = resolveContentStatusTransition('draft', new Date('2026-06-02T00:00:00.000Z'));

  assert.equal(next.status, 'draft');
});

test('mapPublishedHomepageRows ignores draft and unpublished rows', () => {
  const rows = mapPublishedHomepageRows([
    {
      slug: 'home.hero',
      status: 'draft',
      publishedAt: new Date('2026-06-02T00:00:00.000Z'),
      metadata: {
        eyebrow: 'draft',
        headline: 'draft',
        subheadline: 'draft',
        body: 'draft',
        primaryCta: { label: '开始', href: '/image-gen' },
        secondaryCta: { label: '商城', href: '/shop' },
      },
    },
    {
      slug: 'home.hero',
      status: 'published',
      publishedAt: null,
      metadata: {
        eyebrow: 'bad',
        headline: 'bad',
        subheadline: 'bad',
        body: 'bad',
        primaryCta: { label: '开始', href: '/image-gen' },
        secondaryCta: { label: '商城', href: '/shop' },
      },
    },
  ]);

  assert.equal(rows.length, 0);
});
