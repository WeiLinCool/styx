import type { AdminDataSource, AdminMetricTone } from '@/server/repositories/admin-shared';
import type { DashboardTone } from '@/server/repositories/admin-dashboard';
import type { AdminWorkOrderQueueStatus } from '@/server/repositories/admin-activation-work-orders';

export const adminText = {
  common: {
    loading: '加载中...',
    saving: '保存中...',
    submitting: '提交中...',
    search: '搜索',
    clear: '清空',
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    empty: '暂无数据',
    noRecords: '暂无记录',
    actionFailed: '后台操作失败。',
    loadFailed: '加载失败。',
    validationFailed: '请求参数无效。',
  },
  source: {
    database: '数据库',
    seed: '种子数据',
  } as Record<AdminDataSource, string>,
  adminRole: {
    owner: '所有者',
    admin: '管理员',
    operator: '运营',
    support: '客服',
    auditor: '审计',
  },
  status: {
    active: '已激活',
    pending_activation: '待激活',
    suspended: '已停用',
    archived: '已归档',
    approved: '已通过',
    rejected: '已拒绝',
    processing: '处理中',
    paid: '已支付',
    fulfilled: '已履约',
    pending: '待处理',
    cancelled: '已取消',
    refunded: '已退款',
    queued: '排队中',
    running: '进行中',
    succeeded: '已完成',
    failed: '失败',
    new: '新建',
    contacted: '已联系',
    qualified: '已达标',
    converted: '已转化',
    closed: '已关闭',
    enabled: '已启用',
    disabled: '已停用',
    archived_status: '已归档',
    all: '全部',
  },
  tone: {
    default: '默认',
    success: '成功',
    warning: '警告',
    danger: '危险',
    info: '信息',
  } as Record<AdminMetricTone | DashboardTone, string>,
  queue: {
    pending: '待处理',
    processing: '处理中',
    closed: '已办结',
    archived: '已归档',
  } as Record<AdminWorkOrderQueueStatus, string>,
  ai: {
    all: '全部',
    prompt: '输入',
    completion: '输出',
    supportsChat: '支持对话',
    supportsVideo: '支持视频',
    image: '图像',
    video: '视频',
    development: '开发模式',
    database: '数据库',
    seed: '种子数据',
    enabled: '已启用',
    disabled: '已停用',
    archived: '已归档',
    invalid: '无效',
    valid: '有效',
    notConfigured: '未配置',
    needsAttention: '需要处理',
    notRequired: '无需凭据',
  },
  api: {
    aiModelTestInvalid: 'AI 模型测试请求无效。',
    membershipDraftInvalid: '会员方案草稿请求无效。',
    membershipScheduleInvalid: '会员方案排期请求无效。',
    subscriptionApproveInvalid: '订阅工单通过请求无效。',
    subscriptionRejectInvalid: '订阅工单拒绝请求无效。',
    subscriptionArchiveInvalid: '订阅工单归档请求无效。',
    subscriptionProcessingInvalid: '订阅工单处理中请求无效。',
    aiProviderCreateInvalid: 'AI 提供方创建请求无效。',
    aiProviderUpdateInvalid: 'AI 提供方更新请求无效。',
    aiProviderStatusInvalid: 'AI 提供方状态请求无效。',
    aiProviderTestInvalid: 'AI 提供方测试请求无效。',
    aiModelCreateInvalid: 'AI 模型创建请求无效。',
    aiModelUpdateInvalid: 'AI 模型更新请求无效。',
    aiModelDefaultInvalid: 'AI 模型默认项请求无效。',
    contentCreateInvalid: '内容创建请求无效。',
    contentUpdateInvalid: '内容更新请求无效。',
    contentStatusInvalid: '内容状态请求无效。',
    userActivateInvalid: '用户激活请求无效。',
    userActivationInvalid: '重新发放激活请求无效。',
    userPointsInvalid: '用户积分调整请求无效。',
    userSuspendInvalid: '用户停用请求无效。',
    membershipMediaPolicyInvalid: '会员媒体策略请求无效。',
    orderStatusInvalid: '订单状态请求无效。',
    agentCapabilityStatusInvalid: 'Agent 能力状态请求无效。',
    agentCapabilityStoryboardConfigInvalid: '工作流分镜模板配置请求无效。',
    aiJobReviewInvalid: 'AI 任务复核请求无效。',
    permissionUpdateInvalid: '权限方案更新请求无效。',
    billingRulesInvalid: '计费规则无效。',
    mediaAssetAccessInvalid: '媒体资产访问请求无效。',
    mediaAssetNotFound: '已保存的媒体资产未找到。',
    contentDraftInvalid: '内容草稿请求无效。',
    contentPublishInvalid: '内容发布请求无效。',
    contentArchiveInvalid: '内容归档请求无效。',
    aiModelStatusInvalid: 'AI 模型状态请求无效。',
    adminLoginInvalid: '管理端登录请求无效。',
    permissionSaveFailed: '保存权限绑定失败。',
    loadWorkspaceFailed: '加载工作台失败。',
  },
  action: {
    more: '更多操作',
    saveSuccess: '保存成功。',
    submitSuccess: '提交成功。',
    delete: '删除',
    edit: '编辑',
    add: '添加',
    remove: '移除',
  },
} as const;

export function formatAdminSource(value: AdminDataSource) {
  return adminText.source[value];
}

export function formatAdminRole(role: string) {
  return adminText.adminRole[role as keyof typeof adminText.adminRole] ?? role;
}

export function formatAdminStatus(value: string) {
  return adminText.status[value as keyof typeof adminText.status] ?? value;
}

export function formatAdminQueueStatus(value: AdminWorkOrderQueueStatus) {
  return adminText.queue[value];
}

export function formatAdminAiValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const normalized = value.trim();
  const direct = adminText.ai[normalized as keyof typeof adminText.ai];
  if (direct) {
    return direct;
  }

  return normalized
    .replace(/\bAI\b/g, 'AI')
    .replace(/\bAgent\b/g, 'Agent')
    .replace(/\bmodel\b/gi, '模型')
    .replace(/\bprovider\b/gi, '供应商')
    .replace(/\bstatus\b/gi, '状态')
    .replace(/\benabled\b/gi, '已启用')
    .replace(/\bdisabled\b/gi, '已停用')
    .replace(/\barchived\b/gi, '已归档')
    .replace(/\bvalid\b/gi, '有效')
    .replace(/\binvalid\b/gi, '无效')
    .replace(/\bnot configured\b/gi, '未配置')
    .replace(/\bneeds attention\b/gi, '需要处理')
    .replace(/\bnot required\b/gi, '无需凭据');
}
