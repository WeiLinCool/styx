import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOME_CONTENT_SLUGS,
  defaultHomepageContent,
  mergeHomepageBlocks,
  parseHomepageBlockMetadata,
} from './home-content';

test('HOME_CONTENT_SLUGS covers the initial homepage block contract', () => {
  assert.deepEqual(HOME_CONTENT_SLUGS, [
    'home.hero',
    'home.nav',
    'home.stone_intro',
    'home.join_us',
    'home.ai_tools',
  ]);
});

test('parseHomepageBlockMetadata accepts valid hero metadata', () => {
  const parsed = parseHomepageBlockMetadata('home.hero', {
    eyebrow: 'AI赋能',
    headline: '太极台',
    subheadline: '把照片印进一块石头里',
    body: '手工转印工艺打造独一无二石头印画。',
    primaryCta: { label: '开始创作', href: '/image-gen' },
    secondaryCta: { label: '浏览商城', href: '/shop' },
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.headline, '太极台');
});

test('parseHomepageBlockMetadata rejects unsafe CTA hrefs', () => {
  const parsed = parseHomepageBlockMetadata('home.hero', {
    eyebrow: 'AI赋能',
    headline: '太极台',
    subheadline: '把照片印进一块石头里',
    body: '手工转印工艺打造独一无二石头印画。',
    primaryCta: { label: '开始创作', href: 'https://external.example' },
    secondaryCta: { label: '浏览商城', href: '/shop' },
  });

  assert.equal(parsed.ok, false);
});

test('mergeHomepageBlocks overlays valid published block data over defaults', () => {
  const content = mergeHomepageBlocks(defaultHomepageContent, [
    {
      slug: 'home.hero',
      metadata: {
        eyebrow: '后台发布',
        headline: '后台首页标题',
        subheadline: '后台副标题',
        body: '后台正文',
        primaryCta: { label: '去创作', href: '/image-gen' },
        secondaryCta: { label: '去商城', href: '/shop' },
      },
    },
  ]);

  assert.equal(content.hero.headline, '后台首页标题');
  assert.ok(content.nav.publicNavLinks.length > 0);
});

test('mergeHomepageBlocks keeps defaults for malformed block data', () => {
  const content = mergeHomepageBlocks(defaultHomepageContent, [
    {
      slug: 'home.hero',
      metadata: {
        headline: '',
      },
    },
  ]);

  assert.equal(content.hero.headline, defaultHomepageContent.hero.headline);
});
