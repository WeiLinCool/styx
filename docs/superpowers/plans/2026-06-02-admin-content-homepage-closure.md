# Admin Content Homepage Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the first content-management loop by letting admins manage selected `/home` content blocks and letting the public homepage render published admin content with static fallback.

**Architecture:** Reuse `content_assets` as the durable source. Add typed homepage content defaults/validators, repository-owned create/update/status transitions, zod-validated admin API routes, real admin UI controls, and a server wrapper for `/home` that passes normalized content to the existing interactive client UI. Public reads consume only published records and overlay them onto static defaults.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle/PostgreSQL, zod, shadcn/Radix UI, existing `adminApiRequest`, Node test runner via `pnpm exec tsx --test`.

---

## File Structure

- Create `src/features/public/home-content.ts`: typed homepage content defaults, slug constants, metadata validators, normalization helpers, and merge helpers.
- Create `src/features/public/home-content.test.ts`: pure tests for validators, defaults, published overlay, malformed fallback, and slug coverage.
- Modify `src/features/public/home-data.ts`: export the existing static nav/tool/value data as inputs for defaults; avoid business logic here.
- Modify `src/server/repositories/content.ts`: keep admin listing, add mutation helpers, status transition helpers, public homepage loader, and pure mapping helpers.
- Create `src/server/repositories/content.test.ts`: tests for pure repository helpers and public fallback behavior using dependency injection or pure row mapping.
- Create `src/app/api/admin/content/route.ts`: `POST` create draft route and exported parse helper.
- Create `src/app/api/admin/content/[contentId]/route.ts`: `POST` or `PATCH` update route and exported parse helper.
- Create `src/app/api/admin/content/[contentId]/publish/route.ts`: publish route.
- Create `src/app/api/admin/content/[contentId]/draft/route.ts`: unpublish route.
- Create `src/app/api/admin/content/[contentId]/archive/route.ts`: archive route.
- Create route tests beside each route or one focused `src/app/api/admin/content/route.test.ts` for parse helpers and status body validation.
- Create `src/features/admin/admin-content-actions.tsx`: client create/edit dialogs and publish/draft/archive actions.
- Modify `src/app/admin/(console)/content/page.tsx`: replace disabled actions with `AdminContentActions` and add `CreateAdminContentDialog`.
- Create `src/features/public/home-page.tsx`: move current interactive homepage client component here, accepting `content` prop.
- Modify `src/app/home/page.tsx`: server component loader that calls repository public loader and renders `<HomePageClient content={content} />`.

## Implementation Notes

- Keep schema unchanged for the first pass. If implementation discovers a hard need for schema change, stop and update the plan before editing `src/server/db/schema.ts`.
- Use supported slugs exactly: `home.hero`, `home.nav`, `home.stone_intro`, `home.join_us`, `home.ai_tools`.
- Public reads must require `status === 'published'` and `publishedAt !== null`.
- Admin create/update should persist drafts unless the status action route explicitly publishes.
- `draft` action should set `status: 'draft'`; preserving `publishedAt` is acceptable for audit display, but public read must still ignore it because status is not published.

---

### Task 1: Homepage Content Contract

**Files:**
- Create: `src/features/public/home-content.ts`
- Create: `src/features/public/home-content.test.ts`
- Modify: `src/features/public/home-data.ts`

- [ ] **Step 1: Write failing validator/default tests**

Create `src/features/public/home-content.test.ts`:

```ts
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
    headline: '南风石印工坊',
    subheadline: '把照片印进一块石头里',
    body: '手工转印工艺打造独一无二石头印画。',
    primaryCta: { label: '开始创作', href: '/image-gen' },
    secondaryCta: { label: '浏览商城', href: '/shop' },
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.headline, '南风石印工坊');
});

test('parseHomepageBlockMetadata rejects unsafe CTA hrefs', () => {
  const parsed = parseHomepageBlockMetadata('home.hero', {
    eyebrow: 'AI赋能',
    headline: '南风石印工坊',
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/features/public/home-content.test.ts
```

Expected: FAIL because `src/features/public/home-content.ts` does not exist.

- [ ] **Step 3: Implement homepage content types and validators**

