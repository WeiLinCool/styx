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
    process: Array<{
      step: string;
      icon: 'camera' | 'check' | 'hammer' | 'star' | 'truck';
      title: string;
      desc: string;
    }>;
  };
  joinUs: {
    eyebrow: string;
    headline: string;
    body: string;
    advantages: Array<{ title: string; desc: string }>;
    platforms: Array<{
      name: string;
      color: string;
      icon: 'douyin' | 'shipinhao' | 'xiaohongshu' | 'kuaishou' | 'wechat' | 'community';
    }>;
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
    tools: [
      { label: 'AI对话', desc: '多模态智能体，支持文本、图片、视频交互', href: '/chat' },
      ...publicToolCards.map((tool) => ({
        label: tool.title,
        desc: tool.desc,
        href: tool.href,
      })),
    ],
  },
};

type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };
type HomepageBlockValue = HomepageContent[keyof HomepageContent];

export function isHomeContentSlug(value: string): value is HomeContentSlug {
  return (HOME_CONTENT_SLUGS as readonly string[]).includes(value);
}

export function parseHomepageBlockMetadata(
  slug: HomeContentSlug,
  metadata: unknown,
): ParseResult<HomepageBlockValue> {
  const result = blockSchemas[slug].safeParse(metadata);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    };
  }

  return { ok: true, value: result.data as HomepageBlockValue };
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

    if (block.slug === 'home.hero') {
      next.hero = parsed.value;
    }
    if (block.slug === 'home.nav') {
      next.nav = parsed.value;
    }
    if (block.slug === 'home.stone_intro') {
      next.stoneIntro = parsed.value;
    }
    if (block.slug === 'home.join_us') {
      next.joinUs = parsed.value;
    }
    if (block.slug === 'home.ai_tools') {
      next.aiTools = parsed.value;
    }
  }

  return next;
}
