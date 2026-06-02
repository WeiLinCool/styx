import type { AgentTaskType } from '@/server/agent/types';

export type ProviderBillingRuleConfig = {
  chat?: {
    mode: 'token_breakdown';
    inputCreditsPer1k: number;
    cachedInputCreditsPer1k: number;
    cacheMissInputCreditsPer1k: number;
    outputCreditsPer1k: number;
    minimumCredits: number;
  };
  image?: {
    mode: 'fixed' | 'per_image' | 'provider_usage_tokens';
    fixedCredits?: number;
    imageCredits?: number;
    tokenCreditsPer1k?: number;
    minimumCredits: number;
  };
  video?: {
    mode: 'provider_usage_tokens' | 'video_seconds';
    tokenCreditsPer1k?: number;
    secondsCredits?: number;
    resolutionMultipliers?: Record<string, number>;
    minimumCredits: number;
  };
};

export type UsageBreakdownAmountUnit = {
  kind:
    | 'input_tokens'
    | 'cached_input_tokens'
    | 'cache_miss_input_tokens'
    | 'output_tokens'
    | 'total_tokens'
    | 'image_count'
    | 'duration_seconds';
  amount: number;
};

export type UsageBreakdownValueUnit = {
  kind: 'resolution' | 'ratio' | 'mode';
  value: string;
};

export type UsageBreakdownUnit = UsageBreakdownAmountUnit | UsageBreakdownValueUnit;

export type ProviderUsageBreakdown = {
  taskType: AgentTaskType;
  providerType: string;
  units: UsageBreakdownUnit[];
  rawUsage: Record<string, unknown>;
};

export function parseProviderBillingRules(value: unknown): ProviderBillingRuleConfig {
  if (!isRecord(value)) {
    return {};
  }

  return {
    ...(isRecord(value.chat) ? { chat: parseChatRule(value.chat) } : {}),
    ...(isRecord(value.image) ? { image: parseImageRule(value.image) } : {}),
    ...(isRecord(value.video) ? { video: parseVideoRule(value.video) } : {}),
  };
}

export function normalizeProviderUsage(input: {
  providerType: string;
  taskType: AgentTaskType;
  rawUsage: Record<string, unknown>;
  runInput: Record<string, unknown>;
}): ProviderUsageBreakdown {
  const units: UsageBreakdownUnit[] = [];
  const promptTokens = readNumber(input.rawUsage.prompt_tokens);
  const cacheHitTokens = readNumber(input.rawUsage.prompt_cache_hit_tokens);
  const cacheMissTokens = readNumber(input.rawUsage.prompt_cache_miss_tokens);
  const completionTokens = readNumber(input.rawUsage.completion_tokens);
  const totalTokens = readNumber(input.rawUsage.total_tokens);

  if (promptTokens !== null) units.push({ kind: 'input_tokens', amount: promptTokens });
  if (cacheHitTokens !== null) {
    units.push({ kind: 'cached_input_tokens', amount: cacheHitTokens });
  }
  if (cacheMissTokens !== null) {
    units.push({ kind: 'cache_miss_input_tokens', amount: cacheMissTokens });
  }
  if (completionTokens !== null) {
    units.push({ kind: 'output_tokens', amount: completionTokens });
  }
  if (totalTokens !== null) units.push({ kind: 'total_tokens', amount: totalTokens });

  const imageCount = readNumber(input.runInput.imageCount);
  if (input.taskType === 'image') {
    units.push({ kind: 'image_count', amount: imageCount ?? 1 });
  }

  const durationSeconds = readNumber(input.runInput.durationSeconds);
  if (durationSeconds !== null) {
    units.push({ kind: 'duration_seconds', amount: durationSeconds });
  }

  const resolution = readString(input.runInput.resolution);
  if (resolution) units.push({ kind: 'resolution', value: resolution });

  const ratio = readString(input.runInput.ratio);
  if (ratio) units.push({ kind: 'ratio', value: ratio });

  const mode = readString(input.runInput.mode);
  if (mode) units.push({ kind: 'mode', value: mode });

  return {
    taskType: input.taskType,
    providerType: input.providerType,
    units,
    rawUsage: input.rawUsage,
  };
}