Create `src/features/public/home-content.ts`:

```ts
import { z } from 'zod';

import {
  productValueProps,
  publicAiToolLinks,
  publicExploreLinks,
  publicNavLinks,
  publicToolCards,
} from './home-data';

export const HOME_CONTENT_SLUGS = [
  'home.hero',
  'home.nav',
  'home.stone_intro',
  'home.join_us',
  'home.ai_tools',
] as const;

export type HomeContentSlug = (typeof HOME_CONTENT_SLUGS)[number];

export type LinkItem = {
  label: string;
  href: string;
  desc?: string;
};

export type HomepageContent = {
  hero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    body: string;
    primaryCta: LinkItem;
    secondaryCta: LinkItem;
  };
  nav: {
    publicNavLinks: LinkItem[];
    publicExploreLinks: LinkItem[];
    publicAiToolLinks: LinkItem[];
  };
  stoneIntro: {
    eyebrow: string;
    headline: string;
    body: string;
    categories: Array<{ image: string; title: string; desc: string }>;
    features: string[];
    process: Array<{ step: string; icon: 'camera' | 'check' | 'hammer' | 'star' | 'truck'; title: string; desc: string }>;
  };
  joinUs: {
    eyebrow: string;
    headline: string;
    body: string;
    advantages: Array<{ title: string; desc: string }>;
    platforms: Array<{ name: string; color: string; icon: 'douyin' | 'shipinhao' | 'xiaohongshu' | 'kuaishou' | 'wechat' | 'community' }>;
    methods: Array<{ title: string; desc: string }>;
    primaryCta: LinkItem;
    secondaryCta: LinkItem;
  };
  aiTools: {
    eyebrow: string;
    headline: string;
    tools: LinkItem[];
  };
};

const internalHrefSchema = z.string().trim().regex(/^\/[A-Za-z0-9/_?=&.-]*$/);
const requiredText = z.string().trim().min(1);
const linkSchema = z.object({
  label: requiredText,
  href: internalHrefSchema,
  desc: z.string().trim().optional(),
});

const heroSchema = z.object({
  eyebrow: requiredText,
  headline: requiredText,
  subheadline: requiredText,
  body: requiredText,
  primaryCta: linkSchema,
  secondaryCta: linkSchema,
});

const navSchema = z.object({
  publicNavLinks: z.array(linkSchema).min(1).max(12),
  publicExploreLinks: z.array(linkSchema).min(1).max(12),
  publicAiToolLinks: z.array(linkSchema).min(1).max(12),
});

const stoneIntroSchema = z.object({
  eyebrow: requiredText,
  headline: requiredText,
  body: requiredText,
  categories: z
    .array(z.object({ image: internalHrefSchema, title: requiredText, desc: requiredText }))
    .min(1)
    .max(8),
  features: z.array(requiredText).min(1).max(12),
  process: z
    .array(
      z.object({
        step: requiredText,
        icon: z.enum(['camera', 'check', 'hammer', 'star', 'truck']),
        title: requiredText,
        desc: requiredText,
      }),
    )
    .min(1)
    .max(8),
});

const joinUsSchema = z.object({
  eyebrow: requiredText,
  headline: requiredText,
  body: requiredText,
  advantages: z.array(z.object({ title: requiredText, desc: requiredText })).min(1).max(10),
  platforms: z
    .array(
      z.object({
        name: requiredText,
        color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/),
        icon: z.enum(['douyin', 'shipinhao', 'xiaohongshu', 'kuaishou', 'wechat', 'community']),
      }),
    )
    .min(1)
    .max(8),
  methods: z.array(z.object({ title: requiredText, desc: requiredText })).min(1).max(8),
  primaryCta: linkSchema,
  secondaryCta: linkSchema,
});

const aiToolsSchema = z.object({
  eyebrow: requiredText,
  headline: requiredText,
  tools: z.array(linkSchema).min(1).max(8),
});

const blockSchemas = {
  'home.hero': heroSchema,
  'home.nav': navSchema,
  'home.stone_intro': stoneIntroSchema,
  'home.join_us': joinUsSchema,
  'home.ai_tools': aiToolsSchema,
} as const;

export const defaultHomepageContent: HomepageContent = {
  hero: {
    eyebrow: 'AI赋能 · 轻创业 · 石头印画',
    headline: '南风石印工坊',
    subheadline: '把照片印进一块石头里',
    body: 'AI视频工作流驱动短视频获客，手工转印工艺打造独一无二石头印画。轻资产创业，一人公司模式，普通人也能年入30万+。',
    primaryCta: { label: '开始创作', href: '/image-gen' },
    secondaryCta: { label: '浏览商城', href: '/shop' },
  },
  nav: {
    publicNavLinks,
    publicExploreLinks,
    publicAiToolLinks,
  },
  stoneIntro: {
    eyebrow: '石头印画定制',
    headline: '把你的照片，印进一块独一无二的石头里',
    body: '通过手工转印工艺，把照片制作到天然石头表面。每一块石头都有不同的形状和纹理，所以每一件成品都是独一无二的。',
    categories: [
      { image: '/pet.png', title: '宠物照片', desc: '猫咪、狗狗，桌面纪念摆件' },
      { image: '/couple.png', title: '情侣照片', desc: '纪念日、七夕、情人节礼物' },
      { image: '/family.png', title: '家人照片', desc: '宝宝照、全家福，温暖纪念' },
      { image: '/landscape.png', title: '风景照片', desc: '旅行照片、城市记忆' },
      { image: '/memorial.png', title: '纪念图片', desc: '重要的人，重要的时刻' },
    ],
    features: [
      '天然石头制作，每块形状独一无二',
      '手工转印，有真实手作质感',
      '成品表面亮面有光泽，适合摆放展示',
      '可以定制个人照片，纪念意义更强',
      '可搭配小木架、礼盒、贺卡，送礼更完整',
    ],
    process: [
      { step: '01', icon: 'camera', title: '发送照片', desc: '发送你想定制的照片' },
      { step: '02', icon: 'check', title: '确认效果', desc: '确认是否适合制作' },
      { step: '03', icon: 'hammer', title: '手工制作', desc: '手工转印到石头上' },
      { step: '04', icon: 'star', title: '成品确认', desc: '展示成品效果' },
      { step: '05', icon: 'truck', title: '包装发出', desc: '搭配木架、礼盒发出' },
    ],
  },
  joinUs: {
    eyebrow: '月入十万',
    headline: '适合普通人的轻资产手作项目',
    body: '通过短视频内容、AI视频生成等方式引流，再通过定制石头印画产品实现成交变现。',
    advantages: [
      { title: '产品新奇', desc: '第一次看到"把照片印到石头上"就会产生好奇' },
      { title: '过程好看', desc: '制作过程非常适合做短视频内容' },
      productValueProps[0],
      { title: '情绪价值高', desc: '宠物、情侣、纪念日，适合做礼物' },
      { title: '成本可控', desc: '材料成本不高，利润可观' },
    ],
    platforms: [
      { name: '抖音', color: '#000000', icon: 'douyin' },
      { name: '视频号', color: '#FA9D3B', icon: 'shipinhao' },
      { name: '小红书', color: '#FE2C55', icon: 'xiaohongshu' },
      { name: '快手', color: '#FF4906', icon: 'kuaishou' },
      { name: '朋友圈', color: '#07C160', icon: 'wechat' },
      { name: '私域社群', color: '#1d1d1f', icon: 'community' },
    ],
    methods: [
      { title: '成品定制成交', desc: '客户发照片，确认后付款制作发货' },
      { title: '私域复购成交', desc: '通过案例展示、节日活动持续成交' },
      { title: '合伙人合作成交', desc: '学习项目操作，成为合伙人变现' },
    ],
    primaryCta: { label: '立即定制', href: '/shop' },
    secondaryCta: { label: '成为合伙人', href: '/partner-benefits' },
  },
  aiTools: {
    eyebrow: '核心能力',
    headline: 'AI赋能创作',
    tools: [{ title: 'AI对话', label: 'AI对话', desc: '多模态智能体，支持文本、图片、视频交互', href: '/chat' } as LinkItem, ...publicToolCards.map((tool) => ({ label: tool.title, desc: tool.desc, href: tool.href }))],
  },
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

export function isHomeContentSlug(value: string): value is HomeContentSlug {
  return (HOME_CONTENT_SLUGS as readonly string[]).includes(value);
}

export function parseHomepageBlockMetadata(slug: HomeContentSlug, metadata: unknown): ParseResult<any> {
  const result = blockSchemas[slug].safeParse(metadata);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  return { ok: true, value: result.data };
}

export function mergeHomepageBlocks(
  defaults: HomepageContent,
  blocks: Array<{ slug: string; metadata: unknown }>,
): HomepageContent {
  const next: HomepageContent = structuredClone(defaults);

  for (const block of blocks) {
    if (!isHomeContentSlug(block.slug)) {
      continue;
    }

    const parsed = parseHomepageBlockMetadata(block.slug, block.metadata);
    if (!parsed.ok) {
      continue;
    }

    if (block.slug === 'home.hero') next.hero = parsed.value;
    if (block.slug === 'home.nav') next.nav = parsed.value;
    if (block.slug === 'home.stone_intro') next.stoneIntro = parsed.value;
    if (block.slug === 'home.join_us') next.joinUs = parsed.value;
    if (block.slug === 'home.ai_tools') next.aiTools = parsed.value;
  }

  return next;
}
```

