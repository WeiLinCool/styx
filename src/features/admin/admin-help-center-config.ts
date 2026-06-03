import {
  ADMIN_NAV_ITEMS,
  getAdminNavItemByHref,
  type AdminNavItem,
} from './admin-nav-config';

type AdminHelpCenterModuleConfig = {
  navHref: string;
  role: string;
  relatedFrontend: string[];
  upstream: string[];
  downstream: string[];
  actions: string[];
};

export type AdminHelpCenterGroup = {
  id: string;
  title: string;
  description: string;
  modules: AdminHelpCenterModuleConfig[];
};

export type AdminHelpCenterLayer = {
  id: string;
  title: string;
  description: string;
  bullets: string[];
};

export type AdminHelpCenterRelationship = {
  title: string;
  description: string;
};

export const ADMIN_HELP_CENTER_LAYERS: AdminHelpCenterLayer[] = [
  {
    id: 'frontend',
    title: '前台用户侧',
    description: '用户直接看到和操作的页面、权益入口与 AI 功能。',
    bullets: ['首页与内容展示', '会员与权益触点', 'AI 对话 / 生图 / 视频', '用户中心'],
  },
  {
    id: 'admin',
    title: '管理端运营侧',
    description: '运营和客服处理业务状态、配置规则与内容发布的控制台。',
    bullets: ['账号与订单处理', '会员方案与权限绑定', '内容与合作配置', 'AI 任务审核'],
  },
  {
    id: 'agent',
    title: 'Agent / 能力编排侧',
    description: '决定模型、Skill、Plugin、MCP 等能力如何被用户侧功能实际调用。',
    bullets: ['Agent 能力开关', '模型供给与默认项', '任务运行方式', '能力组合边界'],
  },
  {
    id: 'data',
    title: '数据与规则侧',
    description: '数据库、权限绑定、发布态和状态机共同组成最终事实来源。',
    bullets: ['订单与工单状态', '内容发布态', '权限与会员快照', '配置持久化'],
  },
];

export const ADMIN_HELP_CENTER_RELATIONSHIPS: AdminHelpCenterRelationship[] = [
  {
    title: '会员 / 权限 / 权益 -> 用户可见和可用范围',
    description: '会员方案定义商业层级，权限决定能否访问，权益决定使用额度与功能上限。',
  },
  {
    title: 'AI 模型 / Agent 能力 -> AI 功能实际供给',
    description: '模型配置决定上游供给，Agent 能力决定运行时可调度能力，两者共同影响前台 AI 体验。',
  },
  {
    title: '内容 / 合作 / 订单 / 用户 -> 运营处理闭环',
    description: '内容和合作决定展示触点，订单和用户状态决定运营动作，最终反映到用户触达和服务结果。',
  },
];