export function calculateProviderCreditCost(input: {
  taskType: AgentTaskType;
  usage: ProviderUsageBreakdown;
  rules: ProviderBillingRuleConfig;
}): number {
  if (input.taskType === 'chat' && input.rules.chat) {
    const rule = input.rules.chat;
    const cacheAwareInput =
      unitAmount(input.usage, 'cached_input_tokens') +
      unitAmount(input.usage, 'cache_miss_input_tokens');
    const plainInputCost =
      cacheAwareInput > 0
        ? 0
        : (unitAmount(input.usage, 'input_tokens') / 1000) * rule.inputCreditsPer1k;
    const cost =
      plainInputCost +
      (unitAmount(input.usage, 'cached_input_tokens') / 1000) *
        rule.cachedInputCreditsPer1k +
      (unitAmount(input.usage, 'cache_miss_input_tokens') / 1000) *
        rule.cacheMissInputCreditsPer1k +
      (unitAmount(input.usage, 'output_tokens') / 1000) * rule.outputCreditsPer1k;

    return Math.max(rule.minimumCredits, Math.ceil(cost));
  }

  if (input.taskType === 'image' && input.rules.image) {
    const rule = input.rules.image;
    const cost =
      rule.mode === 'fixed'
        ? (rule.fixedCredits ?? rule.minimumCredits)
        : rule.mode === 'per_image'
          ? unitAmount(input.usage, 'image_count') * (rule.imageCredits ?? rule.minimumCredits)
          : (unitAmount(input.usage, 'total_tokens') / 1000) *
            (rule.tokenCreditsPer1k ?? 0);

    return Math.max(rule.minimumCredits, Math.ceil(cost));
  }

  if (input.taskType === 'video' && input.rules.video) {
    const rule = input.rules.video;
    const resolution = unitValue(input.usage, 'resolution');
    const multiplier = resolution ? (rule.resolutionMultipliers?.[resolution] ?? 1) : 1;
    const cost =
      rule.mode === 'provider_usage_tokens'
        ? (unitAmount(input.usage, 'total_tokens') / 1000) *
          (rule.tokenCreditsPer1k ?? 0)
        : unitAmount(input.usage, 'duration_seconds') *
          (rule.secondsCredits ?? 0) *
          multiplier;

    return Math.max(rule.minimumCredits, Math.ceil(cost));
  }

  throw new Error(`Missing billing rule for ${input.taskType}.`);
}

function parseChatRule(
  value: Record<string, unknown>,
): NonNullable<ProviderBillingRuleConfig['chat']> {
  return {
    mode: 'token_breakdown',
    inputCreditsPer1k: nonNegativeNumber(value.inputCreditsPer1k),
    cachedInputCreditsPer1k: nonNegativeNumber(value.cachedInputCreditsPer1k),
    cacheMissInputCreditsPer1k: nonNegativeNumber(value.cacheMissInputCreditsPer1k),
    outputCreditsPer1k: nonNegativeNumber(value.outputCreditsPer1k),
    minimumCredits: nonNegativeInteger(value.minimumCredits),
  };
}

function parseImageRule(
  value: Record<string, unknown>,
): NonNullable<ProviderBillingRuleConfig['image']> {
  const mode =
    value.mode === 'per_image' || value.mode === 'provider_usage_tokens'
      ? value.mode
      : 'fixed';

  return {
    mode,
    fixedCredits: optionalNonNegativeNumber(value.fixedCredits),
    imageCredits: optionalNonNegativeNumber(value.imageCredits),
    tokenCreditsPer1k: optionalNonNegativeNumber(value.tokenCreditsPer1k),
    minimumCredits: nonNegativeInteger(value.minimumCredits),
  };
}

function parseVideoRule(
  value: Record<string, unknown>,
): NonNullable<ProviderBillingRuleConfig['video']> {
  const mode = value.mode === 'video_seconds' ? value.mode : 'provider_usage_tokens';

  return {
    mode,
    tokenCreditsPer1k: optionalNonNegativeNumber(value.tokenCreditsPer1k),
    secondsCredits: optionalNonNegativeNumber(value.secondsCredits),
    resolutionMultipliers: isRecord(value.resolutionMultipliers)
      ? Object.fromEntries(
          Object.entries(value.resolutionMultipliers).map(([key, item]) => [
            key,
            nonNegativeNumber(item),
          ]),
        )
      : undefined,
    minimumCredits: nonNegativeInteger(value.minimumCredits),
  };
}

function unitAmount(usage: ProviderUsageBreakdown, kind: UsageBreakdownAmountUnit['kind']) {
  return usage.units
    .filter((unit): unit is UsageBreakdownAmountUnit => unit.kind === kind && 'amount' in unit)
    .reduce((sum, unit) => sum + unit.amount, 0);
}

function unitValue(usage: ProviderUsageBreakdown, kind: UsageBreakdownValueUnit['kind']) {
  return (
    usage.units.find(
      (unit): unit is UsageBreakdownValueUnit => unit.kind === kind && 'value' in unit,
    )?.value ?? null
  );
}

function nonNegativeNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Billing rate must be a non-negative number.');
  }

  return value;
}

function optionalNonNegativeNumber(value: unknown) {
  return typeof value === 'undefined' ? undefined : nonNegativeNumber(value);
}

function nonNegativeInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('Minimum credits must be a non-negative integer.');
  }

  return value;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