After implementation, fix the `aiTools.tools` default if TypeScript rejects the inline object. Use:

```ts
tools: [
  { label: 'AI对话', desc: '多模态智能体，支持文本、图片、视频交互', href: '/chat' },
  ...publicToolCards.map((tool) => ({ label: tool.title, desc: tool.desc, href: tool.href })),
],
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
pnpm exec tsx --test src/features/public/home-content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/public/home-content.ts src/features/public/home-content.test.ts src/features/public/home-data.ts
git commit -m "feat: define homepage content contract"
```

---

### Task 2: Content Repository Operations

**Files:**
- Modify: `src/server/repositories/content.ts`
- Create: `src/server/repositories/content.test.ts`

- [ ] **Step 1: Write failing pure repository tests**

Create `src/server/repositories/content.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/server/repositories/content.test.ts
```

Expected: FAIL because exported helpers do not exist.

- [ ] **Step 3: Implement pure helpers and repository mutations**

Modify `src/server/repositories/content.ts`:

```ts
import { desc, eq } from 'drizzle-orm';

import { AccountDomainError } from '@/server/auth/account-types';
import { db, schema } from '@/server/db';
import {
  defaultHomepageContent,
  isHomeContentSlug,
  mergeHomepageBlocks,
  parseHomepageBlockMetadata,
  type HomepageContent,
} from '@/features/public/home-content';
```

