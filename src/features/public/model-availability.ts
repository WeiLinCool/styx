export type SelectableModel = {
  id: string;
  isDefault: boolean;
};

export type ModelAvailabilityStatus =
  | 'unauthenticated'
  | 'loading'
  | 'ready'
  | 'maintenance';

export type ModelAvailabilityState = {
  status: ModelAvailabilityStatus;
  message: string | null;
  reloadKey: number;
};

export function buildUnavailableModelMessage() {
  return '功能不可用，正在维护';
}

export function createInitialModelAvailabilityState(): ModelAvailabilityState {
  return {
    status: 'unauthenticated',
    message: '登录后查看可用模型',
    reloadKey: 0,
  };
}

export function reconcileSelectedModelId<T extends SelectableModel>(
  models: T[],
  priorModelId?: string | null,
) {
  if (priorModelId && models.some((model) => model.id === priorModelId)) {
    return priorModelId;
  }

  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

export function nextReloadKey(current: number) {
  return current + 1;
}
