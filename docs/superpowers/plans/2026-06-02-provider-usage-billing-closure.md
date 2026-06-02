# Provider Usage Billing Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build administrator-configured provider usage billing for chat/image/video, prioritize Doubao text-to-image and Seedance text-to-video MVP closure, and expose billing audit details to administrators only.

**Architecture:** Keep authority server-side: provider/model repositories own configuration, provider adapters own raw provider parsing, billing domain code normalizes usage and calculates credits, and credit ledger entries remain the durable debit record. `/video-gen` moves from static client models to configured video models, creates Doubao asynchronous video tasks, syncs provider status through a bounded route, and debits only after successful completion.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle/PostgreSQL, Zod, existing Node test runner via `pnpm exec tsx --test`, shadcn/Radix UI primitives, existing `userApiRequest`/`adminApiRequest` clients.

---

## File Structure

- Create `src/server/billing/provider-rules.ts`: typed provider billing rules, parsing, normalization, and credit calculation.
- Modify `src/server/billing/credits.ts`: use provider-rule credit costs for chat/image/video debits while preserving existing ledger idempotency.
- Modify `src/server/billing/credits.test.ts`: cover provider billing rules and ledger idempotency.
- Modify `src/server/db/schema.ts`: add video capability/default columns to `ai_models`.
- Modify `src/server/db/seed.ts`: seed development/Doubao-like video models and provider billing rules.
- Generate `drizzle/*.sql` and `drizzle/meta/*.json` with `pnpm db:generate`.
- Modify `src/server/repositories/ai-models.ts`: parse provider billing rules, expose video model DTOs, resolve video models, and include video admin fields.
- Modify `src/server/repositories/ai-models.test.ts`: video model list/resolve/default tests and provider billing rule parsing tests.
- Modify `src/app/api/admin/ai-providers/route.ts`, `src/app/api/admin/ai-providers/[providerId]/route.ts`: validate billing rules on create/update.
- Modify provider route tests under `src/app/api/admin/ai-providers/**`: billing rules parser tests.
- Modify `src/features/admin/admin-ai-config-forms.tsx`: provider billing rules form fields and model video capability fields.
- Modify `src/features/admin/admin-ai-models-module.tsx`: display/search/filter video support and pricing/audit summaries.
- Create `src/app/api/agent/video-models/route.ts` and `src/app/api/agent/video-models/route.test.ts`: user-facing entitled video model list.
- Modify `src/features/public/agent-runtime-client.ts` and test: video model API client, run sync client, and direct video artifact parsing support.
- Create `src/server/ai/video-provider-adapters.ts` and `src/server/ai/video-provider-adapters.test.ts`: Doubao/Ark Seedance task create/poll adapter.
- Modify `src/app/api/agent/runs/route.ts` and test: require `modelId` and validate video input for video runs.
- Create `src/app/api/agent/runs/[runId]/sync/route.ts` and test: bounded video provider status sync.
- Modify `src/server/agent/run-service.ts` and test: selected-model video orchestration, provider task snapshots, sync completion, billing.
- Modify `src/app/video-gen/page.tsx`: load configured video models, submit `modelId`, poll sync/detail, and render final direct video.
- Modify `src/server/repositories/ai-jobs.ts` and admin module rendering: expose admin-only billing detail summaries.

## Task 1: Provider Billing Rule Domain

**Files:**
- Create: `src/server/billing/provider-rules.ts`
- Modify: `src/server/billing/credits.ts`
- Modify: `src/server/billing/credits.test.ts`

- [ ] **Step 1: Write failing provider-rule tests**

Add these imports and tests to `src/server/billing/credits.test.ts`:

```ts
import {
  calculateProviderCreditCost,
  normalizeProviderUsage,
  parseProviderBillingRules,
} from './provider-rules';

test('provider billing calculates DeepSeek cache-aware chat cost', () => {
  const rules = parseProviderBillingRules({
    chat: {
      mode: 'token_breakdown',
      inputCreditsPer1k: 2,
      cachedInputCreditsPer1k: 0.5,
      cacheMissInputCreditsPer1k: 2,
      outputCreditsPer1k: 8,
      minimumCredits: 1,
    },
  });

  const usage = normalizeProviderUsage({
    providerType: 'openai_compatible',
    taskType: 'chat',
    rawUsage: {
      prompt_tokens: 1000,
      prompt_cache_hit_tokens: 400,
      prompt_cache_miss_tokens: 600,
      completion_tokens: 250,
      total_tokens: 1250,
    },
    runInput: {},
  });

  assert.equal(calculateProviderCreditCost({ taskType: 'chat', usage, rules }), 4);
});

test('provider billing calculates Seedance video token usage with minimum', () => {
  const rules = parseProviderBillingRules({
    video: {
      mode: 'provider_usage_tokens',
      tokenCreditsPer1k: 1,
      minimumCredits: 3,
    },
  });

  const usage = normalizeProviderUsage({
    providerType: 'openai_compatible',
    taskType: 'video',
    rawUsage: { total_tokens: 1200, completion_tokens: 1200 },
    runInput: { durationSeconds: 5, resolution: '720p', ratio: '16:9' },
  });

  assert.equal(calculateProviderCreditCost({ taskType: 'video', usage, rules }), 3);
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm exec tsx --test src/server/billing/credits.test.ts
```

Expected: FAIL with missing `./provider-rules` module.