Add these exports after `summarizeBody`:

```ts
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
    throw new AccountDomainError('database_unavailable', 'Database connection is unavailable.', 503);
  }

  return db;
}

export function buildAdminContentMutationValues(input: AdminContentMutationInput) {
  if (!isHomeContentSlug(input.slug)) {
    throw new AccountDomainError(
      'validation_error',
      `Unsupported homepage content slug: ${input.slug}`,
      400,
    );
  }

  const parsed = parseHomepageBlockMetadata(input.slug, input.metadata);
  if (!parsed.ok) {
    throw new AccountDomainError(
      'validation_error',
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
  rows: Array<{ slug: string; status: string; publishedAt: Date | null; metadata: unknown }>,
) {
  return rows
    .filter((row) => row.status === 'published' && row.publishedAt)
    .map((row) => ({ slug: row.slug, metadata: row.metadata }));
}
```

Add repository operations near the end of the file:

```ts
export async function createAdminContent(input: AdminContentMutationInput) {
  const database = requireDb();
  const values = buildAdminContentMutationValues(input);
  const [content] = await database.insert(schema.contentAssets).values(values).returning();

  if (!content) {
    throw new AccountDomainError('content_write_failed', 'Content could not be created.', 500);
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
    throw new AccountDomainError('content_not_found', 'Content not found.', 404);
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
    throw new AccountDomainError('content_not_found', 'Content not found.', 404);
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
      metadata: schema.contentAssets.metadata,
    })
    .from(schema.contentAssets)
    .where(eq(schema.contentAssets.kind, 'page'));

  return mergeHomepageBlocks(defaultHomepageContent, mapPublishedHomepageRows(rows));
}
```

