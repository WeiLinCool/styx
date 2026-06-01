---
change: doubao-image-generation-loop
design-doc: docs/superpowers/specs/2026-06-01-doubao-image-generation-loop-design.md
base-ref: dac833aad03fbfcb6430918d6326e0493c3aad34
---

# Doubao Image Generation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `/image-gen` MVP for text-to-image, HD repair, and style transfer using admin-configured Doubao image models, entitlement checks, transient results, and credit billing.

**Architecture:** Extend the existing AI model catalog and selected-model runtime path rather than creating a parallel image model system. Image model availability and runtime execution reuse provider/model status, entitlement requirements, pricing, run snapshots, transient artifact splitting, and credit ledger boundaries already used by chat.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle/PostgreSQL, Node test runner via `pnpm exec tsx --test`, existing repository/service/API test patterns.

---

## File Structure

- Modify `src/server/db/schema.ts`: add additive `ai_models` image capability/default columns.
- Modify `src/server/db/seed.ts`: seed development image-capable models and requirements.
- Modify generated `drizzle/**`: add migration from `pnpm db:generate`.
- Modify `src/server/repositories/ai-models.ts`: add image model DTOs, list/resolve helpers, admin row fields, create/update input fields, seed fallbacks.
- Modify `src/server/repositories/ai-models.test.ts`: cover image listing/resolution/admin summaries.
- Create `src/app/api/agent/image-models/route.ts`: user-facing image model list route.
- Create `src/app/api/agent/image-models/route.test.ts`: route contract tests.
- Modify `src/app/api/agent/runs/route.ts`: require and validate image `modelId`, mode, source image shape.
- Modify `src/app/api/agent/runs/route.test.ts`: route parser/API response tests.
- Create `src/server/ai/image-provider-adapters.ts`: image adapter contract and Doubao/Ark adapter.
- Create `src/server/ai/image-provider-adapters.test.ts`: request/response/error normalization tests.
- Modify `src/server/billing/credits.ts`: add fixed image debit helper.
- Modify `src/server/agent/run-service.ts`: add selected-model image orchestration.
- Modify `src/server/agent/run-service.test.ts`: service tests for success, validation, authorization, billing, persistence sanitization.
- Modify `src/features/public/agent-runtime-client.ts`: add image model API client and parser.
- Modify `src/features/public/agent-runtime-client.test.ts`: client contract tests.
- Modify `src/app/image-gen/page.tsx`: server-driven model selectors, upload/preview/validation, all three runtime submit paths.
- Modify `src/features/admin/admin-ai-models-module.tsx`: display/search/filter image capability badges.
- Modify `src/features/admin/admin-ai-config-forms.tsx` and `src/features/admin/admin-action-controls.tsx`: create/update image capability form fields.
- Modify `src/app/api/admin/ai-models/route.ts` and `src/app/api/admin/ai-models/[modelId]/route.ts`: validate image capability fields.
- Modify existing admin route tests or add focused tests for create/update parsing if absent.