- [ ] **Step 3: Implement provider-rule parser and calculator**

Create `src/server/billing/provider-rules.ts`:

```ts
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

export type UsageBreakdownUnit =
  | { kind: 'input_tokens' | 'cached_input_tokens' | 'cache_miss_input_tokens' | 'output_tokens' | 'total_tokens' | 'image_count' | 'duration_seconds'; amount: number }
  | { kind: 'resolution' | 'ratio' | 'mode'; value: string };

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
  if (cacheHitTokens !== null) units.push({ kind: 'cached_input_tokens', amount: cacheHitTokens });
  if (cacheMissTokens !== null) units.push({ kind: 'cache_miss_input_tokens', amount: cacheMissTokens });
  if (completionTokens !== null) units.push({ kind: 'output_tokens', amount: completionTokens });
  if (totalTokens !== null) units.push({ kind: 'total_tokens', amount: totalTokens });

  const imageCount = readNumber(input.runInput.imageCount);
  if (input.taskType === 'image') units.push({ kind: 'image_count', amount: imageCount ?? 1 });

  const durationSeconds = readNumber(input.runInput.durationSeconds);
  if (durationSeconds !== null) units.push({ kind: 'duration_seconds', amount: durationSeconds });
  const resolution = readString(input.runInput.resolution);
  if (resolution) units.push({ kind: 'resolution', value: resolution });
  const ratio = readString(input.runInput.ratio);
  if (ratio) units.push({ kind: 'ratio', value: ratio });
  const mode = readString(input.runInput.mode);
  if (mode) units.push({ kind: 'mode', value: mode });

  return { taskType: input.taskType, providerType: input.providerType, units, rawUsage: input.rawUsage };
}

export function calculateProviderCreditCost(input: {
  taskType: AgentTaskType;
  usage: ProviderUsageBreakdown;
  rules: ProviderBillingRuleConfig;
}): number {
  if (input.taskType === 'chat' && input.rules.chat) {
    const rule = input.rules.chat;
    const cost =
      (unitAmount(input.usage, 'input_tokens') / 1000) * rule.inputCreditsPer1k +
      (unitAmount(input.usage, 'cached_input_tokens') / 1000) * rule.cachedInputCreditsPer1k +
      (unitAmount(input.usage, 'cache_miss_input_tokens') / 1000) * rule.cacheMissInputCreditsPer1k +
      (unitAmount(input.usage, 'output_tokens') / 1000) * rule.outputCreditsPer1k;
    return Math.max(rule.minimumCredits, Math.ceil(cost));
  }

  if (input.taskType === 'image' && input.rules.image) {
    const rule = input.rules.image;
    const cost =
      rule.mode === 'fixed'
        ? rule.fixedCredits ?? rule.minimumCredits
        : rule.mode === 'per_image'
          ? unitAmount(input.usage, 'image_count') * (rule.imageCredits ?? rule.minimumCredits)
          : (unitAmount(input.usage, 'total_tokens') / 1000) * (rule.tokenCreditsPer1k ?? 0);
    return Math.max(rule.minimumCredits, Math.ceil(cost));
  }

  if (input.taskType === 'video' && input.rules.video) {
    const rule = input.rules.video;
    const resolution = unitValue(input.usage, 'resolution');
    const multiplier = resolution ? rule.resolutionMultipliers?.[resolution] ?? 1 : 1;
    const cost =
      rule.mode === 'provider_usage_tokens'
        ? (unitAmount(input.usage, 'total_tokens') / 1000) * (rule.tokenCreditsPer1k ?? 0)
        : unitAmount(input.usage, 'duration_seconds') * (rule.secondsCredits ?? 0) * multiplier;
    return Math.max(rule.minimumCredits, Math.ceil(cost));
  }

  throw new Error(`Missing billing rule for ${input.taskType}.`);
}

function parseChatRule(value: Record<string, unknown>): NonNullable<ProviderBillingRuleConfig['chat']> {
  return {
    mode: 'token_breakdown',
    inputCreditsPer1k: nonNegativeNumber(value.inputCreditsPer1k),
    cachedInputCreditsPer1k: nonNegativeNumber(value.cachedInputCreditsPer1k),
    cacheMissInputCreditsPer1k: nonNegativeNumber(value.cacheMissInputCreditsPer1k),
    outputCreditsPer1k: nonNegativeNumber(value.outputCreditsPer1k),
    minimumCredits: nonNegativeInteger(value.minimumCredits),
  };
}

function parseImageRule(value: Record<string, unknown>): NonNullable<ProviderBillingRuleConfig['image']> {
  const mode = value.mode === 'per_image' || value.mode === 'provider_usage_tokens' ? value.mode : 'fixed';
  return {
    mode,
    fixedCredits: optionalNonNegativeNumber(value.fixedCredits),
    imageCredits: optionalNonNegativeNumber(value.imageCredits),
    tokenCreditsPer1k: optionalNonNegativeNumber(value.tokenCreditsPer1k),
    minimumCredits: nonNegativeInteger(value.minimumCredits),
  };
}

function parseVideoRule(value: Record<string, unknown>): NonNullable<ProviderBillingRuleConfig['video']> {
  const mode = value.mode === 'video_seconds' ? value.mode : 'provider_usage_tokens';
  return {
    mode,
    tokenCreditsPer1k: optionalNonNegativeNumber(value.tokenCreditsPer1k),
    secondsCredits: optionalNonNegativeNumber(value.secondsCredits),
    resolutionMultipliers: isRecord(value.resolutionMultipliers)
      ? Object.fromEntries(Object.entries(value.resolutionMultipliers).map(([key, item]) => [key, nonNegativeNumber(item)]))
      : undefined,
    minimumCredits: nonNegativeInteger(value.minimumCredits),
  };
}

function unitAmount(usage: ProviderUsageBreakdown, kind: Extract<UsageBreakdownUnit, { amount: number }>['kind']) {
  return usage.units
    .filter((unit): unit is Extract<UsageBreakdownUnit, { amount: number }> => unit.kind === kind && 'amount' in unit)
    .reduce((sum, unit) => sum + unit.amount, 0);
}

function unitValue(usage: ProviderUsageBreakdown, kind: Extract<UsageBreakdownUnit, { value: string }>['kind']) {
  return usage.units.find((unit): unit is Extract<UsageBreakdownUnit, { value: string }> => unit.kind === kind && 'value' in unit)?.value ?? null;
}

function nonNegativeNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Billing rate must be a non-negative number.');
  return value;
}

function optionalNonNegativeNumber(value: unknown) {
  return typeof value === 'undefined' ? undefined : nonNegativeNumber(value);
}

function nonNegativeInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error('Minimum credits must be a non-negative integer.');
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
```

