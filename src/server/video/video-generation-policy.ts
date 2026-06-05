export type VideoStylePreset = {
  id: string;
  code: string;
  name: string;
  prompt: string;
  enabled: boolean;
  sortOrder: number;
};

export type VideoPlanConfig = {
  enabled: boolean;
  allowedDurations: number[];
  allowedResolutions: string[];
  defaultDuration: number;
  defaultResolution: string;
};

export type VideoGenerationPolicy = {
  enabled: boolean;
  upgradeRequired: boolean;
  message: string | null;
  styles: VideoStylePreset[];
  durations: number[];
  resolutions: Array<{ value: string; label: string }>;
  defaults: {
    styleCode: string | null;
    durationSeconds: number | null;
    resolution: string | null;
  };
};

export type VideoGenerationSelection = {
  styleCode: string;
  durationSeconds: number;
  resolution: string;
};

export type VideoGenerationSelectionValidationResult =
  | { ok: true; code: null; message: null }
  | {
      ok: false;
      code:
        | 'policy_disabled'
        | 'invalid_style'
        | 'invalid_duration'
        | 'invalid_resolution';
      message: string;
    };

type VideoGenerationEntitlement = {
  planCode: string | null;
  planVersionId: string | null;
};

const DISABLED_DEFAULTS: VideoGenerationPolicy['defaults'] = {
  styleCode: null,
  durationSeconds: null,
  resolution: null,
};

function createDisabledPolicy(input: {
  upgradeRequired: boolean;
  message: string | null;
  styles?: VideoStylePreset[];
}): VideoGenerationPolicy {
  return {
    enabled: false,
    upgradeRequired: input.upgradeRequired,
    message: input.message,
    styles: input.styles ?? [],
    durations: [],
    resolutions: [],
    defaults: DISABLED_DEFAULTS,
  };
}

function isValidDuration(duration: number) {
  return Number.isInteger(duration) && duration > 0;
}

function isValidResolution(resolution: string) {
  return resolution.trim().length > 0;
}

function normalizeResolutionLabel(resolution: string) {
  return resolution.toUpperCase();
}

function resolveEnabledStyles(styles: VideoStylePreset[]) {
  return styles
    .filter((style) => style.enabled)
    .toSorted((left, right) => left.sortOrder - right.sortOrder);
}

function isValidPlanConfig(planConfig: VideoPlanConfig) {
  return (
    planConfig.enabled &&
    planConfig.allowedDurations.length > 0 &&
    planConfig.allowedDurations.every(isValidDuration) &&
    planConfig.allowedDurations.includes(planConfig.defaultDuration) &&
    planConfig.allowedResolutions.length > 0 &&
    planConfig.allowedResolutions.every(isValidResolution) &&
    planConfig.allowedResolutions.includes(planConfig.defaultResolution)
  );
}

export function resolveVideoGenerationPolicy(input: {
  entitlement: VideoGenerationEntitlement | null;
  planConfig: VideoPlanConfig | null;
  styles: VideoStylePreset[];
}): VideoGenerationPolicy {
  const styles = resolveEnabledStyles(input.styles);

  if (!input.entitlement) {
    return createDisabledPolicy({
      upgradeRequired: true,
      message: 'Video generation requires an active membership.',
      styles,
    });
  }

  if (!input.planConfig) {
    return createDisabledPolicy({
      upgradeRequired: false,
      message: 'Video generation is not configured for this membership plan.',
      styles,
    });
  }

  if (!isValidPlanConfig(input.planConfig)) {
    return createDisabledPolicy({
      upgradeRequired: false,
      message: 'Video generation is not available for this membership plan.',
      styles,
    });
  }

  return {
    enabled: true,
    upgradeRequired: false,
    message: null,
    styles,
    durations: input.planConfig.allowedDurations,
    resolutions: input.planConfig.allowedResolutions.map((resolution) => ({
      value: resolution,
      label: normalizeResolutionLabel(resolution),
    })),
    defaults: {
      styleCode: styles[0]?.code ?? null,
      durationSeconds: input.planConfig.defaultDuration,
      resolution: input.planConfig.defaultResolution,
    },
  };
}

export function validateVideoGenerationSelection(input: {
  policy: VideoGenerationPolicy;
  selection: VideoGenerationSelection;
}): VideoGenerationSelectionValidationResult {
  if (!input.policy.enabled) {
    return {
      ok: false,
      code: 'policy_disabled',
      message: 'Video generation is not available.',
    };
  }

  if (!input.policy.styles.some((style) => style.code === input.selection.styleCode)) {
    return {
      ok: false,
      code: 'invalid_style',
      message: 'The selected video style is not available.',
    };
  }

  if (!input.policy.durations.includes(input.selection.durationSeconds)) {
    return {
      ok: false,
      code: 'invalid_duration',
      message: 'The selected video duration is not available.',
    };
  }

  if (
    !input.policy.resolutions.some(
      (resolution) => resolution.value === input.selection.resolution,
    )
  ) {
    return {
      ok: false,
      code: 'invalid_resolution',
      message: 'The selected video resolution is not available.',
    };
  }

  return { ok: true, code: null, message: null };
}