In `getAdminContent`, change actions to data-friendly labels or keep string labels until Task 4 replaces rendering:

```ts
actions: asset.status === 'published' ? ['Edit', 'Unpublish', 'Archive'] : ['Edit', 'Publish', 'Archive'],
```

- [ ] **Step 4: Run repository tests**

Run:

```bash
pnpm exec tsx --test src/features/public/home-content.test.ts src/server/repositories/content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/content.ts src/server/repositories/content.test.ts
git commit -m "feat: add content repository workflow"
```

---

### Task 3: Admin Content API Routes

**Files:**
- Create: `src/app/api/admin/content/route.ts`
- Create: `src/app/api/admin/content/[contentId]/route.ts`
- Create: `src/app/api/admin/content/[contentId]/publish/route.ts`
- Create: `src/app/api/admin/content/[contentId]/draft/route.ts`
- Create: `src/app/api/admin/content/[contentId]/archive/route.ts`
- Create: `src/app/api/admin/content/route.test.ts`

- [ ] **Step 1: Write failing parse tests**

Create `src/app/api/admin/content/route.test.ts`:

```ts
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
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/content/route.test.ts
```

Expected: FAIL because route files do not exist.

- [ ] **Step 3: Implement create route**

Create `src/app/api/admin/content/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { createAdminContent } from '@/server/repositories/content';
import { HOME_CONTENT_SLUGS } from '@/features/public/home-content';

const bodySchema = z.object({
  slug: z.enum(HOME_CONTENT_SLUGS),
  title: z.string().trim().min(1),
  body: z.string().trim().nullable().optional(),
  url: z.string().trim().nullable().optional(),
  metadata: z.unknown(),
});

export async function parseAdminContentBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const { rawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/content',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        parsedBody,
      },
      async () => {
        const content = await createAdminContent({ ...body, actorId: session.user.id });
        return NextResponse.json({ ok: true, content }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Content create request is invalid.',
            issues: error.issues,
          },
        },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
```

- [ ] **Step 4: Implement update and status routes**

Create `src/app/api/admin/content/[contentId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { updateAdminContent } from '@/server/repositories/content';
import { HOME_CONTENT_SLUGS } from '@/features/public/home-content';

const paramsSchema = z.object({ contentId: z.uuid() });
const bodySchema = z.object({
  slug: z.enum(HOME_CONTENT_SLUGS),
  title: z.string().trim().min(1),
  body: z.string().trim().nullable().optional(),
  url: z.string().trim().nullable().optional(),
  metadata: z.unknown(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ contentId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const { rawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/content/[contentId]',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        parsedBody,
      },
      async () => {
        const content = await updateAdminContent({
          contentId: params.contentId,
          ...body,
          actorId: session.user.id,
        });
        return NextResponse.json({ ok: true, content }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Content update request is invalid.',
            issues: error.issues,
          },
        },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
```

For each status route, create a small wrapper. Example for `publish/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { updateAdminContentStatus } from '@/server/repositories/content';

const paramsSchema = z.object({ contentId: z.uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ contentId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const { rawBody, body: parsedBody } = await readJsonBody(request);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/content/[contentId]/publish',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        parsedBody,
      },
      async () => {
        const content = await updateAdminContentStatus({
          contentId: params.contentId,
          action: 'publish',
        });
        return NextResponse.json({ ok: true, content }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'Content status request is invalid.', issues: error.issues } },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
```

Repeat for:

- `draft/route.ts` with `action: 'draft'` and operation `POST /api/admin/content/[contentId]/draft`
- `archive/route.ts` with `action: 'archive'` and operation `POST /api/admin/content/[contentId]/archive`

