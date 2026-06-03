const adminAiLabelMap: Record<string, string> = {
  all: '全部',
  archived: '已归档',
  base_url: '接口地址',
  chat: '对话',
  completion: '输出',
  credential_environment_key: '凭据环境变量',
  credential_reference_configured: '凭据引用已配置',
  database: '数据库',
  default: '默认',
  development: '开发模式',
  development_provider_does_not_require_credentials: '开发模式供应商无需凭据',
  disabled: '已停用',
  enabled: '已启用',
  environment_variable_value: '环境变量值',
  free: '免费',
  fixed: '固定积分',
  image: '图像',
  image_capabilities: '图像能力',
  invalid: '无效',
  failed: '失败',
  missing_reference: '缺少引用',
  needs_attention: '需要处理',
  not_configured: '未配置',
  not_required: '无需凭据',
  openai_compatible: 'OpenAI 兼容',
  per_image: '按图片张数',
  pending: '处理中',
  prompt: '输入',
  provider_usage_tokens: '按上游 token',
  seed: '种子数据',
  succeeded: '成功',
  supports_chat: '支持对话',
  supports_video: '支持视频',
  token_breakdown: '按 token 明细',
  unknown: '未知',
  valid: '有效',
  video: '视频',
  video_seconds: '按视频秒数',
};

export function formatAdminAiLabel(value: string) {
  return adminAiLabelMap[value] ?? value;
}

export function formatAdminAiText(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const normalized = value.trim();
  const directKey = normalized.toLowerCase().replaceAll(' ', '_');
  const directLabel = adminAiLabelMap[directKey];
  if (directLabel) {
    return directLabel;
  }

  const creditMinimumMatch = normalized.match(/^(\d+(?:\.\d+)?) credits? minimum$/i);
  if (creditMinimumMatch) {
    return `最低扣费 ${creditMinimumMatch[1]} 积分`;
  }

  return normalized
    .replace(/\bFree\b/g, '免费')
    .replace(/\bPro\b/g, '专业版')
    .replace(/\bcredits?\b/g, '积分')
    .replace(/\bminimum\b/g, '最低')
    .replace(/\bprompt\b/g, '输入')
    .replace(/\bcompletion\b/g, '输出')
    .replace(/\benabled\b/g, '已启用')
    .replace(/\bvalid\b/g, '有效')
    .replace(/\bneeds attention\b/g, '需要处理')
    .replace(/\bsupports_chat\b/g, '支持对话')
    .replace(/\bsupports_video\b/g, '支持视频')
    .replace(/\bimage capabilities\b/g, '图像能力')
    .replace(/\bmissing base URL\b/g, '缺少接口地址')
    .replace(/\bmissing credential environment key\b/g, '缺少凭据环境变量')
    .replace(/\bmissing environment variable value\b/g, '缺少环境变量值')
    .replace(/\bmissing reference\b/g, '缺少引用')
    .replace(/\bcredential reference configured\b/g, '凭据引用已配置')
    .replace(/\bdevelopment provider does not require credentials\b/g, '开发模式供应商无需凭据')
    .replace(/\bnot configured\b/g, '未配置')
    .replace(/\bnot required\b/g, '无需凭据');
}
