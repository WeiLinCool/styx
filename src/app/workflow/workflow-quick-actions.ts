export function buildPromptOptimizationPrompt(currentPrompt: string) {
  return [
    '请将下面这段 AI 视频工作流提示词优化为更清晰、更具体、更适合生成石头印画风格视频的版本。',
    '只返回优化后的提示词正文，不要加解释。',
    '',
    currentPrompt.trim(),
  ].join('\n');
}

export function readPromptOptimizationMessage(input: { finalMessage: string | null }) {
  const message = input.finalMessage?.trim() ?? '';
  return message.length > 0 ? message : null;
}

export function createReferenceImageDialogState(step: number) {
  if (step < 2) {
    return {
      disabled: true,
      message: '完成分镜后可生成参考图',
    };
  }

  return {
    disabled: false,
    message: null,
  };
}