- [ ] **Step 5: Run API tests**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/content/route.test.ts src/features/public/home-content.test.ts src/server/repositories/content.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/content src/features/public/home-content.test.ts src/server/repositories/content.test.ts
git commit -m "feat: add admin content api routes"
```

---

### Task 4: Admin Content UI

**Files:**
- Create: `src/features/admin/admin-content-actions.tsx`
- Modify: `src/app/admin/(console)/content/page.tsx`
- Modify: `src/server/repositories/content.ts`

- [ ] **Step 1: Update admin row type with action-ready fields**

Modify `AdminContentRow` in `src/server/repositories/content.ts`:

```ts
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
```

When mapping records, include:

```ts
body: asset.body,
metadata: asset.metadata,
```

For seed rows, use `{}` metadata and current body summary content as body.

- [ ] **Step 2: Create client action component**

Create `src/features/admin/admin-content-actions.tsx`:

```tsx
'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import type { AdminContentRow } from '@/server/repositories/content';

type FormState = {
  slug: string;
  title: string;
  body: string;
  url: string;
  metadata: string;
};

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await adminApiRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : '后台内容操作失败。';
    throw new Error(message);
  }
}

function buildInitialState(content?: AdminContentRow): FormState {
  return {
    slug: content?.slug ?? 'home.hero',
    title: content?.title ?? '',
    body: content?.body ?? '',
    url: content?.mediaReference !== 'none' ? content?.mediaReference ?? '' : '',
    metadata: JSON.stringify(content?.metadata ?? {}, null, 2),
  };
}

