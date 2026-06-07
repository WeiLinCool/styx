import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPromptOptimizationPrompt,
  createReferenceImageDialogState,
  readPromptOptimizationMessage,
} from './workflow-quick-actions';

test('buildPromptOptimizationPrompt wraps the current workflow prompt in assistant instructions', () => {
  assert.match(
    buildPromptOptimizationPrompt('石头印画风格'),
    /请将下面这段 AI 视频工作流提示词优化为更清晰/,
  );
  assert.match(buildPromptOptimizationPrompt('石头印画风格'), /石头印画风格/);
});

test('buildPromptOptimizationPrompt preserves the original workflow prompt text', () => {
  const prompt = '保留原始构图';
  assert.match(buildPromptOptimizationPrompt(prompt), /保留原始构图/);
});

test('readPromptOptimizationMessage trims assistant output and falls back to null for empty runs', () => {
  assert.equal(readPromptOptimizationMessage({ finalMessage: '  优化后的提示词  ' }), '优化后的提示词');
  assert.equal(readPromptOptimizationMessage({ finalMessage: '   ' }), null);
});

test('createReferenceImageDialogState blocks use before the scene step and enables use on steps two and three', () => {
  assert.deepEqual(createReferenceImageDialogState(1), {
    disabled: true,
    message: '完成分镜后可生成参考图',
  });
  assert.deepEqual(createReferenceImageDialogState(2), {
    disabled: false,
    message: null,
  });
  assert.deepEqual(createReferenceImageDialogState(3), {
    disabled: false,
    message: null,
  });
});