## Task 1: Schema, Seed, And Repository Image Model Contract

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/seed.ts`
- Modify: `src/server/repositories/ai-models.ts`
- Modify: `src/server/repositories/ai-models.test.ts`
- Generate: `drizzle/*.sql`, `drizzle/meta/*.json`

- [ ] **Step 1: Write failing repository tests for image model availability**

Add tests in `src/server/repositories/ai-models.test.ts` that describe the new behavior before implementation:

```ts
test('getSeedImageModelsForUser returns entitled models for the requested image mode', async () => {
  const freeModels = await getSeedImageModelsForUser('user-free', 'generate', []);
  assert.equal(freeModels.some((model) => model.code === 'dev-free-image'), true);

  const editModels = await getSeedImageModelsForUser('user-free', 'edit', []);
  assert.equal(editModels.every((model) => model.supportedModes.includes('edit')), true);
});

test('resolveSeedImageModelForUser rejects model that does not support requested image mode', async () => {
  await assert.rejects(
    () => resolveSeedImageModelForUser('user-free', 'seed-model-free-image', 'upscale', []),
    /Model is not available/,
  );
});

test('resolveSeedImageModelForUser allows premium image model with active pro entitlement', async () => {
  const model = await resolveSeedImageModelForUser(
    'user-pro',
    'seed-model-pro-image',
    'upscale',
    [activeProEntitlement],
  );

  assert.equal(model.code, 'dev-pro-image');
  assert.equal(model.entitlement.basis, 'membership_plan');
  assert.equal(model.supportedModes.includes('upscale'), true);
});
```

- [ ] **Step 2: Run repository tests and verify they fail for missing exports**

Run:

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts
```

Expected: FAIL because `getSeedImageModelsForUser` and `resolveSeedImageModelForUser` do not exist yet.

- [ ] **Step 3: Implement image model types and seed fallbacks**

In `src/server/repositories/ai-models.ts`, add:

```ts
export type ImageModelMode = 'generate' | 'edit' | 'upscale';

export type PublicImageModelDto = PublicChatModelDto & {
  supportedModes: ImageModelMode[];
};

export type ResolvedImageModel = ResolvedChatModel & {
  supportedModes: ImageModelMode[];
};
```

Add seed image model records with `supportedModes`, then implement:

```ts
export async function getSeedImageModelsForUser(
  _userId: string,
  mode: ImageModelMode,
  entitlements: ActiveUserEntitlement[],
): Promise<PublicImageModelDto[]> {
  return seedImageModels
    .filter((model) => model.supportedModes.includes(mode))
    .map((model) => ({
      model,
      entitlement: evaluateModelEntitlement({
        requirements: seedRequirementForModel(model),
        entitlements,
      }),
    }))
    .filter((item) => item.entitlement.allowed)
    .map((item) => toPublicImageModel({ ...item.model, entitlement: item.entitlement }));
}

export async function resolveSeedImageModelForUser(
  _userId: string,
  modelId: string,
  mode: ImageModelMode,
  entitlements: ActiveUserEntitlement[],
): Promise<ResolvedImageModel> {
  const model = seedImageModels.find((item) => item.id === modelId);
  if (!model || !model.supportedModes.includes(mode)) {
    throw new ModelNotAvailableError();
  }

  const entitlement = evaluateModelEntitlement({
    requirements: seedRequirementForModel(model),
    entitlements,
  });
  if (!entitlement.allowed) {
    throw new ModelEntitlementRequiredError();
  }

  return structuredClone({ ...model, entitlement });
}
```

Use existing pricing and requirement helpers.

- [ ] **Step 4: Run repository tests and verify seed behavior passes**

Run:

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts
```

Expected: PASS for the new seed fallback tests; existing tests still pass.

- [ ] **Step 5: Add schema fields and database-backed image listing/resolution**

Modify `src/server/db/schema.ts` `aiModels` with defaulted booleans:

```ts
supportsImageGeneration: boolean('supports_image_generation').notNull().default(false),
supportsImageEdit: boolean('supports_image_edit').notNull().default(false),
supportsImageUpscale: boolean('supports_image_upscale').notNull().default(false),
isDefaultImage: boolean('is_default_image').notNull().default(false),
```

Add indexes when useful:

```ts
index('ai_models_image_generation_idx').on(table.supportsImageGeneration),
index('ai_models_image_edit_idx').on(table.supportsImageEdit),
index('ai_models_image_upscale_idx').on(table.supportsImageUpscale),
```

In `ai-models.ts`, add `loadDatabaseImageModelRows(mode, modelId?)`, `listAvailableImageModelsForUser(userId, mode)`, and `resolveImageModelForUser(userId, modelId, mode)` using the same entitlement grouping as chat and mode-specific support fields.

- [ ] **Step 6: Update seed data**

In `src/server/db/seed.ts`, add image capability fields to existing model upserts and seed at least one development image model. Keep chat seed behavior unchanged:

```ts
supportsImageGeneration: true,
supportsImageEdit: true,
supportsImageUpscale: false,
isDefaultImage: true,
```

For a pro image model:

```ts
supportsImageGeneration: true,
supportsImageEdit: true,
supportsImageUpscale: true,
isDefaultImage: false,
```

- [ ] **Step 7: Generate migration**

Run:

```bash
pnpm db:generate
```

Expected: new migration adds only additive defaulted columns/indexes for `ai_models`. Do not manually edit generated metadata.

- [ ] **Step 8: Run repository tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add src/server/db/schema.ts src/server/db/seed.ts src/server/repositories/ai-models.ts src/server/repositories/ai-models.test.ts drizzle
git commit -m "feat: add image-capable ai model catalog"
```

## Task 2: Admin Image Capability Configuration

**Files:**
- Modify: `src/app/api/admin/ai-models/route.ts`
- Modify: `src/app/api/admin/ai-models/[modelId]/route.ts`
- Modify: `src/features/admin/admin-ai-models-module.tsx`
- Modify: `src/features/admin/admin-ai-config-forms.tsx`
- Modify: `src/features/admin/admin-action-controls.tsx`
- Modify: `src/server/repositories/ai-models.ts`
- Modify: `src/server/repositories/ai-models.test.ts`

- [ ] **Step 1: Write failing admin row/action tests**

Extend `src/server/repositories/ai-models.test.ts`:

```ts
test('getSeedAiModelAdminData shows image support and default image details', async () => {
  const data = await getSeedAiModelAdminData();
  const imageModel = data.records.find((model) => model.code === 'dev-free-image');

  assert.equal(imageModel?.supportsImageGeneration, true);
  assert.equal(imageModel?.supportsImageEdit, true);
  assert.equal(imageModel?.supportsImageUpscale, false);
  assert.equal(imageModel?.isDefaultImage, true);
});

test('createAiModel accepts image capability flags in seed mode', async () => {
  const model = await createAiModel({
    providerId: 'seed-provider-development',
    code: 'dev-image-extra',
    name: 'Development Image Extra',
    model: 'development-image-extra',
    status: 'enabled',
    supportsChat: false,
    supportsImageGeneration: true,
    supportsImageEdit: false,
    supportsImageUpscale: false,
  });

  assert.equal(model.supportsImageGeneration, true);
  assert.equal(model.supportsChat, false);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts
```

Expected: FAIL because admin DTOs and mutation inputs lack image fields.

- [ ] **Step 3: Extend admin repository DTOs and mutations**

Add fields to `AdminAiModelRow`:

```ts
supportsImageGeneration: boolean;
supportsImageEdit: boolean;
supportsImageUpscale: boolean;
isDefaultImage: boolean;
```

Update `createAiModel` and `updateAiModel` inputs and `.insert/.update` values. Existing callers must provide explicit booleans from route schemas.

- [ ] **Step 4: Extend admin route body schemas**

In both admin model create/update routes, add:

```ts
supportsImageGeneration: z.boolean(),
supportsImageEdit: z.boolean(),
supportsImageUpscale: z.boolean(),
```

Keep status validation unchanged.

- [ ] **Step 5: Update admin UI display and forms**

In `admin-ai-models-module.tsx`, include support labels:

```ts
model.supportsImageGeneration ? 'image generate' : 'no image generate',
model.supportsImageEdit ? 'image edit' : 'no image edit',
model.supportsImageUpscale ? 'image upscale' : 'no image upscale',
model.isDefaultImage ? 'default image' : 'not default image',
```

Update search haystack and filters so image capability text is searchable.

In admin form/action components, add checkboxes/toggles for the three image support fields and include them in submit payloads.

- [ ] **Step 6: Run admin/repository tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts 'src/app/api/admin/ai-models/[modelId]/status/route.test.ts'
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/app/api/admin/ai-models src/features/admin src/server/repositories/ai-models.ts src/server/repositories/ai-models.test.ts
git commit -m "feat: expose image model capabilities in admin"
```

## Task 3: User Image Model API And Client Contract

**Files:**
- Create: `src/app/api/agent/image-models/route.ts`
- Create: `src/app/api/agent/image-models/route.test.ts`
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Write failing client parser tests**

In `src/features/public/agent-runtime-client.test.ts`, add:

```ts
test('listImageModels returns parsed image model options', async () => {
  const restore = installFetchMock({
    models: [
      {
        id: 'model-1',
        code: 'doubao-image',
        name: 'Doubao Image',
        providerName: 'Doubao',
        isDefault: true,
        entitlementLabel: 'Pro',
        pricingSummary: '5 credits minimum',
        supportedModes: ['generate', 'edit'],
      },
    ],
  });

  try {
    const models = await listImageModels('generate');
    assert.equal(models[0]?.id, 'model-1');
    assert.deepEqual(models[0]?.supportedModes, ['generate', 'edit']);
  } finally {
    restore();
  }
});

test('selectImageModelId falls back to default compatible model', () => {
  const models = [
    makeImageModel({ id: 'a', isDefault: false }),
    makeImageModel({ id: 'b', isDefault: true }),
  ];

  assert.equal(selectImageModelId(models, 'missing'), 'b');
});
```

- [ ] **Step 2: Run client tests and verify failure**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected: FAIL because image client helpers do not exist.

- [ ] **Step 3: Implement client image model helpers**

In `agent-runtime-client.ts`, add:

```ts
export type ImageModelMode = 'generate' | 'edit' | 'upscale';

export type ImageModelOption = ChatModelOption & {
  supportedModes: ImageModelMode[];
};

export function selectImageModelId(
  models: ImageModelOption[],
  priorModelId?: string | null,
): string | null {
  if (priorModelId && models.some((model) => model.id === priorModelId)) {
    return priorModelId;
  }

  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

export async function listImageModels(mode: ImageModelMode): Promise<ImageModelOption[]> {
  const response = await userApiRequest(`/api/agent/image-models?mode=${encodeURIComponent(mode)}`, {
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, '图片模型列表加载失败');
  }

  const rawModels =
    payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown }).models)
      ? (payload as { models: unknown[] }).models
      : [];

  return rawModels.map(parseImageModel).filter((model): model is ImageModelOption => model !== null);
}
```

Implement `parseImageModel` with strict supported mode filtering.

- [ ] **Step 4: Write failing API route tests**

Create `src/app/api/agent/image-models/route.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseImageModelMode } from './route';

test('parseImageModelMode accepts supported modes', () => {
  assert.equal(parseImageModelMode('generate'), 'generate');
  assert.equal(parseImageModelMode('edit'), 'edit');
  assert.equal(parseImageModelMode('upscale'), 'upscale');
});

test('parseImageModelMode rejects unsupported mode', () => {
  assert.throws(() => parseImageModelMode('video'), /Invalid image model mode/);
});
```

- [ ] **Step 5: Implement image model route**

Create `src/app/api/agent/image-models/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import {
  listAvailableImageModelsForUser,
  type ImageModelMode,
} from '@/server/repositories/ai-models';

export function parseImageModelMode(value: string | null): ImageModelMode {
  if (value === 'generate' || value === 'edit' || value === 'upscale') {
    return value;
  }

  throw new Error('Invalid image model mode.');
}

export async function GET(request: Request) {
  try {
    const session = await requireActiveAccount();
    const mode = parseImageModelMode(new URL(request.url).searchParams.get('mode'));
    const models = await listAvailableImageModelsForUser(session.user.id, mode);

    return NextResponse.json({ models });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid image model mode.') {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: error.message } },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
```

- [ ] **Step 6: Run route and client tests**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/image-models/route.test.ts src/features/public/agent-runtime-client.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/app/api/agent/image-models src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: add entitled image model api"
```

## Task 4: Doubao Image Provider Adapter

**Files:**
- Create: `src/server/ai/image-provider-adapters.ts`
- Create: `src/server/ai/image-provider-adapters.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `src/server/ai/image-provider-adapters.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDoubaoImageProviderAdapter,
  parseDoubaoImageResponse,
} from './image-provider-adapters';
import type { ResolvedImageModel } from '@/server/repositories/ai-models';

test('parseDoubaoImageResponse converts b64_json to transient image artifact input', () => {
  const result = parseDoubaoImageResponse(
    {
      data: [{ b64_json: 'abc', revised_prompt: 'stone print' }],
      usage: { total_tokens: 12 },
    },
    { model: 'doubao-seedream', mode: 'generate' },
  );

  assert.equal(result.artifacts[0]?.kind, 'image');
  assert.equal(result.artifacts[0]?.body, 'data:image/png;base64,abc');
  assert.equal(result.artifacts[0]?.metadata.model, 'doubao-seedream');
  assert.equal(result.rawMetadata.usage && typeof result.rawMetadata.usage, 'object');
});

test('doubao adapter sends image generation request shape', async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const adapter = createDoubaoImageProviderAdapter({
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), { status: 200 });
    },
    readEnv: () => 'test-key',
  });

  await adapter.runImage({
    runId: 'run-1',
    userId: 'user-1',
    model: makeResolvedImageModel(),
    mode: 'generate',
    prompt: '山水',
    size: '1024x1024',
  });

  assert.match(requests[0]?.url ?? '', /images\/generations$/);
  assert.equal(requests[0]?.body.model, 'doubao-seedream');
  assert.equal(requests[0]?.body.response_format, 'b64_json');
});
```

- [ ] **Step 2: Run adapter tests and verify failure**

Run:

```bash
pnpm exec tsx --test src/server/ai/image-provider-adapters.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement image adapter module**

Create `src/server/ai/image-provider-adapters.ts` with:

```ts
export type ImageProviderRequest = {
  runId: string;
  userId: string;
  model: ResolvedImageModel;
  mode: ImageModelMode;
  prompt: string;
  size?: string;
  scale?: string;
  sourceImageDataUrl?: string;
};

export type ImageProviderAdapter = {
  kind: ResolvedImageModel['providerType'];
  runImage(request: ImageProviderRequest): Promise<ImageProviderResult>;
};
```

Implement `createDoubaoImageProviderAdapter({ fetch, readEnv } = {})`, configuration validation, `POST images/generations`, `authorization: Bearer <key>`, `response_format: 'b64_json'`, and parser helpers. Reuse `ProviderConfigurationError` and `ProviderRequestError` from `provider-adapters.ts`.

- [ ] **Step 4: Add source image and URL result tests**

Extend tests:

```ts
test('doubao adapter includes source image for edit mode', async () => {
  const requests: Record<string, unknown>[] = [];
  const adapter = createDoubaoImageProviderAdapter({
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), { status: 200 });
    },
    readEnv: () => 'test-key',
  });

  await adapter.runImage({
    runId: 'run-1',
    userId: 'user-1',
    model: makeResolvedImageModel(),
    mode: 'edit',
    prompt: '改成水墨风',
    sourceImageDataUrl: 'data:image/png;base64,SOURCE',
  });

  assert.equal(requests[0]?.image, 'data:image/png;base64,SOURCE');
});
```

If URL fetching is implemented in the adapter, test it with a mocked fetch returning image bytes; if URL fetching is implemented in run service, leave URL parse as safe metadata and cover conversion in Task 5.

- [ ] **Step 5: Run adapter tests**

Run:

```bash
pnpm exec tsx --test src/server/ai/image-provider-adapters.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add src/server/ai/image-provider-adapters.ts src/server/ai/image-provider-adapters.test.ts
git commit -m "feat: add doubao image provider adapter"
```

## Task 5: Image Runtime Validation, Orchestration, And Billing

**Files:**
- Modify: `src/app/api/agent/runs/route.ts`
- Modify: `src/app/api/agent/runs/route.test.ts`
- Modify: `src/server/billing/credits.ts`
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`

- [ ] **Step 1: Write failing route validation tests**

In `src/app/api/agent/runs/route.test.ts`, add parser tests:

```ts
test('parseCreateAgentRunRawBody requires modelId for image requests', () => {
  assert.throws(
    () => parseCreateAgentRunRawBody({ taskType: 'image', prompt: '山水', input: { mode: 'generate' } }),
    /modelId is required/,
  );
});

test('parseCreateAgentRunRawBody requires source image for edit mode', () => {
  assert.throws(
    () =>
      parseCreateAgentRunRawBody({
        taskType: 'image',
        prompt: '水墨风',
        modelId: 'model-1',
        input: { mode: 'edit' },
      }),
    /source image is required/,
  );
});
```

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
```

Expected: FAIL because image model/mode/source validation is missing.

- [ ] **Step 3: Implement route validation**

In `route.ts`, add an image input schema and `superRefine` checks:

```ts
const imageModeSchema = z.enum(['generate', 'edit', 'upscale']);

const sourceImageDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/, 'source image must be a supported data URL.');
```

For `taskType === 'image'`:

- require `modelId`;
- require valid `input.mode`;
- require `input.sourceImageDataUrl` for `edit` and `upscale`;
- reject source image data URL above the selected MVP limit.

- [ ] **Step 4: Write failing billing helper test**

In the existing credit tests if present, or in `src/server/agent/run-service.test.ts` with injected debit helper, add a service-level assertion that image billing amount equals `minimumCredits` and uses image billing status. If a focused billing test file exists, add:

```ts
test('calculateImageCreditCost uses pricing minimum', () => {
  assert.equal(calculateImageCreditCost({ pricing: { unit: 'token', promptCreditsPer1k: 99, completionCreditsPer1k: 99, minimumCredits: 5 } }), 5);
});
```

- [ ] **Step 5: Implement image billing helper**

In `src/server/billing/credits.ts`, add:

```ts
export function calculateImageCreditCost(input: { pricing: AiModelPricing }) {
  return input.pricing.minimumCredits;
}

export async function debitForImageAgentRun(input: {
  userId: string;
  runId: string;
  pricing: AiModelPricing;
  modelSnapshot: ResolvedImageModel | Record<string, unknown>;
  metadata: Record<string, unknown>;
}): Promise<CreditLedgerDebitResult & { amount: number }> {
  const amount = calculateImageCreditCost({ pricing: input.pricing });
  // mirror debitForAgentRun with idempotencyKey `agent-run:${input.runId}:image-usage`
}
```

- [ ] **Step 6: Write failing run service tests**

In `src/server/agent/run-service.test.ts`, add:

```ts
test('image run resolves selected model, returns transient image, persists no media, and bills minimum credits', async () => {
  const debits: Array<{ amount: number; metadata: Record<string, unknown> }> = [];
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: createDeterministicPiRuntime(),
    resolveImageModelForUser: async () => makeResolvedImageModel({ pricing: { ...defaultPricing, minimumCredits: 7 } }),
    createImageProviderAdapter: () => ({
      kind: 'development',
      async runImage() {
        return {
          finalMessage: '图片已生成',
          artifacts: [
            {
              kind: 'image',
              title: '生成图',
              body: 'data:image/png;base64,RESULT',
              url: null,
              metadata: { mimeType: 'image/png', filename: 'result.png' },
            },
          ],
          rawMetadata: { provider: 'test' },
        };
      },
    }),
    debitForImageAgentRun: async (input) => {
      debits.push({ amount: input.amount, metadata: input.metadata });
      return { entryId: 'ledger-1', balanceAfter: 100 };
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山水',
    modelId: 'model-1',
    input: { mode: 'generate', size: '1024x1024' },
  });

  assert.equal(result.transientArtifacts[0]?.dataUrl, 'data:image/png;base64,RESULT');
  assert.equal(result.run.artifacts[0]?.body, null);
  assert.equal(result.run.artifacts[0]?.url, null);
  assert.equal(result.run.billing?.creditCost, 7);
  assert.equal(debits.length, 1);
});
```

- [ ] **Step 7: Run service tests and verify failure**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected: FAIL because image runtime dependencies do not exist.

- [ ] **Step 8: Implement selected-model image orchestration**

In `run-service.ts`:

- add dependencies `resolveImageModelForUser`, `createImageProviderAdapter`, `debitForImageAgentRun`;
- branch `taskType === 'image'` before default capability runtime;
- create image capability snapshot similar to chat snapshot;
- sanitize source image out of durable input;
- call adapter synchronously and return completed run with transient artifacts;
- persist durable media summaries using existing `splitTransientArtifacts`;
- update billing snapshot with image debit result;
- on validation/provider/billing failure, mark failed and avoid credit duplicates.

- [ ] **Step 9: Run focused runtime tests**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts src/server/agent/run-service.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 5**

Run:

```bash
git add src/app/api/agent/runs/route.ts src/app/api/agent/runs/route.test.ts src/server/billing/credits.ts src/server/agent/run-service.ts src/server/agent/run-service.test.ts
git commit -m "feat: route image runs through selected models"
```

## Task 6: User `/image-gen` UI Closure

**Files:**
- Modify: `src/app/image-gen/page.tsx`
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Write failing client submit contract tests**

In `agent-runtime-client.test.ts`, add a test that `createAgentRun` accepts image `modelId` and mode input and preserves `transientArtifacts`:

```ts
test('createAgentRun submits image model and mode input', async () => {
  const requests: unknown[] = [];
  const restore = installFetchMock(
    { run: makeRun({ taskType: 'image' }), transientArtifacts: [] },
    { captureJsonBodies: requests },
  );

  try {
    await createAgentRun({
      taskType: 'image',
      prompt: '山水',
      modelId: 'model-1',
      input: { mode: 'generate', size: '1024x1024' },
    });
  } finally {
    restore();
  }

  assert.deepEqual(requests[0], {
    taskType: 'image',
    prompt: '山水',
    modelId: 'model-1',
    input: { mode: 'generate', size: '1024x1024' },
  });
});
```

- [ ] **Step 2: Run client tests**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected: PASS or FAIL only for missing test helpers that need local adjustment.

- [ ] **Step 3: Replace static model state in `/image-gen`**

In `src/app/image-gen/page.tsx`:

- import `listImageModels`, `selectImageModelId`, and `type ImageModelMode`;
- keep static `styleOptions` and `toolSizes`;
- remove `imageModels` and `hdModels` as runtime model sources;
- maintain per-mode model arrays and loading/error state;
- fetch models whenever active mode changes and user is logged in/active;
- choose default with `selectImageModelId`.

- [ ] **Step 4: Add source image upload helper state**

Add local state:

```ts
const [sourceImage, setSourceImage] = useState<{
  dataUrl: string;
  name: string;
  mimeType: string;
  byteLength: number;
} | null>(null);
```

Add file validation:

- allowed MIME: `image/png`, `image/jpeg`, `image/webp`;
- max MVP size from the route limit;
- FileReader to data URL;
- local preview in HD repair and style-transfer tabs.

- [ ] **Step 5: Submit all three image modes**

Map tabs:

```ts
const modeByTab = {
  generate: 'generate',
  'hd-fix': 'upscale',
  'style-transfer': 'edit',
} satisfies Record<string, ImageModelMode>;
```

Pass:

```ts
await createAgentRun({
  taskType: 'image',
  prompt: runPrompt,
  modelId: selectedModelId,
  input: {
    mode,
    size: selectedSize,
    scale: mode === 'upscale' ? hdScale : undefined,
    style: mode === 'edit' ? selectedStyle : undefined,
    sourceImageDataUrl: mode === 'generate' ? undefined : sourceImage?.dataUrl,
  },
});
```

Reject submit when no model exists or required source image is absent.

- [ ] **Step 6: Preserve transient result and stale-state behavior**

Clear `generatedImage`, `generationMessage`, and `generationError` when starting a generation. On mode switch, clear stale generated image and incompatible upload errors. Keep download/copy prompt behavior unchanged.

- [ ] **Step 7: Run client tests and type check for page**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
pnpm ts-check
```

Expected: client tests PASS. `pnpm ts-check` may reveal unrelated existing repository errors; fix errors introduced by this task only.

- [ ] **Step 8: Commit Task 6**

Run:

```bash
git add src/app/image-gen/page.tsx src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: close user image generation ui loop"
```

## Task 7: End-To-End Focused Verification And OpenSpec Task Closure

**Files:**
- Modify: `openspec/changes/doubao-image-generation-loop/tasks.md`
- Create: `docs/superpowers/verification/2026-06-01-doubao-image-generation-loop.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec tsx --test \
  src/server/repositories/ai-models.test.ts \
  src/server/ai/image-provider-adapters.test.ts \
  src/app/api/agent/image-models/route.test.ts \
  src/app/api/agent/runs/route.test.ts \
  src/server/agent/run-service.test.ts \
  src/features/public/agent-runtime-client.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
pnpm build
```

Expected: PASS. If blocked by missing infrastructure or unrelated existing errors, capture exact output and verify changed files with focused tests.

- [ ] **Step 3: Browser verify `/image-gen`**

Start dev server if needed:

```bash
pnpm dev
```

Verify `/image-gen`:

- unauthenticated/login state still renders;
- active account with image models can see server-driven model options;
- `AI生图` submit renders transient image result when API is mocked or local development provider is available;
- `高清修复` and `图片换风格` require upload before submit;
- generated image warning and download button render.

If auth/database state blocks this, record the blocker exactly.

- [ ] **Step 4: Write verification report**

Create `docs/superpowers/verification/2026-06-01-doubao-image-generation-loop.md` with:

```md
# Doubao Image Generation Loop Verification

Change: `doubao-image-generation-loop`
Date: 2026-06-01

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test ...` | PASS/FAIL | ... |
| `pnpm build` | PASS/FAIL/BLOCKED | ... |

## Browser Verification

- Route:
- Method:
- Result:
- Screenshot path if captured:

## Invariants Checked

- Management-configured image models are the user source.
- Runtime rechecks mode support and entitlement.
- Uploaded and generated image media are not persisted.
- Successful image billing is idempotent and tied to the run.
- Failed image requests do not charge credits.

## Known Constraints

- ...
```

- [ ] **Step 5: Mark OpenSpec tasks complete**

Update `openspec/changes/doubao-image-generation-loop/tasks.md` from `- [ ]` to `- [x]` only for completed work.

- [ ] **Step 6: Commit Task 7**

Run:

```bash
git add openspec/changes/doubao-image-generation-loop/tasks.md docs/superpowers/verification/2026-06-01-doubao-image-generation-loop.md
git commit -m "docs: verify doubao image generation loop"
```

## Self-Review

Spec coverage:

- `ai-model-billing`: Tasks 1, 3, 4, 5, 7 cover model configuration, availability, runtime entitlement, Doubao execution, billing, and audit metadata.
- `public-product-experience`: Tasks 3, 6, 7 cover server-driven model selection, uploads, transient result rendering, and unavailable/error states.
- `user-agent-runtime`: Tasks 4, 5, 7 cover selected image model routing, source validation, transient outputs, billing, and no media persistence.
- `admin-management-console`: Tasks 1, 2 cover model capability/default visibility and admin mutation paths.

Placeholder scan: no placeholder tasks or unspecified implementation steps remain.

Type consistency: `ImageModelMode`, `PublicImageModelDto`, `ResolvedImageModel`, `listAvailableImageModelsForUser`, and `resolveImageModelForUser` are introduced before later tasks depend on them.
