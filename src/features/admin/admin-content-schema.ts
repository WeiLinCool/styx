import {
  defaultHomepageContent,
  type HomeContentSlug,
  type HomepageContent,
} from '@/features/public/home-content';

export type ContentField =
  | {
      kind: 'text' | 'textarea' | 'url' | 'color';
      path: string;
      label: string;
      help?: string;
    }
  | {
      kind: 'select';
      path: string;
      label: string;
      options: Array<{ label: string; value: string }>;
      help?: string;
    }
  | {
      kind: 'object';
      path: string;
      label: string;
      fields: ContentField[];
      help?: string;
    }
  | {
      kind: 'list';
      path: string;
      label: string;
      itemLabel: string;
      minItems?: number;
      maxItems?: number;
      fields: ContentField[];
      help?: string;
    };

export type ContentSchemaDefinition = {
  slug: HomeContentSlug;
  label: string;
  description: string;
  defaultTitle: string;
  defaultBody: string;
  metadata: Record<string, unknown>;
  fields: ContentField[];
};

export const contentSlugOptions: Array<{ label: string; value: HomeContentSlug; description: string }> = [
  { label: '首页首屏', value: 'home.hero', description: '标题、副标题、正文和两个 CTA。' },
  { label: '顶部导航', value: 'home.nav', description: '主导航、探索菜单和 AI 工具菜单。' },
  { label: '石头介绍', value: 'home.stone_intro', description: '产品说明、分类、卖点和流程。' },
  { label: '加入我们', value: 'home.join_us', description: '项目介绍、优势、平台和转化按钮。' },
  { label: 'AI 工具', value: 'home.ai_tools', description: '首页 AI 工具区标题和工具入口。' },
];

const linkFields: ContentField[] = [
  { kind: 'text', path: 'label', label: '按钮文案' },
  { kind: 'url', path: 'href', label: '跳转路径', help: '只支持站内路径，例如 /image-gen。' },
  { kind: 'textarea', path: 'desc', label: '描述', help: '可选，用于菜单或卡片说明。' },
];

const platformIconOptions = [
  'douyin',
  'shipinhao',
  'xiaohongshu',
  'kuaishou',
  'wechat',
  'community',
].map((value) => ({ label: value, value }));

const processIconOptions = ['camera', 'check', 'hammer', 'star', 'truck'].map((value) => ({
  label: value,
  value,
}));