function ContentDialog({
  content,
  trigger,
}: {
  content?: AdminContentRow;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(content));
  const [, startTransition] = useTransition();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      const metadata = JSON.parse(formState.metadata);
      await postJson(content ? `/api/admin/content/${content.id}` : '/api/admin/content', {
        slug: formState.slug,
        title: formState.title,
        body: formState.body || null,
        url: formState.url || null,
        metadata,
      });
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '后台内容操作失败。');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{content ? '编辑首页内容' : '新增首页内容'}</DialogTitle>
          <DialogDescription>metadata 使用结构化 JSON，发布前会在服务端校验。</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="content-slug">Slug</Label>
              <Input id="content-slug" value={formState.slug} onChange={(event) => setFormState((current) => ({ ...current, slug: event.target.value }))} disabled={pending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content-title">标题</Label>
              <Input id="content-title" value={formState.title} onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))} disabled={pending} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="content-url">媒体引用</Label>
            <Input id="content-url" value={formState.url} onChange={(event) => setFormState((current) => ({ ...current, url: event.target.value }))} disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content-body">正文摘要</Label>
            <Textarea id="content-body" value={formState.body} onChange={(event) => setFormState((current) => ({ ...current, body: event.target.value }))} disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content-metadata">Metadata JSON</Label>
            <Textarea id="content-metadata" className="min-h-64 font-mono text-xs" value={formState.metadata} onChange={(event) => setFormState((current) => ({ ...current, metadata: event.target.value }))} disabled={pending} />
          </div>
          {message ? <p className="text-sm text-red-700">{message}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>取消</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存草稿</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateAdminContentDialog() {
  return (
    <ContentDialog
      trigger={
        <Button type="button" className="h-9 rounded-md">
          <Plus className="h-4 w-4" />
          新增内容
        </Button>
      }
    />
  );
}

export function AdminContentActions({ content }: { content: AdminContentRow }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function runStatusAction(action: 'publish' | 'draft' | 'archive') {
    setPendingAction(action);
    try {
      await postJson(`/api/admin/content/${content.id}/${action}`, {});
      startTransition(() => router.refresh());
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <ContentDialog content={content} trigger={<Button type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-xs">编辑</Button>} />
      {content.status === 'published' ? (
        <Button type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-xs" disabled={pendingAction !== null} onClick={() => void runStatusAction('draft')}>
          {pendingAction === 'draft' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          下线
        </Button>
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-xs" disabled={pendingAction !== null} onClick={() => void runStatusAction('publish')}>
          {pendingAction === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          发布
        </Button>
      )}
      <Button type="button" size="sm" variant="destructive" className="h-7 rounded-md px-2 text-xs" disabled={pendingAction !== null} onClick={() => void runStatusAction('archive')}>
        {pendingAction === 'archive' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        归档
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Wire actions into admin page**

Modify `src/app/admin/(console)/content/page.tsx`:

```tsx
import {
  AdminContentActions,
  CreateAdminContentDialog,
} from '@/features/admin/admin-content-actions';
```

Remove `AdminActionBar` import and change action column:

```tsx
{
  key: 'actions',
  label: '操作',
  className: 'text-right',
  render: (content) => <AdminContentActions content={content} />,
},
```

Wrap the module page:

```tsx
return (
  <div className="space-y-4">
    <div className="flex justify-end">
      <CreateAdminContentDialog />
    </div>
    <AdminModulePage ... />
  </div>
);
```

- [ ] **Step 4: Run focused type/lint check**

Run:

```bash
pnpm exec eslint 'src/app/admin/(console)/content/page.tsx' src/features/admin/admin-content-actions.tsx src/server/repositories/content.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/admin/(console)/content/page.tsx' src/features/admin/admin-content-actions.tsx src/server/repositories/content.ts
git commit -m "feat: add admin content controls"
```

---

### Task 5: Public Homepage Server Loader

**Files:**
- Create: `src/features/public/home-page.tsx`
- Modify: `src/app/home/page.tsx`
- Modify: `src/server/repositories/content.ts`

- [ ] **Step 1: Move current client homepage to a feature component**

Copy the current full contents of `src/app/home/page.tsx` to `src/features/public/home-page.tsx`.

At the top of `src/features/public/home-page.tsx`, keep `'use client';` and add:

```ts
import type { HomepageContent } from '@/features/public/home-content';
```

Change the exported component signature from:

```tsx
export default function HomePage() {
```

to:

```tsx
export function HomePageClient({ content }: { content: HomepageContent }) {
```

- [ ] **Step 2: Replace static hero content with props**

Change `HeroSection` signature:

```tsx
function HeroSection({
  content,
  onStartCreate,
}: {
  content: HomepageContent['hero'];
  onStartCreate: () => void;
}) {
```

Replace hardcoded strings with:

```tsx
{content.eyebrow}
{content.headline}
{content.subheadline}
{content.body}
{content.primaryCta.label}
{content.secondaryCta.label}
```

Use `content.secondaryCta.href` for the secondary `<Link>`.

- [ ] **Step 3: Replace nav and section data with props**

Change `Navbar`:

```tsx
function Navbar({
  nav,
  onLoginClick,
}: {
  nav: HomepageContent['nav'];
  onLoginClick: () => void;
}) {
```

Replace `publicNavLinks`, `publicExploreLinks`, and `publicAiToolLinks` with `nav.publicNavLinks`, `nav.publicExploreLinks`, and `nav.publicAiToolLinks`.

Change `StoneIntroSection`, `JoinUsSection`, and `FeaturesSection` to accept their content slices:

```tsx
function StoneIntroSection({ content }: { content: HomepageContent['stoneIntro'] }) { ... }
function JoinUsSection({ content }: { content: HomepageContent['joinUs'] }) { ... }
function FeaturesSection({ content }: { content: HomepageContent['aiTools'] }) { ... }
```

Replace local arrays with `content.categories`, `content.features`, `content.process`, `content.advantages`, `content.platforms`, `content.methods`, and `content.tools`.

For process icon keys, create a local map:

```tsx
const processIconMap = { camera: Camera, check: Check, hammer: Hammer, star: Star, truck: Truck };
```

Render:

```tsx
const StepIcon = processIconMap[step.icon];
<StepIcon size={16} className="text-white" />
```

For platform icons, create a `renderPlatformIcon(icon, color)` helper using the existing SVG cases. Keep the same SVG markup but switch by icon key.

- [ ] **Step 4: Wire homepage client with content prop**

In `HomePageClient`, render:

```tsx
<Navbar nav={content.nav} onLoginClick={openLoginModal} />
<HeroSection content={content.hero} onStartCreate={() => setCreateModalOpen(true)} />
<StoneIntroSection content={content.stoneIntro} />
<JoinUsSection content={content.joinUs} />
<FeaturesSection content={content.aiTools} />
```

- [ ] **Step 5: Convert `src/app/home/page.tsx` to server wrapper**

Replace `src/app/home/page.tsx` with:

```tsx
import { HomePageClient } from '@/features/public/home-page';
import { getPublicHomepageContent } from '@/server/repositories/content';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const content = await getPublicHomepageContent();
  return <HomePageClient content={content} />;
}
```

- [ ] **Step 6: Run focused checks**

Run:

```bash
pnpm exec eslint src/app/home/page.tsx src/features/public/home-page.tsx src/features/public/home-content.ts src/server/repositories/content.ts
pnpm exec tsx --test src/features/public/home-content.test.ts src/server/repositories/content.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/home/page.tsx src/features/public/home-page.tsx src/features/public/home-content.ts src/server/repositories/content.ts src/features/public/home-content.test.ts src/server/repositories/content.test.ts
git commit -m "feat: render published homepage content"
```

---

### Task 6: Verification And OpenSpec Completion

**Files:**
- Modify: `openspec/changes/admin-content-homepage-closure/tasks.md`
- Create: `docs/superpowers/verification/2026-06-02-admin-content-homepage-closure-verification.md`

- [ ] **Step 1: Run all focused tests**

Run:

```bash
pnpm exec tsx --test \
  src/features/public/home-content.test.ts \
  src/server/repositories/content.test.ts \
  src/app/api/admin/content/route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run validation**

Run:

```bash
pnpm validate
```

Expected: PASS, or document exact unrelated blockers.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: PASS, or document exact unrelated blockers.

- [ ] **Step 4: Browser verification**

If local DB/admin auth is available, run:

```bash
pnpm dev
```

Verify:

- `/home` renders with static fallback before creating content.
- `/admin/content` shows real action buttons.
- Creating a valid `home.hero` draft does not alter `/home`.
- Publishing the draft updates `/home`.
- Moving the block back to draft restores fallback for that block.

If auth/database setup blocks this, record the exact blocker in the verification note.

- [ ] **Step 5: Write verification note**

Create `docs/superpowers/verification/2026-06-02-admin-content-homepage-closure-verification.md`:

```md
# Admin Content Homepage Closure Verification

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/features/public/home-content.test.ts src/server/repositories/content.test.ts src/app/api/admin/content/route.test.ts` |  |  |
| `pnpm validate` |  |  |
| `pnpm build` |  |  |

## Browser Verification

- `/home` fallback:
- `/admin/content` actions:
- Draft does not affect public homepage:
- Published content affects public homepage:
- Draft/archive removes public content:

## Invariants Checked

- Public reads use only `published` rows with `published_at`.
- Draft edits do not alter the public homepage.
- Invalid or unavailable content falls back to static defaults.
- Admin routes validate input before repository writes.

## Blockers

- None, or exact setup blocker.
```

- [ ] **Step 6: Mark OpenSpec tasks complete**

Update `openspec/changes/admin-content-homepage-closure/tasks.md` by checking completed items.

- [ ] **Step 7: Run OpenSpec validation**

Run:

```bash
openspec validate admin-content-homepage-closure --strict
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add openspec/changes/admin-content-homepage-closure/tasks.md docs/superpowers/verification/2026-06-02-admin-content-homepage-closure-verification.md
git commit -m "chore: verify admin content homepage closure"
```

---

## Final Verification Checklist

Run before handing off:

```bash
pnpm exec tsx --test \
  src/features/public/home-content.test.ts \
  src/server/repositories/content.test.ts \
  src/app/api/admin/content/route.test.ts
pnpm validate
pnpm build
openspec validate admin-content-homepage-closure --strict
```

Record browser verification or exact blockers in `docs/superpowers/verification/2026-06-02-admin-content-homepage-closure-verification.md`.

## Plan Self-Review

- Spec coverage: admin create/edit/publish/draft/archive is covered by Tasks 2-4; public published rendering and fallback are covered by Tasks 1, 2, and 5; verification is covered by Task 6.
- Placeholder scan: no `TBD`, `TODO`, or open implementation placeholders are intentionally left.
- Type consistency: supported slug names, `HomepageContent`, and repository helper names are consistent across tasks.
