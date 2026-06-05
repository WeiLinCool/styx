import { adminText, formatAdminAiValue } from './admin-i18n';

const adminAiLabelMap: Record<string, string> = {
  all: adminText.ai.all,
  archived: adminText.status.archived,
  base_url: '接口地址',
  chat: '对话',
  completion: '输出',
  credential_environment_key: '凭据环境变量',
  credential_reference_configured: '凭据引用已配置',
  database: adminText.source.database,
  default: '默认',
  development: adminText.ai.development,
  development_provider_does_not_require_credentials: '开发模式供应商无需凭据',
  disabled: adminText.ai.disabled,
  enabled: adminText.ai.enabled,
  environment_variable_value: '环境变量值',
  free: '免费',
  fixed: '固定积分',
  image: adminText.ai.image,
  image_capabilities: '图像能力',
  invalid: adminText.ai.invalid,
  failed: adminText.status.failed,
  missing_reference: '缺少引用',
  needs_attention: adminText.ai.needsAttention,
  not_configured: adminText.ai.notConfigured,
  not_required: adminText.ai.notRequired,
  openai_compatible: 'OpenAI 兼容模式',
  chat_openai_compatible: '对话 / OpenAI 兼容',
  image_openai_compatible: '图像 / OpenAI 兼容',
  video_task_polling: '视频 / 任务轮询',
  per_image: '按图片张数',
  pending: adminText.status.pending,
  prompt: adminText.ai.prompt,
  provider_usage_tokens: '按上游 token',
  seed: adminText.source.seed,
  succeeded: adminText.status.succeeded,
  supports_chat: adminText.ai.supportsChat,
  supports_video: adminText.ai.supportsVideo,
  token_breakdown: '按 token 明细',
  unknown: '未知',
  valid: adminText.ai.valid,
  video: adminText.ai.video,
  video_seconds: '按视频秒数',
  archived_status: adminText.status.archived,
  succeeded_status: adminText.status.succeeded,
  processing_status: adminText.status.processing,
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

  return formatAdminAiValue(normalized);
}