export const contentSchemaRegistry: Record<HomeContentSlug, ContentSchemaDefinition> = {
  'home.hero': {
    slug: 'home.hero',
    label: '首页首屏',
    description: '控制 /home 首屏展示内容和主要转化入口。',
    defaultTitle: '首页首屏内容',
    defaultBody: defaultHomepageContent.hero.body,
    metadata: defaultHomepageContent.hero,
    fields: [
      { kind: 'text', path: 'eyebrow', label: '眉标' },
      { kind: 'text', path: 'headline', label: '主标题' },
      { kind: 'text', path: 'subheadline', label: '副标题' },
      { kind: 'textarea', path: 'body', label: '正文' },
      { kind: 'object', path: 'primaryCta', label: '主按钮', fields: linkFields },
      { kind: 'object', path: 'secondaryCta', label: '次按钮', fields: linkFields },
    ],
  },
  'home.nav': {
    slug: 'home.nav',
    label: '顶部导航',
    description: '控制 /home 顶部导航和下拉菜单入口。',
    defaultTitle: '首页导航内容',
    defaultBody: '首页顶部导航、探索菜单和 AI 工具菜单。',
    metadata: defaultHomepageContent.nav,
    fields: [
      {
        kind: 'list',
        path: 'publicNavLinks',
        label: '主导航',
        itemLabel: '导航项',
        minItems: 1,
        maxItems: 12,
        fields: linkFields,
      },
      {
        kind: 'list',
        path: 'publicExploreLinks',
        label: '探索菜单',
        itemLabel: '菜单项',
        minItems: 1,
        maxItems: 12,
        fields: linkFields,
      },
      {
        kind: 'list',
        path: 'publicAiToolLinks',
        label: 'AI 工具菜单',
        itemLabel: '工具项',
        minItems: 1,
        maxItems: 12,
        fields: linkFields,
      },
    ],
  },
  'home.stone_intro': {
    slug: 'home.stone_intro',
    label: '石头介绍',
    description: '控制 /home 石头印画介绍区、分类、卖点和制作流程。',
    defaultTitle: '石头介绍内容',
    defaultBody: defaultHomepageContent.stoneIntro.body,
    metadata: defaultHomepageContent.stoneIntro,
    fields: [
      { kind: 'text', path: 'eyebrow', label: '眉标' },
      { kind: 'text', path: 'headline', label: '标题' },
      { kind: 'textarea', path: 'body', label: '正文' },
      {
        kind: 'list',
        path: 'categories',
        label: '应用分类',
        itemLabel: '分类',
        minItems: 1,
        maxItems: 8,
        fields: [
          { kind: 'url', path: 'image', label: '图片路径' },
          { kind: 'text', path: 'title', label: '标题' },
          { kind: 'textarea', path: 'desc', label: '描述' },
        ],
      },
      {
        kind: 'list',
        path: 'features',
        label: '核心卖点',
        itemLabel: '卖点',
        minItems: 1,
        maxItems: 12,
        fields: [{ kind: 'text', path: '', label: '内容' }],
      },
      {
        kind: 'list',
        path: 'process',
        label: '制作流程',
        itemLabel: '步骤',
        minItems: 1,
        maxItems: 8,
        fields: [
          { kind: 'text', path: 'step', label: '编号' },
          { kind: 'select', path: 'icon', label: '图标', options: processIconOptions },
          { kind: 'text', path: 'title', label: '标题' },
          { kind: 'textarea', path: 'desc', label: '描述' },
        ],
      },
    ],
  },
  'home.join_us': {
    slug: 'home.join_us',
    label: '加入我们',
    description: '控制 /home 加入我们区块的项目说明、优势、平台和转化按钮。',
    defaultTitle: '加入我们内容',
    defaultBody: defaultHomepageContent.joinUs.body,
    metadata: defaultHomepageContent.joinUs,
    fields: [
      { kind: 'text', path: 'eyebrow', label: '眉标' },
      { kind: 'text', path: 'headline', label: '标题' },
      { kind: 'textarea', path: 'body', label: '正文' },
      {
        kind: 'list',
        path: 'advantages',
        label: '项目优势',
        itemLabel: '优势',
        minItems: 1,
        maxItems: 10,
        fields: [
          { kind: 'text', path: 'title', label: '标题' },
          { kind: 'textarea', path: 'desc', label: '描述' },
        ],
      },
      {
        kind: 'list',
        path: 'platforms',
        label: '获客平台',
        itemLabel: '平台',
        minItems: 1,
        maxItems: 8,
        fields: [
          { kind: 'text', path: 'name', label: '名称' },
          { kind: 'color', path: 'color', label: '颜色' },
          { kind: 'select', path: 'icon', label: '图标', options: platformIconOptions },
        ],
      },
      {
        kind: 'list',
        path: 'methods',
        label: '成交方式',
        itemLabel: '方式',
        minItems: 1,
        maxItems: 8,
        fields: [
          { kind: 'text', path: 'title', label: '标题' },
          { kind: 'textarea', path: 'desc', label: '描述' },
        ],
      },
      { kind: 'object', path: 'primaryCta', label: '主按钮', fields: linkFields },
      { kind: 'object', path: 'secondaryCta', label: '次按钮', fields: linkFields },
    ],
  },
  'home.ai_tools': {
    slug: 'home.ai_tools',
    label: 'AI 工具',
    description: '控制 /home AI 工具区标题和工具入口。',
    defaultTitle: 'AI 工具内容',
    defaultBody: '首页 AI 工具区标题和工具入口。',
    metadata: defaultHomepageContent.aiTools,
    fields: [
      { kind: 'text', path: 'eyebrow', label: '眉标' },
      { kind: 'text', path: 'headline', label: '标题' },
      {
        kind: 'list',
        path: 'tools',
        label: '工具入口',
        itemLabel: '工具',
        minItems: 1,
        maxItems: 8,
        fields: linkFields,
      },
    ],
  },
};

export function isRegisteredContentSlug(value: string): value is HomeContentSlug {
  return Object.prototype.hasOwnProperty.call(contentSchemaRegistry, value);
}

export function getContentSchema(slug: string) {
  return isRegisteredContentSlug(slug) ? contentSchemaRegistry[slug] : contentSchemaRegistry['home.hero'];
}

export function cloneContentMetadata(metadata: Record<string, unknown>) {
  return structuredClone(metadata);
}

export function getDefaultContentMetadata(slug: string): Record<string, unknown> {
  return cloneContentMetadata(getContentSchema(slug).metadata);
}

export function getDefaultContentBody(slug: string) {
  return getContentSchema(slug).defaultBody;
}

export function getDefaultContentTitle(slug: string) {
  return getContentSchema(slug).defaultTitle;
}

