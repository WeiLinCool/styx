import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { parseAdminContentBody } from './route';

test('parseAdminContentBody accepts valid homepage content body', async () => {
  const body = await parseAdminContentBody({
    json: async () => ({
      slug: 'home.hero',
      title: 'Homepage Hero',
      body: '正文',
      url: null,
      metadata: {
        eyebrow: '后台',
        headline: '后台首页',
        subheadline: '后台副标题',
        body: '后台正文',
        primaryCta: { label: '开始', href: '/image-gen' },
        secondaryCta: { label: '商城', href: '/shop' },
      },
    }),
  });

  assert.equal(body.slug, 'home.hero');
});

test('parseAdminContentBody rejects unsupported slugs', async () => {
  await assert.rejects(
    () =>
      parseAdminContentBody({
        json: async () => ({
          slug: 'home.bad',
          title: 'Bad',
          metadata: {},
        }),
      }),
    ZodError,
  );
});