- [ ] **Step 4: Run provider-rule tests**

Run:

```bash
pnpm exec tsx --test src/server/billing/credits.test.ts
```

Expected: PASS for provider-rule tests and existing credit tests.

- [ ] **Step 5: Commit billing rule domain**

Run:

```bash
git add src/server/billing/provider-rules.ts src/server/billing/credits.test.ts
git commit -m "feat: add provider usage billing rules"
```

## Task 2: Provider Config, Video Model Schema, And Repository Contract

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/seed.ts`
- Generate: `drizzle/*.sql`, `drizzle/meta/*.json`
- Modify: `src/server/repositories/ai-models.ts`
- Modify: `src/server/repositories/ai-models.test.ts`

- [ ] **Step 1: Write failing repository tests for video model support**

Add focused tests to `src/server/repositories/ai-models.test.ts`:

```ts
test('seed video models expose entitled default video model', async () => {
  const models = await listAvailableVideoModelsForUser('user-free');
  assert.equal(models.length > 0, true);
  assert.equal(models.some((model) => model.isDefault), true);
  assert.equal(models.every((model) => typeof model.pricingSummary === 'string'), true);
});

test('resolve video model rejects image-only model', async () => {
  await assert.rejects(
    () => resolveVideoModelForUser('user-free', 'seed-model-free-image'),
    ModelNotAvailableError,
  );
});
```

- [ ] **Step 2: Run failing repository tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts
```

Expected: FAIL because video model functions and fields do not exist.

- [ ] **Step 3: Add additive schema fields**

In `src/server/db/schema.ts`, extend `aiModels`:

```ts
supportsVideoGeneration: boolean('supports_video_generation').notNull().default(false),
isDefaultVideo: boolean('is_default_video').notNull().default(false),
```

Add indexes in the same table callback:

```ts
index('ai_models_video_generation_idx').on(table.supportsVideoGeneration),
```

- [ ] **Step 4: Generate migration**

Run:

```bash
pnpm db:generate
```

Expected: a new Drizzle migration adding only nullable-safe/defaulted video columns and index metadata.

- [ ] **Step 5: Extend repository DTOs and seed data**

In `src/server/repositories/ai-models.ts`, add:

```ts
export type PublicVideoModelDto = PublicChatModelDto;
export type ResolvedVideoModel = ResolvedChatModel & {
  supportsVideoGeneration: true;
};
```

Add video fields to admin row types and mapping:

```ts
supportsVideoGeneration: boolean;
isDefaultVideo: boolean;
```

Add seed video model entries with provider billing rules in seed provider metadata/config:

```ts
const videoSeedPricing: AiModelPricing = {
  unit: 'token',
  promptCreditsPer1k: 0,
  completionCreditsPer1k: 1,
  minimumCredits: 3,
};
```

Implement public helpers following existing chat/image patterns:

```ts
export async function listAvailableVideoModelsForUser(userId: string): Promise<PublicVideoModelDto[]> {
  const entitlements = await listActiveUserEntitlements(userId);
  const database = ensureAiModelReadSource();
  if (!database) return getSeedVideoModelsForUser(userId, entitlements);
  return (await resolveDatabaseVideoModelsForUser(userId, entitlements)).map(toPublicModel);
}

export async function resolveVideoModelForUser(userId: string, modelId: string): Promise<ResolvedVideoModel> {
  const entitlements = await listActiveUserEntitlements(userId);
  const database = ensureAiModelReadSource();
  if (!database) return resolveSeedVideoModelForUser(userId, modelId, entitlements);
  return resolveDatabaseVideoModelForUser(userId, modelId, entitlements);
}
```

- [ ] **Step 6: Run repository tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit schema and repository contract**

Run:

```bash
git add src/server/db/schema.ts src/server/db/seed.ts src/server/repositories/ai-models.ts src/server/repositories/ai-models.test.ts drizzle
git commit -m "feat: add provider video model contract"
```

## Task 3: Admin Provider Billing Rules And Model Video Controls

**Files:**
- Modify: `src/app/api/admin/ai-providers/route.ts`
- Modify: `src/app/api/admin/ai-providers/[providerId]/route.ts`
- Modify: `src/app/api/admin/ai-providers/route.test.ts` or create if absent
- Modify: `src/app/api/admin/ai-providers/[providerId]/route.test.ts` or create if absent
- Modify: `src/app/api/admin/ai-models/route.ts`
- Modify: `src/app/api/admin/ai-models/[modelId]/route.ts`
- Modify: `src/features/admin/admin-ai-config-forms.tsx`
- Modify: `src/features/admin/admin-ai-models-module.tsx`

- [ ] **Step 1: Write failing route parser tests**

Add provider body parser tests:

```ts
test('parseAiProviderCreateBody accepts billing rules', async () => {
  const body = await parseAiProviderCreateBody({
    json: async () => ({
      code: 'doubao',
      name: 'Doubao',
      providerType: 'openai_compatible',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      credentialEnvKey: 'DOUBAO_API_KEY',
      status: 'enabled',
      billingRules: {
        video: { mode: 'provider_usage_tokens', tokenCreditsPer1k: 1, minimumCredits: 3 },
      },
    }),
  });

  assert.equal(body.billingRules.video.minimumCredits, 3);
});
```

Add model parser tests:

```ts
test('parseAiModelCreateBody accepts video capability flag', async () => {
  const body = await parseAiModelCreateBody({
    json: async () => ({
      providerId: '00000000-0000-4000-8000-000000000001',
      code: 'doubao-seedance',
      name: 'Doubao Seedance',
      model: 'doubao-seedance-1-0-pro',
      status: 'enabled',
      supportsChat: false,
      supportsImageGeneration: false,
      supportsImageEdit: false,
      supportsImageUpscale: false,
      supportsVideoGeneration: true,
    }),
  });

  assert.equal(body.supportsVideoGeneration, true);
});
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/ai-models/route.test.ts src/app/api/admin/ai-models/[modelId]/route.test.ts
```

Expected: FAIL for missing `supportsVideoGeneration` in schemas. Run provider route tests too if files exist.

- [ ] **Step 3: Extend Zod schemas**

In provider create/update routes:

```ts
billingRules: z.record(z.string(), z.unknown()).default({}),
```

Parse through `parseProviderBillingRules(body.billingRules)` before repository writes so invalid rates fail at boundary.

In model create/update routes:

```ts
supportsVideoGeneration: z.boolean(),
```

- [ ] **Step 4: Extend admin forms**

In `src/features/admin/admin-ai-config-forms.tsx`, extend `ProviderFormValues`:

```ts
billingRulesJson: string;
```

Submit parsed JSON:

```ts
const billingRules = values.billingRulesJson.trim()
  ? JSON.parse(values.billingRulesJson)
  : {};
await postJson(submitUrl, { ...values, billingRules });
```

Add a textarea-like `FormField` using existing UI primitives or a multiline `textarea` styled like existing inputs:

```tsx
<FormField
  control={form.control}
  name="billingRulesJson"
  render={({ field }) => (
    <FormItem>
      <FormLabel>计费规则 JSON</FormLabel>
      <FormControl>
        <textarea {...field} className="min-h-32 w-full rounded-md border border-neutral-200 px-3 py-2 text-xs font-mono" />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

Extend `ModelFormValues`:

```ts
supportsVideoGeneration: boolean;
```

Add a switch labelled `支持 Video`.

- [ ] **Step 5: Run admin parser tests**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/ai-models/route.test.ts src/app/api/admin/ai-models/[modelId]/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit admin configuration controls**

Run:

```bash
git add src/app/api/admin/ai-providers src/app/api/admin/ai-models src/features/admin/admin-ai-config-forms.tsx src/features/admin/admin-ai-models-module.tsx
git commit -m "feat: expose provider billing and video controls"
```

## Task 4: Video Model API And Runtime Client

**Files:**
- Create: `src/app/api/agent/video-models/route.ts`
- Create: `src/app/api/agent/video-models/route.test.ts`
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Write failing API route test**

Create `src/app/api/agent/video-models/route.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseVideoModelRequestUrl } from './route';

test('parseVideoModelRequestUrl accepts base request url', () => {
  assert.deepEqual(parseVideoModelRequestUrl('https://example.com/api/agent/video-models'), {});
});
```

- [ ] **Step 2: Run route test and verify failure**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/video-models/route.test.ts
```

Expected: FAIL because route does not exist.

- [ ] **Step 3: Implement video model route**

Create `src/app/api/agent/video-models/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { listAvailableVideoModelsForUser } from '@/server/repositories/ai-models';

export function parseVideoModelRequestUrl(_url: string) {
  return {};
}

export async function GET() {
  try {
    const session = await requireActiveAccount();
    const models = await listAvailableVideoModelsForUser(session.user.id);
    return NextResponse.json({ models });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
```

- [ ] **Step 4: Add runtime client parser tests**

In `src/features/public/agent-runtime-client.test.ts`:

```ts
test('parseVideoModel accepts chat model shape', () => {
  const model = parseVideoModel({
    id: 'video-model',
    code: 'seedance',
    name: 'Seedance',
    providerName: 'Doubao',
    isDefault: true,
    entitlementLabel: '会员',
    pricingSummary: '3 credits minimum',
  });

  assert.equal(model?.id, 'video-model');
});
```

- [ ] **Step 5: Implement runtime client**

In `src/features/public/agent-runtime-client.ts`:

```ts
export type VideoModelOption = ChatModelOption;

export function parseVideoModel(value: unknown): VideoModelOption | null {
  return parseChatModel(value);
}

export async function listVideoModels(): Promise<VideoModelOption[]> {
  const response = await userApiRequest('/api/agent/video-models', { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '视频模型列表加载失败');
  }
  const rawModels =
    payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown }).models)
      ? (payload as { models: unknown[] }).models
      : [];
  return rawModels.map(parseVideoModel).filter((model): model is VideoModelOption => model !== null);
}
```

- [ ] **Step 6: Run client and route tests**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/video-models/route.test.ts src/features/public/agent-runtime-client.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit video model API client**

Run:

```bash
git add src/app/api/agent/video-models src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: add video model list api"
```

## Task 5: Doubao Seedance Video Adapter

**Files:**
- Create: `src/server/ai/video-provider-adapters.ts`
- Create: `src/server/ai/video-provider-adapters.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `src/server/ai/video-provider-adapters.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDoubaoVideoProviderAdapter,
  parseDoubaoVideoTaskResponse,
} from './video-provider-adapters';

test('parseDoubaoVideoTaskResponse reads succeeded task video and usage', () => {
  const result = parseDoubaoVideoTaskResponse({
    id: 'task-1',
    status: 'succeeded',
    content: {
      video_url: 'https://provider.example/video.mp4',
    },
    usage: { total_tokens: 108900, completion_tokens: 108900 },
    duration: 5,
    resolution: '720p',
    ratio: '16:9',
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.videoUrl, 'https://provider.example/video.mp4');
  assert.equal(result.rawUsage.total_tokens, 108900);
});

test('doubao video adapter creates task request shape', async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  const adapter = createDoubaoVideoProviderAdapter({
    readEnv: () => 'test-key',
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: 'task-1', status: 'running' }), { status: 200 });
    },
  });

  await adapter.createVideoTask({
    runId: 'run-1',
    userId: 'user-1',
    model: {
      baseUrl: 'https://ark.example/api/v3',
      credentialEnvKey: 'ARK_API_KEY',
      model: 'doubao-seedance',
    } as never,
    prompt: 'stone product video',
    input: { durationSeconds: 5, resolution: '720p', ratio: '16:9' },
  });

  assert.equal(requests[0]?.url, 'https://ark.example/api/v3/contents/generations/tasks');
});
```

- [ ] **Step 2: Run failing adapter tests**

Run:

```bash
pnpm exec tsx --test src/server/ai/video-provider-adapters.test.ts
```

Expected: FAIL because adapter module does not exist.

- [ ] **Step 3: Implement adapter**

Create `src/server/ai/video-provider-adapters.ts`:

```ts
import type { ResolvedVideoModel } from '@/server/repositories/ai-models';
import { proxyRequestInit, selectOpenAiCompatibleFetch, type RequestInitWithDispatcher } from './openai-compatible-transport';
import { ProviderConfigurationError, ProviderRequestError } from './provider-adapters';
import { readSafeProviderErrorBody } from './provider-error-body';

export type VideoProviderTaskStatus = 'running' | 'succeeded' | 'failed';

export type VideoProviderTaskResult = {
  providerTaskId: string;
  status: VideoProviderTaskStatus;
  videoUrl: string | null;
  rawUsage: Record<string, unknown>;
  metadata: Record<string, unknown>;
  errorMessage: string | null;
};

export type VideoProviderAdapter = {
  createVideoTask(request: {
    runId: string;
    userId: string;
    model: ResolvedVideoModel;
    prompt: string;
    input: Record<string, unknown>;
  }): Promise<VideoProviderTaskResult>;
  getVideoTask(request: { model: ResolvedVideoModel; providerTaskId: string }): Promise<VideoProviderTaskResult>;
};

export function createDoubaoVideoProviderAdapter(input: { fetch?: typeof fetch; readEnv?: (key: string) => string | undefined | null } = {}): VideoProviderAdapter {
  const fetchImpl = input.fetch ?? selectOpenAiCompatibleFetch();
  const readEnv = input.readEnv ?? ((key) => process.env[key]);

  async function requestJson(model: ResolvedVideoModel, path: string, init: RequestInit) {
    const baseUrl = model.baseUrl?.trim();
    const credentialEnvKey = model.credentialEnvKey?.trim();
    if (!baseUrl || !credentialEnvKey) throw new ProviderConfigurationError('Doubao video provider is missing configuration.');
    const apiKey = readEnv(credentialEnvKey)?.trim();
    if (!apiKey) throw new ProviderConfigurationError(`Doubao video provider credential is missing: ${credentialEnvKey}`);

    const response = await fetchImpl(new URL(path, ensureTrailingSlash(baseUrl)), {
      ...init,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
      ...proxyRequestInit(),
    } satisfies RequestInitWithDispatcher);

    if (!response.ok) throw new ProviderRequestError(`Provider request failed with status ${response.status}: ${await readSafeProviderErrorBody(response)}`);
    return response.json() as Promise<unknown>;
  }

  return {
    async createVideoTask(request) {
      const raw = await requestJson(request.model, 'contents/generations/tasks', {
        method: 'POST',
        body: JSON.stringify(createDoubaoVideoTaskBody(request)),
      });
      return parseDoubaoVideoTaskResponse(raw);
    },
    async getVideoTask(request) {
      const raw = await requestJson(request.model, `contents/generations/tasks/${encodeURIComponent(request.providerTaskId)}`, { method: 'GET' });
      return parseDoubaoVideoTaskResponse(raw);
    },
  };
}

export function parseDoubaoVideoTaskResponse(raw: unknown): VideoProviderTaskResult {
  if (!isRecord(raw)) throw new ProviderRequestError('Provider returned an invalid video task response.');
  const providerTaskId = readString(raw.id) ?? readString(raw.task_id);
  if (!providerTaskId) throw new ProviderRequestError('Provider video task response did not include task id.');
  const status = normalizeStatus(readString(raw.status));
  const content = isRecord(raw.content) ? raw.content : {};
  const videoUrl = readString(content.video_url) ?? readString(raw.video_url);
  const usage = isRecord(raw.usage) ? raw.usage : {};
  return {
    providerTaskId,
    status,
    videoUrl: status === 'succeeded' ? videoUrl : null,
    rawUsage: usage,
    metadata: {
      ...(readNumber(raw.duration) !== null ? { durationSeconds: readNumber(raw.duration) } : {}),
      ...(readString(raw.resolution) ? { resolution: readString(raw.resolution) } : {}),
      ...(readString(raw.ratio) ? { ratio: readString(raw.ratio) } : {}),
      ...(readNumber(raw.fps) !== null ? { fps: readNumber(raw.fps) } : {}),
    },
    errorMessage: readString(raw.error_message) ?? readString(raw.message),
  };
}

function createDoubaoVideoTaskBody(request: { model: ResolvedVideoModel; prompt: string; input: Record<string, unknown> }) {
  return {
    model: request.model.model,
    prompt: request.prompt,
    ...(readNumber(request.input.durationSeconds) ? { duration: readNumber(request.input.durationSeconds) } : {}),
    ...(readString(request.input.resolution) ? { resolution: readString(request.input.resolution) } : {}),
    ...(readString(request.input.ratio) ? { ratio: readString(request.input.ratio) } : {}),
    ...(typeof request.input.watermark === 'boolean' ? { watermark: request.input.watermark } : {}),
    ...(readNumber(request.input.seed) !== null ? { seed: readNumber(request.input.seed) } : {}),
  };
}

function normalizeStatus(value: string | null): VideoProviderTaskStatus {
  if (value === 'succeeded' || value === 'success' || value === 'completed') return 'succeeded';
  if (value === 'failed' || value === 'cancelled' || value === 'canceled') return 'failed';
  return 'running';
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Run adapter tests**

Run:

```bash
pnpm exec tsx --test src/server/ai/video-provider-adapters.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit video adapter**

Run:

```bash
git add src/server/ai/video-provider-adapters.ts src/server/ai/video-provider-adapters.test.ts
git commit -m "feat: add doubao video provider adapter"
```

## Task 6: Video Run Creation, Sync, And Billing

**Files:**
- Modify: `src/app/api/agent/runs/route.ts`
- Modify: `src/app/api/agent/runs/route.test.ts`
- Create: `src/app/api/agent/runs/[runId]/sync/route.ts`
- Create: `src/app/api/agent/runs/[runId]/sync/route.test.ts`
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`
- Modify: `src/server/billing/credits.ts`

- [ ] **Step 1: Write failing request validation tests**

In `src/app/api/agent/runs/route.test.ts`:

```ts
test('parseCreateAgentRunRawBody requires modelId for video requests', () => {
  assert.throws(
    () => parseCreateAgentRunRawBody({ taskType: 'video', prompt: 'test', input: {} }),
    /modelId is required for video requests/,
  );
});

test('parseCreateAgentRunRawBody normalizes video input', () => {
  const body = parseCreateAgentRunRawBody({
    taskType: 'video',
    prompt: 'stone video',
    modelId: 'model-1',
    input: { durationSeconds: 5, resolution: '720p', ratio: '16:9', watermark: false },
  });
  assert.equal(body.input.durationSeconds, 5);
});
```

- [ ] **Step 2: Run failing route tests**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
```

Expected: FAIL because video requests do not require `modelId` or validate media fields.

- [ ] **Step 3: Extend video request schema**

In `src/app/api/agent/runs/route.ts`, add `video` superRefine branch:

```ts
if (body.taskType === 'video') {
  if (!body.modelId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['modelId'], message: 'modelId is required for video requests.' });
  }
  const durationSeconds = body.input.durationSeconds;
  if (durationSeconds !== 5 && durationSeconds !== 10) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['input', 'durationSeconds'], message: 'video durationSeconds must be 5 or 10.' });
  }
  const resolution = body.input.resolution;
  if (resolution !== '480p' && resolution !== '720p' && resolution !== '1080p') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['input', 'resolution'], message: 'video resolution must be 480p, 720p, or 1080p.' });
  }
}
```

- [ ] **Step 4: Write failing run-service tests**

In `src/server/agent/run-service.test.ts`, add a service test with injected fake video adapter:

```ts
test('createAndRunAgentRun creates running video task without billing until sync', async () => {
  const service = createAgentRunService({
    repository,
    runtime,
    resolveVideoModelForUser: async () => resolvedVideoModel,
    createVideoProviderAdapter: () => ({
      createVideoTask: async () => ({
        providerTaskId: 'task-1',
        status: 'running',
        videoUrl: null,
        rawUsage: {},
        metadata: {},
        errorMessage: null,
      }),
      getVideoTask: async () => {
        throw new Error('not used');
      },
    }),
    assertCanAffordMinimum: async () => {},
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: 'stone video',
    modelId: 'video-model',
    input: { durationSeconds: 5, resolution: '720p', ratio: '16:9' },
  });

  assert.equal(result.run.status, 'running');
  assert.equal(result.run.billing?.status, 'pending');
});
```

- [ ] **Step 5: Implement run-service video creation**

In `src/server/agent/run-service.ts`, add injectable dependencies:

```ts
resolveVideoModelForUser?: typeof defaultResolveVideoModelForUser;
createVideoProviderAdapter?: (model: ResolvedVideoModel) => VideoProviderAdapter;
```

Add video branch before deterministic fallback:

```ts
if (request.taskType === 'video' && request.modelId) {
  return createSelectedModelVideoRun({ ...dependencies, request });
}
```

`createSelectedModelVideoRun` should resolve model, preflight minimum, create run, call `createVideoTask`, snapshot `providerTaskId`, append `artifact_started`/`run_started`, and return running status without debit.

- [ ] **Step 6: Add sync route and service method**

Create `src/app/api/agent/runs/[runId]/sync/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { createAgentRunService } from '@/server/agent/run-service';
import { requireActiveAccount } from '@/server/auth/guards';
import { getAgentRunRepository } from '@/server/repositories/agent-runs';
import { serviceErrorToResponse } from '../../route';

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    const session = await requireActiveAccount();
    const { runId } = await context.params;
    const result = await createAgentRunService({ repository: getAgentRunRepository() }).syncAgentRun({
      runId,
      userId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return serviceErrorToResponse(error);
  }
}
```

Add `syncAgentRun` to the service. For video running runs, read provider task id from snapshot, call adapter `getVideoTask`, and:

```ts
if (task.status === 'succeeded') {
  const usageBreakdown = normalizeProviderUsage({ providerType: model.providerType, taskType: 'video', rawUsage: task.rawUsage, runInput: { ...run.input, ...task.metadata } });
  const creditCost = calculateProviderCreditCost({ taskType: 'video', usage: usageBreakdown, rules: model.providerBillingRules });
  const debit = await debitForVideoAgentRun({ userId, runId, amount: creditCost, usageBreakdown, billingRuleSnapshot: model.providerBillingRules, modelSnapshot: model });
  // complete run with direct video artifact and billing snapshot
}
```

- [ ] **Step 7: Run service and route tests**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts src/server/agent/run-service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit video run orchestration**

Run:

```bash
git add src/app/api/agent/runs src/server/agent/run-service.ts src/server/agent/run-service.test.ts src/server/billing/credits.ts
git commit -m "feat: run and bill doubao video tasks"
```

## Task 7: `/video-gen` UI Closure

**Files:**
- Modify: `src/app/video-gen/page.tsx`
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Add sync client test**

In `src/features/public/agent-runtime-client.test.ts`:

```ts
test('syncAgentRun posts to run sync endpoint', async () => {
  const restore = installFetchMock({ run: { id: 'run-1', status: 'running' } });

  try {
    const result = await syncAgentRun('run-1');
    assert.equal(result.run.id, 'run-1');
  } finally {
    restore();
  }
});
```

If this test needs to assert the exact URL, use the existing local mock pattern in the same file:

```ts
test('syncAgentRun posts to run sync endpoint url', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return Response.json({ run: { id: 'run-1', status: 'running' } });
  };

  try {
    await syncAgentRun('run-1');
    assert.equal(calls[0], '/api/agent/runs/run-1/sync');
  } finally {
    globalThis.fetch = originalFetch;
  }
  });
```

- [ ] **Step 2: Implement sync client**

In `src/features/public/agent-runtime-client.ts`:

```ts
export async function syncAgentRun(runId: string): Promise<AgentRunDetailDto | { run: AgentRunDto }> {
  const response = await userApiRequest(`/api/agent/runs/${runId}/sync`, { method: 'POST' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '视频任务同步失败');
  }
  return payload;
}
```

- [ ] **Step 3: Update `/video-gen` model loading**

In `src/app/video-gen/page.tsx`, replace static `videoModels` state with server-loaded models:

```tsx
const [videoModelOptions, setVideoModelOptions] = useState<VideoModelOption[]>([]);

useEffect(() => {
  if (!isLoggedIn || (user && requiresActivation(user))) return;
  listVideoModels()
    .then((models) => {
      setVideoModelOptions(models);
      setSelectedModel((current) => selectChatModelId(models, current) ?? '');
    })
    .catch((error) => setGenerationError(error instanceof Error ? error.message : '视频模型加载失败'));
}, [isLoggedIn, user]);
```

Submit `modelId`:

```ts
const { run } = await createAgentRun({
  taskType: 'video',
  prompt: prompt.trim(),
  modelId: selectedModel,
  input: {
    style: selectedStyle,
    durationSeconds: selectedDuration === '10秒' ? 10 : 5,
    resolution: selectedClarity.toLowerCase(),
    ratio: '16:9',
    watermark: false,
    audioEnabled,
  },
});
```

- [ ] **Step 4: Add polling sync loop**

Replace SSE-only completion reliance for video with interval sync:

```ts
useEffect(() => {
  if (!streamRunId) return;
  const timer = window.setInterval(async () => {
    try {
      const result = await syncAgentRun(streamRunId);
      const run = 'run' in result ? result.run : result.run;
      if (run.status === 'succeeded') {
        const detail = await getAgentRunDetail(streamRunId);
        const video = detail.run.artifacts.map((artifact) => parseDirectMediaArtifactPayload({ artifact })).find((artifact) => artifact?.kind === 'video') ?? null;
        setGeneratedVideo(video);
        setIsGenerating(false);
        window.clearInterval(timer);
      }
      if (run.status === 'failed') {
        setGenerationError(run.errorMessage ?? '视频生成失败');
        setIsGenerating(false);
        window.clearInterval(timer);
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '视频任务同步失败');
      setIsGenerating(false);
      window.clearInterval(timer);
    }
  }, 3000);
  return () => window.clearInterval(timer);
}, [streamRunId]);
```

- [ ] **Step 5: Run client tests**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit video UI closure**

Run:

```bash
git add src/app/video-gen/page.tsx src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: close video generation mvp"
```

## Task 8: Admin Billing Audit

**Files:**
- Modify: `src/server/repositories/ai-jobs.ts`
- Modify: `src/features/admin/admin-ai-jobs-module.tsx` or the existing admin module that renders AI jobs
- Modify: related admin tests if present

- [ ] **Step 1: Write failing repository summary test**

Add or extend the AI jobs repository test:

```ts
test('admin ai job row summarizes usage breakdown billing', () => {
  const summary = summarizeBillingDetailForAdmin({
    usageBreakdown: { units: [{ kind: 'total_tokens', amount: 108900 }] },
    billing: { creditCost: 109, ledgerEntryId: 'ledger-1', status: 'billed' },
  } as never);

  assert.equal(summary, '108900 tokens · 109 credits · ledger ledger-1');
});
```

- [ ] **Step 2: Implement admin billing summaries**

In `src/server/repositories/ai-jobs.ts`, export or keep internal:

```ts
export function summarizeBillingDetailForAdmin(snapshot: Record<string, unknown>) {
  const usageBreakdown = readSnapshotRecord(snapshot as never, 'usageBreakdown');
  const billing = readSnapshotRecord(snapshot as never, 'billing');
  const totalTokens = readUsageBreakdownAmount(usageBreakdown, 'total_tokens');
  const creditCost = readNumber(billing?.creditCost);
  const ledgerEntryId = readString(billing?.ledgerEntryId);
  return combineSummaryParts([
    totalTokens !== null ? `${totalTokens} tokens` : null,
    creditCost !== null ? `${creditCost} credits` : null,
    ledgerEntryId ? `ledger ${ledgerEntryId}` : null,
  ]);
}
```

Add row fields if needed:

```ts
billingDetail: string;
```

Render as a compact expandable or secondary text block in admin jobs module.

- [ ] **Step 3: Run admin repository tests**

Run the focused test file if present, otherwise:

```bash
pnpm validate
```

Expected: PASS or identify type/lint issues before committing.

- [ ] **Step 4: Commit admin audit summaries**

Run:

```bash
git add src/server/repositories/ai-jobs.ts src/features/admin
git commit -m "feat: show admin billing audit summaries"
```

## Task 9: Final Verification And Browser Check

**Files:**
- No source edits expected except verification notes if the repository convention requires them.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm exec tsx --test src/server/billing/credits.test.ts
pnpm exec tsx --test src/server/repositories/ai-models.test.ts
pnpm exec tsx --test src/server/ai/video-provider-adapters.test.ts
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run validation**

Run:

```bash
pnpm validate
```

Expected: `ts-check` and `lint:build` pass.

- [ ] **Step 3: Generate and apply database migration locally when `DATABASE_URL` is available**

Run:

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: generated migration is already present; migrate succeeds. If `DATABASE_URL` is missing, record that exact blocker.

- [ ] **Step 4: Build**

Run:

```bash
pnpm build
```

Expected: production build succeeds.

- [ ] **Step 5: Browser verification**

Start dev server:

```bash
pnpm dev
```

Open `/video-gen` with an active test account. Verify:

- configured video models load from API;
- disabled/unavailable state is coherent when no model exists;
- submitting a prompt creates a running task;
- sync/polling transitions to success or failure;
- final video opens/downloads through direct media result;
- admin AI jobs page shows billing detail for completed run.

If credentials for Doubao are unavailable, use test adapter fixtures for automated coverage and record credential absence as the browser blocker.

- [ ] **Step 6: Final commit if verification produces fixes**

Run:

```bash
git status --short
git add <changed-files>
git commit -m "fix: address provider billing verification"
```

Only commit if verification required source fixes.

## Self-Review

- Spec coverage: provider rules, Doubao image billing update, video model API, Seedance adapter, video run sync, admin-only audit, and verification are covered by Tasks 1-9.
- Red-flag scan: no incomplete-marker or vague-edge-case instructions remain.
- Type consistency: `ProviderBillingRuleConfig`, `ProviderUsageBreakdown`, `ResolvedVideoModel`, `VideoModelOption`, and `syncAgentRun` are introduced before later tasks reference them.
- Scope control: background workers and long-term media storage remain out of scope; MVP uses bounded sync route and existing direct-media conventions.
