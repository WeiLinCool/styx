export function formatChatModelLabel(modelName?: string | null) {
  if (!modelName) {
    return undefined;
  }

  return modelName;
}

export function formatChatUsageLabel(_usage?: unknown) {
  return undefined;
}
