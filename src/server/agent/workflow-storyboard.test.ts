import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorkflowStoryboardPrompt,
  formatWorkflowStoryboardCanonicalSize,
  resolveWorkflowStoryboardExecutionSize,
  renderStoryboardPromptTemplate,
  sanitizeWorkflowStoryboardRunInput,
} from './workflow-storyboard';

function storyboardConfig() {
  return {
    code: 'workflow-storyboard-template' as const,
    promptText: [
      '任务：严格按照模板执行。',
      '尺寸={{template_width}}x{{template_height}}',
      '布局={{template_columns}}x{{template_rows}}',
      '来源={{source_image_origin}}',
      '模型={{selected_image_model_id}}',
      '执行尺寸={{execution_size}}',
      '{{workflow_prompt}}',
    ].join('\n'),
    templateAsset: {
      storageProvider: 'tencent_cos' as const,
      bucket: 'bucket-a',
      region: 'ap-shanghai',
      objectKey: 'storyboard/template.png',
      mimeType: 'image/png',
      byteSize: 1024,
      width: 1086,
      height: 1448,
      originalFilename: 'template.png',
      uploadedAt: '2026-06-09T10:00:00.000Z',
    },
    layout: { width: 1086, height: 1448, columns: 4 as const, rows: 3 as const },
    updatedAt: '2026-06-09T10:00:00.000Z',
    updatedByUserId: 'admin-1',
  };
}

test('buildWorkflowStoryboardPrompt renders configured placeholders with runtime context', () => {
  const prompt = buildWorkflowStoryboardPrompt({
    capabilityConfig: storyboardConfig(),
    sourceImageOrigin: 'manual',
    selectedImageModelId: 'seed-model-image',
    workflowPrompt: '以图一为主图/底图',
  });

  assert.match(prompt, /1086x1448/);
  assert.match(prompt, /布局=4x3/);
  assert.match(prompt, /来源=manual/);
  assert.match(prompt, /模型=seed-model-image/);
  assert.match(prompt, /执行尺寸=1086x1448/);
  assert.match(prompt, /以图一为主图\/底图/);
});

test('buildWorkflowStoryboardPrompt can request a higher execution size while preserving the canonical layout ratio', () => {
  const prompt = buildWorkflowStoryboardPrompt({
    capabilityConfig: storyboardConfig(),
    sourceImageOrigin: 'manual',
    selectedImageModelId: 'doubao-storyboard-model',
    workflowPrompt: '以图一为主图/底图',
    executionSize: '2K',
  });

  assert.match(prompt, /1086x1448/);
  assert.match(prompt, /2K/);
});

test('renderStoryboardPromptTemplate preserves unknown placeholders and blanks missing known values', () => {
  const prompt = renderStoryboardPromptTemplate('A={{workflow_prompt}} B={{unknown_key}} C={{selected_image_model_id}}', {
    workflow_prompt: 'hello',
    selected_image_model_id: '',
  });

  assert.equal(prompt, 'A=hello B={{unknown_key}} C=');
});

test('resolveWorkflowStoryboardExecutionSize uses fixed 2K size for doubao-like providers', () => {
  assert.equal(
    resolveWorkflowStoryboardExecutionSize({
      providerCode: 'ark',
      providerName: 'Doubao',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'seededit-3-0-i2i',
    }, '1086x1448'),
    '2K',
  );
});

test('formatWorkflowStoryboardCanonicalSize uses configured template dimensions', () => {
  assert.equal(formatWorkflowStoryboardCanonicalSize(storyboardConfig()), '1086x1448');
});

test('sanitizeWorkflowStoryboardRunInput strips the source image data URL from durable input', () => {
  const sanitized = sanitizeWorkflowStoryboardRunInput({
    stage: 'storyboard',
    sourceImageOrigin: 'generated',
    sourceImageDataUrl: 'data:image/png;base64,UPLOAD',
    additionalImageDataUrls: ['data:image/png;base64,TEMPLATE'],
    extra: 'keep',
  });

  assert.deepEqual(sanitized, {
    stage: 'storyboard',
    sourceImageOrigin: 'generated',
    extra: 'keep',
  });
});
