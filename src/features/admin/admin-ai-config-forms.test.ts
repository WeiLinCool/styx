import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAdminAiLabel,
  providerBillingRulesFromFormValues,
  providerBillingRulesToFormValues,
} from './admin-ai-config-forms';

test('provider billing rules form values round-trip configured rules', () => {
  const formValues = providerBillingRulesToFormValues({
    chat: {
      mode: 'token_breakdown',
      inputCreditsPer1k: 2,
      cachedInputCreditsPer1k: 0.5,
      cacheMissInputCreditsPer1k: 2,
      outputCreditsPer1k: 8,
      minimumCredits: 1,
    },
    image: {
      mode: 'per_image',
      imageCredits: 4,
      minimumCredits: 1,
    },
    video: {
      mode: 'video_seconds',
      secondsCredits: 3,
      resolutionMultipliers: { '720p': 1, '1080p': 2 },
      minimumCredits: 3,
    },
  });

  assert.equal(formValues.billingChatEnabled, true);
  assert.equal(formValues.billingImageMode, 'per_image');
  assert.equal(formValues.billingVideoResolutionMultipliersJson, '{\n  "720p": 1,\n  "1080p": 2\n}');
  assert.deepEqual(providerBillingRulesFromFormValues(formValues), {
    chat: {
      mode: 'token_breakdown',
      inputCreditsPer1k: 2,
      cachedInputCreditsPer1k: 0.5,
      cacheMissInputCreditsPer1k: 2,
      outputCreditsPer1k: 8,
      minimumCredits: 1,
    },
    image: {
      mode: 'per_image',
      imageCredits: 4,
      minimumCredits: 1,
    },
    video: {
      mode: 'video_seconds',
      secondsCredits: 3,
      resolutionMultipliers: { '720p': 1, '1080p': 2 },
      minimumCredits: 3,
    },
  });
});

test('provider billing rules omit disabled sections', () => {
  assert.deepEqual(
    providerBillingRulesFromFormValues({
      ...providerBillingRulesToFormValues({}),
      billingChatEnabled: false,
      billingImageEnabled: false,
      billingVideoEnabled: false,
    }),
    {},
  );
});

test('admin ai labels translate common enum values', () => {
  assert.equal(formatAdminAiLabel('openai_compatible'), 'OpenAI 兼容模式');
  assert.equal(formatAdminAiLabel('development'), '开发模式');
  assert.equal(formatAdminAiLabel('enabled'), '已启用');
  assert.equal(formatAdminAiLabel('not_required'), '无需凭据');
  assert.equal(formatAdminAiLabel('provider_usage_tokens'), '按上游 token');
  assert.equal(formatAdminAiLabel('chat_openai_compatible'), '对话 / OpenAI 兼容');
  assert.equal(formatAdminAiLabel('image_openai_compatible'), '图像 / OpenAI 兼容');
  assert.equal(formatAdminAiLabel('video_task_polling'), '视频 / 任务轮询');
});