export const ADMIN_HELP_CENTER_GROUPS: AdminHelpCenterGroup[] = [
  {
    id: 'operations',
    title: '运营与账户',
    description: '围绕账号生命周期、会员方案、权限绑定和订单处理的后台协作。',
    modules: [
      {
        navHref: '/admin',
        role: '查看核心运营指标，快速判断账号、订单、任务与内容的整体状态。',
        relatedFrontend: ['首页转化', '用户整体体验'],
        upstream: ['用户行为', '订单流转', 'AI 任务处理'],
        downstream: ['异常排查优先级', '运营关注重点'],
        actions: ['查看概览', '识别异常', '分配处理方向'],
      },
      {
        navHref: '/admin/users',
        role: '管理账号状态、激活工单和客服处理入口。',
        relatedFrontend: ['登录与账号访问', '用户中心'],
        upstream: ['订单状态', '会员方案', '权限绑定'],
        downstream: ['账号可登录状态', '工单处理结果'],
        actions: ['处理激活', '查看账号状态', '跟进客服工单'],
      },
      {
        navHref: '/admin/memberships',
        role: '维护会员方案版本、价格与历史规则。',
        relatedFrontend: ['会员页面', '用户中心', '权益展示'],
        upstream: ['商业策略', '权限方案', '权益组合'],
        downstream: ['续费规则', '会员展示内容', '有效期内历史快照'],
        actions: ['编辑方案', '发布版本', '查看历史'],
      },
      {
        navHref: '/admin/permissions',
        role: '定义会员方案绑定的权限资源，控制页面和动作准入。',
        relatedFrontend: ['用户中心', '功能入口显隐'],
        upstream: ['会员方案', '资源定义'],
        downstream: ['前台功能准入', '会员升级差异'],
        actions: ['绑定权限', '核对资源', '检查方案差异'],
      },
      {
        navHref: '/admin/orders',
        role: '跟踪支付、开通、履约和人工处理状态。',
        relatedFrontend: ['会员开通', '购买结果', '订单记录'],
        upstream: ['支付结果', '会员方案', '用户申请'],
        downstream: ['账号激活', '会员状态更新', '客服处理动作'],
        actions: ['核对状态', '处理异常', '联动用户与会员'],
      },
    ],
  },
  {
    id: 'capability',
    title: '能力与供给',
    description: '解释用户能用什么、按什么规则用，以及背后的运行供给如何配置。',
    modules: [
      {
        navHref: '/admin/benefits',
        role: '维护会员权益、额度与服务边界。',
        relatedFrontend: ['会员权益页', 'AI 使用额度', '用户中心'],
        upstream: ['会员方案', '商业定价'],
        downstream: ['额度展示', '功能可用范围', '扣费与消耗规则'],
        actions: ['配置权益', '检查额度', '核对方案差异'],
      },
      {
        navHref: '/admin/ai-jobs',
        role: '查看和处理 AI 任务执行结果、审核状态与异常。',
        relatedFrontend: ['对话结果', '生图结果', '视频结果'],
        upstream: ['用户提交任务', '模型配置', 'Agent 能力配置'],
        downstream: ['任务审核结果', '用户可见输出', '异常处理记录'],
        actions: ['审核任务', '处理异常', '查看执行状态'],
      },
      {
        navHref: '/admin/ai-models',
        role: '管理 AI 供应商、模型、默认项和价格映射。',
        relatedFrontend: ['模型选择', 'AI 生图 / 视频 / 对话入口'],
        upstream: ['供应商能力', '计费规则', '运营策略'],
        downstream: ['默认模型', '成本映射', '前台可选能力'],
        actions: ['启停模型', '设置默认', '检查价格'],
      },
      {
        navHref: '/admin/agent-capabilities',
        role: '定义 Agent 运行时可用的 Skill、Plugin、MCP 服务与组合能力。',
        relatedFrontend: ['Agent 调用体验', '多能力协同功能'],
        upstream: ['模型供给', '能力清单', '运行时策略'],
        downstream: ['任务执行路径', '工具可用性', '前台智能能力边界'],
        actions: ['启停能力', '核对配置', '查看组合摘要'],
      },
    ],
  },
  {
    id: 'content',
    title: '内容与合作',
    description: '说明前台展示触点、合作信息和活动内容如何由后台配置管理。',
    modules: [
      {
        navHref: '/admin/content',
        role: '维护首页、导航、模块区块和前台说明文案。',
        relatedFrontend: ['首页', '活动位', '功能引导文案'],
        upstream: ['运营节奏', '品牌内容', '合作信息'],
        downstream: ['前台内容展示', '入口跳转', '活动触达效果'],
        actions: ['编辑内容', '发布变更', '校对区块'],
      },
      {
        navHref: '/admin/partners',
        role: '管理合作方、合作权益与对外协同信息。',
        relatedFrontend: ['合作展示', '权益说明', '品牌联动触点'],
        upstream: ['商务合作', '内容规划'],
        downstream: ['合作信息展示', '联动资源配置'],
        actions: ['维护合作信息', '核对权益', '同步展示内容'],
      },
    ],
  },
  {
    id: 'infrastructure',
    title: '基础设施与持久化',
    description: '明确哪些后台动作是在改配置，哪些是在处理业务状态，哪些依赖持久化和审计。',
    modules: [
      {
        navHref: '/admin/settings',
        role: '承载角色访问、Provider 配置、存储与审计入口等基础设置。',
        relatedFrontend: ['系统稳定性', '基础配置可用性'],
        upstream: ['环境配置', '平台策略'],
        downstream: ['运行配置生效', '权限边界', '审计入口'],
        actions: ['检查配置', '核对访问', '查看审计入口'],
      },
      {
        navHref: '/admin/help-center',
        role: '汇总后台、前台、Agent 与数据层之间的关系，作为统一知识入口。',
        relatedFrontend: ['无直接用户侧页面，服务于后台理解'],
        upstream: ['真实路由', '业务模块边界'],
        downstream: ['运营协作效率', '新人上手速度'],
        actions: ['查看关系图', '跳转模块', '理解关键链路'],
      },
    ],
  },
];

export type AdminHelpCenterResolvedModule = AdminHelpCenterModuleConfig & {
  navItem: AdminNavItem;
};

export function getAdminHelpCenterGroups(): Array<
  Omit<AdminHelpCenterGroup, 'modules'> & { modules: AdminHelpCenterResolvedModule[] }
> {
  return ADMIN_HELP_CENTER_GROUPS.map((group) => ({
    ...group,
    modules: group.modules.map((module) => {
      const navItem = getAdminNavItemByHref(module.navHref);

      if (!navItem) {
        throw new Error(`Missing admin nav item for help center module: ${module.navHref}`);
      }

      return {
        ...module,
        navItem,
      };
    }),
  }));
}

export function getAdminHelpCenterQuickLinks() {
  const quickLinkHrefs = [
    '/admin/help-center',
    '/admin/users',
    '/admin/memberships',
    '/admin/ai-models',
    '/admin/content',
  ];

  return ADMIN_NAV_ITEMS.filter((item) => quickLinkHrefs.includes(item.href));
}

export function getAdminHelpCenterRelationshipCount() {
  return ADMIN_HELP_CENTER_RELATIONSHIPS.length;
}
