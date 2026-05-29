---
change: real-ai-chat-model-billing
design-doc: docs/superpowers/specs/2026-05-29-real-ai-chat-model-billing-design.md
base-ref: 392fdee4ecda2bc14534263868f23f587c7e519f
---

# Real AI Chat Model Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins configure real AI providers/models, let users choose only entitlement-eligible chat models, execute chat through selected providers, and debit credits from usage.

**Architecture:** Add typed provider/model/entitlement/ledger storage beside the existing agent runtime, then route chat through a model catalog and provider adapter before completing `agent_runs`. User-facing model lists and runtime execution must share the same entitlement resolver so client state cannot bypass membership or benefit gates.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM/PostgreSQL, Zod, Node test runner via `tsx --test`, existing admin module components, React client pages.

---

## File Structure

- `src/server/db/schema.ts`: add provider/model/requirement/ledger enums and tables.
- `drizzle/*.sql` and `drizzle/meta/*`: generated migration artifacts from `pnpm db:generate`.
- `src/server/ai/model-entitlements.ts`: pure entitlement evaluation and database-backed user entitlement loading helpers.
- `src/server/ai/model-entitlements.test.ts`: entitlement allow/deny/expiry tests.
- `src/server/repositories/ai-models.ts`: provider/model admin data, seed data, entitlement-filtered user model lookup, and model resolution.
- `src/server/repositories/ai-models.test.ts`: model catalog tests.
- `src/server/ai/provider-adapters.ts`: OpenAI-compatible and development chat adapters.
- `src/server/ai/provider-adapters.test.ts`: adapter request/response normalization tests.
- `src/server/billing/credits.ts`: credit balance, pricing, idempotent debit helpers.
- `src/server/billing/credits.test.ts`: pricing and debit idempotency tests.
- `src/server/agent/types.ts`: extend run DTOs with selected model, usage, and billing metadata.
- `src/server/agent/run-service.ts`: route chat through selected model, entitlement authorization, provider adapter, and billing.
- `src/server/agent/run-service.test.ts`: selected-model runtime and failure tests.
- `src/app/api/agent/chat-models/route.ts`: authenticated entitled model-list endpoint.
- `src/app/api/agent/runs/route.ts`: accept `modelId` for chat and map domain errors to stable codes.
- `src/app/api/agent/runs/route.test.ts`: request parsing and error-shape tests.
- `src/features/public/agent-runtime-client.ts`: add `listChatModels`, `modelId` request field, and typed API errors.
- `src/app/chat/page.tsx`: load model options, select valid default, submit `modelId`, render billing and entitlement states.
- `src/features/admin/admin-nav.tsx`: add AI models navigation.
- `src/server/repositories/ai-model-admin.ts` or `src/server/repositories/ai-models.ts`: admin table data; keep in one file if under 350 lines.
- `src/app/admin/(console)/ai-models/page.tsx`: provider/model/pricing/entitlement management view.
- `src/features/admin/admin-action-controls.tsx`: add enable/disable controls if reused pattern fits.
- `src/server/repositories/ai-jobs.ts`: include selected model, usage, credit cost, and billing status in review rows.
- `openspec/changes/real-ai-chat-model-billing/tasks.md`: check off tasks after implementation slices land.

## Task 1: Data Model, Types, And Entitlement Evaluation

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/ai/model-entitlements.ts`
- Create: `src/server/ai/model-entitlements.test.ts`
- Modify: `src/server/agent/types.ts`
- Generate: `drizzle/*.sql`

- [ ] **Step 1: Write entitlement resolver tests**

Create `src/server/ai/model-entitlements.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateModelEntitlement,
  type ActiveUserEntitlement,
  type ModelEntitlementRequirement,
} from './model-entitlements';

const activePlanEntitlement: ActiveUserEntitlement = {
  planCode: 'pro-monthly',
  benefitCode: null,
  source: 'membership',
  expiresAt: null,
};

const expiredPlanEntitlement: ActiveUserEntitlement = {
  planCode: 'pro-monthly',
  benefitCode: null,
  source: 'membership',
  expiresAt: '2026-01-01T00:00:00.000Z',
};

test('evaluateModelEntitlement allows free model', () => {
  const result = evaluateModelEntitlement({
    requirements: [{ type: 'none', value: null, label: 'Free' }],
    entitlements: [],
    now: new Date('2026-05-29T00:00:00.000Z'),
  });

  assert.deepEqual(result, {
    allowed: true,
    basis: 'none',
    label: 'Free',
    value: null,
  });
});

test('evaluateModelEntitlement allows active membership plan requirement', () => {
  const result = evaluateModelEntitlement({
    requirements: [{ type: 'membership_plan', value: 'pro-monthly', label: 'Pro' }],
    entitlements: [activePlanEntitlement],
    now: new Date('2026-05-29T00:00:00.000Z'),
  });

  assert.equal(result.allowed, true);
  assert.equal(result.basis, 'membership_plan');
  assert.equal(result.value, 'pro-monthly');
});

test('evaluateModelEntitlement rejects expired membership plan requirement', () => {
  const result = evaluateModelEntitlement({
    requirements: [{ type: 'membership_plan', value: 'pro-monthly', label: 'Pro' }],
    entitlements: [expiredPlanEntitlement],
    now: new Date('2026-05-29T00:00:00.000Z'),
  });

  assert.equal(result.allowed, false);
  assert.equal(result.basis, 'none');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/server/ai/model-entitlements.test.ts
```

Expected: FAIL because `src/server/ai/model-entitlements.ts` does not exist.

- [ ] **Step 3: Implement entitlement types and evaluator**

Create `src/server/ai/model-entitlements.ts` with:

```ts
import { and, eq, gt, isNull, or } from 'drizzle-orm';

import { db, schema } from '@/server/db';

export type ModelEntitlementRequirement = {
  type: 'none' | 'membership_plan' | 'benefit_code' | 'user_grant';
  value: string | null;
  label: string;
};

export type ActiveUserEntitlement = {
  planCode: string | null;
  benefitCode: string | null;
  source: string;
  expiresAt: string | null;
};

export type ModelEntitlementResult = {
  allowed: boolean;
  basis: ModelEntitlementRequirement['type'];
  label: string;
  value: string | null;
};

function isActive(entitlement: ActiveUserEntitlement, now: Date) {
  return !entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > now.getTime();
}

export function evaluateModelEntitlement(input: {
  requirements: ModelEntitlementRequirement[];
  entitlements: ActiveUserEntitlement[];
  now?: Date;
}): ModelEntitlementResult {
  const now = input.now ?? new Date();
  const requirements = input.requirements.length > 0
    ? input.requirements
    : [{ type: 'none', value: null, label: 'Free' } satisfies ModelEntitlementRequirement];

  for (const requirement of requirements) {
    if (requirement.type === 'none') {
      return { allowed: true, basis: 'none', label: requirement.label, value: null };
    }

    const matched = input.entitlements.some((entitlement) => {
      if (!isActive(entitlement, now)) {
        return false;
      }
      if (requirement.type === 'membership_plan') {
        return entitlement.planCode === requirement.value;
      }
      if (requirement.type === 'benefit_code') {
        return entitlement.benefitCode === requirement.value;
      }
      if (requirement.type === 'user_grant') {
        return entitlement.source === 'manual' && entitlement.benefitCode === requirement.value;
      }
      return false;
    });

    if (matched) {
      return {
        allowed: true,
        basis: requirement.type,
        label: requirement.label,
        value: requirement.value,
      };
    }
  }

  return { allowed: false, basis: 'none', label: 'No entitlement', value: null };
}

export async function listActiveUserEntitlements(userId: string): Promise<ActiveUserEntitlement[]> {
  if (!db || !process.env.DATABASE_URL) {
    return [];
  }

  const rows = await db
    .select({
      planCode: schema.membershipPlans.code,
      benefitCode: schema.benefits.code,
      source: schema.userEntitlements.source,
      expiresAt: schema.userEntitlements.expiresAt,
    })
    .from(schema.userEntitlements)
    .leftJoin(schema.membershipPlans, eq(schema.membershipPlans.id, schema.userEntitlements.planId))
    .leftJoin(schema.benefits, eq(schema.benefits.id, schema.userEntitlements.benefitId))
    .where(
      and(
        eq(schema.userEntitlements.userId, userId),
        or(isNull(schema.userEntitlements.expiresAt), gt(schema.userEntitlements.expiresAt, new Date())),
      ),
    );

  return rows.map((row) => ({
    planCode: row.planCode,
    benefitCode: row.benefitCode,
    source: row.source,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  }));
}
```

- [ ] **Step 4: Extend schema**

Modify `src/server/db/schema.ts`:

```ts
export const aiProviderStatus = pgEnum('ai_provider_status', ['enabled', 'disabled', 'archived']);
export const aiProviderType = pgEnum('ai_provider_type', ['openai_compatible', 'development']);
export const aiModelStatus = pgEnum('ai_model_status', ['enabled', 'disabled', 'archived']);
export const aiModelEntitlementRequirementType = pgEnum('ai_model_entitlement_requirement_type', [
  'none',
  'membership_plan',
  'benefit_code',
  'user_grant',
]);
export const creditLedgerEntryType = pgEnum('credit_ledger_entry_type', [
  'grant',
  'debit',
  'adjustment',
]);
```

Add tables after `agentCapabilities` or before `agentRuns`:

```ts
export const aiProviders = pgTable(
  'ai_providers',
  {
    id,
    code: text('code').notNull(),
    name: text('name').notNull(),
    providerType: aiProviderType('provider_type').notNull(),
    status: aiProviderStatus('status').notNull().default('enabled'),
    baseUrl: text('base_url'),
    credentialEnvKey: text('credential_env_key'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('ai_providers_code_unique_idx').on(table.code),
    index('ai_providers_status_idx').on(table.status),
  ],
);

export const aiModels = pgTable(
  'ai_models',
  {
    id,
    providerId: uuid('provider_id')
      .notNull()
      .references(() => aiProviders.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    model: text('model').notNull(),
    status: aiModelStatus('status').notNull().default('enabled'),
    supportsChat: boolean('supports_chat').notNull().default(false),
    isDefaultChat: boolean('is_default_chat').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    pricing: jsonb('pricing').$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('ai_models_code_unique_idx').on(table.code),
    index('ai_models_provider_id_idx').on(table.providerId),
    index('ai_models_status_idx').on(table.status),
    index('ai_models_chat_idx').on(table.supportsChat),
  ],
);

export const aiModelEntitlementRequirements = pgTable(
  'ai_model_entitlement_requirements',
  {
    id,
    modelId: uuid('model_id')
      .notNull()
      .references(() => aiModels.id, { onDelete: 'cascade' }),
    requirementType: aiModelEntitlementRequirementType('requirement_type').notNull(),
    requirementValue: text('requirement_value'),
    label: text('label').notNull(),
    createdAt: now,
  },
  (table) => [index('ai_model_entitlement_requirements_model_id_idx').on(table.modelId)],
);

export const creditLedgerEntries = pgTable(
  'credit_ledger_entries',
  {
    id,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    runId: uuid('run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    entryType: creditLedgerEntryType('entry_type').notNull(),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after'),
    idempotencyKey: text('idempotency_key').notNull(),
    reason: text('reason').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
  },
  (table) => [
    index('credit_ledger_entries_user_id_idx').on(table.userId),
    uniqueIndex('credit_ledger_entries_idempotency_key_unique_idx').on(table.idempotencyKey),
  ],
);
```

If TypeScript rejects referencing `agentRuns` before declaration, place `creditLedgerEntries` after `agentRuns`.

- [ ] **Step 5: Extend agent DTO types**

Modify `src/server/agent/types.ts`:

```ts
export type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AgentRunSelectedModelDto = {
  id: string;
  code: string;
  name: string;
  providerName: string;
  entitlementLabel: string;
};

export type AgentRunBillingDto = {
  status: 'not_required' | 'pending' | 'billed' | 'failed';
  creditCost: number | null;
  ledgerEntryId: string | null;
};
```

Add optional fields to `AgentRunDto`:

```ts
selectedModel?: AgentRunSelectedModelDto | null;
usage?: AiUsage | null;
billing?: AgentRunBillingDto | null;
```

- [ ] **Step 6: Run tests and generate migration**

Run:

```bash
pnpm exec tsx --test src/server/ai/model-entitlements.test.ts
pnpm run db:generate
pnpm run ts-check
```

Expected: entitlement tests pass, Drizzle migration is generated, typecheck passes.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/schema.ts src/server/agent/types.ts src/server/ai/model-entitlements.ts src/server/ai/model-entitlements.test.ts drizzle
git commit -m "feat: add AI model entitlement schema"
```

## Task 2: Model Catalog Repository And Credit Billing

**Files:**
- Create: `src/server/repositories/ai-models.ts`
- Create: `src/server/repositories/ai-models.test.ts`
- Create: `src/server/billing/credits.ts`
- Create: `src/server/billing/credits.test.ts`
- Modify: `src/server/db/seed.ts`

- [ ] **Step 1: Write model catalog and billing tests**

Create `src/server/repositories/ai-models.test.ts` with seed-backed tests:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSeedChatModelsForUser,
  resolveSeedChatModelForUser,
} from './ai-models';

test('getSeedChatModelsForUser returns free model for users without entitlements', async () => {
  const models = await getSeedChatModelsForUser('user-free', []);

  assert.equal(models.some((model) => model.code === 'dev-free-chat'), true);
  assert.equal(models.some((model) => model.code === 'dev-pro-chat'), false);
});

test('resolveSeedChatModelForUser rejects premium model without entitlement', async () => {
  await assert.rejects(
    () => resolveSeedChatModelForUser('user-free', 'seed-model-pro', []),
    /Model entitlement is required/,
  );
});
```

Create `src/server/billing/credits.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateChatCreditCost, createMemoryCreditLedger } from './credits';

test('calculateChatCreditCost rounds up and respects minimum', () => {
  assert.equal(
    calculateChatCreditCost({
      usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      pricing: { unit: 'token', promptCreditsPer1k: 1, completionCreditsPer1k: 2, minimumCredits: 3 },
    }),
    3,
  );
});

test('memory ledger debit is idempotent by key', async () => {
  const ledger = createMemoryCreditLedger({ 'user-1': 10 });
  const first = await ledger.debit({
    userId: 'user-1',
    amount: 4,
    idempotencyKey: 'agent-run:run-1:usage',
    reason: 'chat usage',
    metadata: {},
  });
  const second = await ledger.debit({
    userId: 'user-1',
    amount: 4,
    idempotencyKey: 'agent-run:run-1:usage',
    reason: 'chat usage',
    metadata: {},
  });

  assert.equal(first.entryId, second.entryId);
  assert.equal(second.balanceAfter, 6);
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts src/server/billing/credits.test.ts
```

Expected: FAIL because implementation files do not exist.

- [ ] **Step 3: Implement `ai-models` repository**

Create `src/server/repositories/ai-models.ts` with:

```ts
import { and, asc, eq } from 'drizzle-orm';

import {
  evaluateModelEntitlement,
  listActiveUserEntitlements,
  type ActiveUserEntitlement,
  type ModelEntitlementResult,
  type ModelEntitlementRequirement,
} from '@/server/ai/model-entitlements';
import { db, schema } from '@/server/db';

export type AiModelPricing = {
  unit: 'token';
  promptCreditsPer1k: number;
  completionCreditsPer1k: number;
  minimumCredits: number;
};

export type PublicChatModelDto = {
  id: string;
  code: string;
  name: string;
  providerName: string;
  isDefault: boolean;
  entitlementLabel: string;
  pricingSummary: string;
};

export type ResolvedChatModel = PublicChatModelDto & {
  providerId: string;
  providerCode: string;
  providerType: 'openai_compatible' | 'development';
  baseUrl: string | null;
  credentialEnvKey: string | null;
  model: string;
  pricing: AiModelPricing;
  entitlement: ModelEntitlementResult;
};

export class ModelNotAvailableError extends Error {
  constructor(message = 'Model is not available.') {
    super(message);
    this.name = 'ModelNotAvailableError';
  }
}

export class ModelEntitlementRequiredError extends Error {
  constructor() {
    super('Model entitlement is required.');
    this.name = 'ModelEntitlementRequiredError';
  }
}

const defaultPricing: AiModelPricing = {
  unit: 'token',
  promptCreditsPer1k: 1,
  completionCreditsPer1k: 2,
  minimumCredits: 1,
};

const seedModels: ResolvedChatModel[] = [
  {
    id: 'seed-model-free',
    code: 'dev-free-chat',
    name: 'Development Free Chat',
    providerName: 'Development',
    isDefault: true,
    entitlementLabel: 'Free',
    pricingSummary: '1 credit minimum',
    providerId: 'seed-provider-development',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-free-chat',
    pricing: defaultPricing,
    entitlement: { allowed: true, basis: 'none', label: 'Free', value: null },
  },
  {
    id: 'seed-model-pro',
    code: 'dev-pro-chat',
    name: 'Development Pro Chat',
    providerName: 'Development',
    isDefault: false,
    entitlementLabel: 'Pro',
    pricingSummary: '2 credits minimum',
    providerId: 'seed-provider-development',
    providerCode: 'development',
    providerType: 'development',
    baseUrl: null,
    credentialEnvKey: null,
    model: 'development-pro-chat',
    pricing: { unit: 'token', promptCreditsPer1k: 2, completionCreditsPer1k: 4, minimumCredits: 2 },
    entitlement: { allowed: true, basis: 'membership_plan', label: 'Pro', value: 'pro-monthly' },
  },
];

export async function getSeedChatModelsForUser(
  _userId: string,
  entitlements: ActiveUserEntitlement[],
): Promise<PublicChatModelDto[]> {
  return seedModels
    .filter((model) => {
      if (model.entitlement.basis === 'none') {
        return true;
      }
      return evaluateModelEntitlement({
        requirements: [{ type: model.entitlement.basis, value: model.entitlement.value, label: model.entitlement.label }],
        entitlements,
      }).allowed;
    })
    .map(toPublicModel);
}

export async function resolveSeedChatModelForUser(
  userId: string,
  modelId: string,
  entitlements: ActiveUserEntitlement[],
): Promise<ResolvedChatModel> {
  const model = seedModels.find((item) => item.id === modelId);
  if (!model) {
    throw new ModelNotAvailableError();
  }
  const allowed = await getSeedChatModelsForUser(userId, entitlements);
  if (!allowed.some((item) => item.id === modelId)) {
    throw new ModelEntitlementRequiredError();
  }
  return structuredClone(model);
}

function toPublicModel(model: ResolvedChatModel): PublicChatModelDto {
  return {
    id: model.id,
    code: model.code,
    name: model.name,
    providerName: model.providerName,
    isDefault: model.isDefault,
    entitlementLabel: model.entitlementLabel,
    pricingSummary: model.pricingSummary,
  };
}

export async function listAvailableChatModelsForUser(userId: string): Promise<PublicChatModelDto[]> {
  const entitlements = await listActiveUserEntitlements(userId);
  if (!db || !process.env.DATABASE_URL) {
    return getSeedChatModelsForUser(userId, entitlements);
  }
  // Database implementation joins providers, models, and requirements, then applies evaluateModelEntitlement.
  const rows = await db
    .select({
      model: schema.aiModels,
      provider: schema.aiProviders,
      requirement: schema.aiModelEntitlementRequirements,
    })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiProviders.id, schema.aiModels.providerId))
    .leftJoin(schema.aiModelEntitlementRequirements, eq(schema.aiModelEntitlementRequirements.modelId, schema.aiModels.id))
    .where(and(
      eq(schema.aiModels.status, 'enabled'),
      eq(schema.aiModels.supportsChat, true),
      eq(schema.aiProviders.status, 'enabled'),
    ))
    .orderBy(asc(schema.aiModels.sortOrder), asc(schema.aiModels.createdAt));

  return groupResolvedRows(rows, entitlements).filter((model) => model.entitlement.allowed).map(toPublicModel);
}

export async function resolveChatModelForUser(userId: string, modelId: string): Promise<ResolvedChatModel> {
  const entitlements = await listActiveUserEntitlements(userId);
  if (!db || !process.env.DATABASE_URL) {
    return resolveSeedChatModelForUser(userId, modelId, entitlements);
  }
  const models = groupResolvedRows(await loadDatabaseChatModelRows(modelId), entitlements);
  const model = models.find((item) => item.id === modelId);
  if (!model) {
    throw new ModelNotAvailableError();
  }
  if (!model.entitlement.allowed) {
    throw new ModelEntitlementRequiredError();
  }
  return model;
}
```

Then add local helpers `parsePricing`, `pricingSummary`, `groupResolvedRows`, and `loadDatabaseChatModelRows` in the same file. Keep the file under control by moving helpers to `src/server/ai/model-pricing.ts` if it exceeds 350 lines.

- [ ] **Step 4: Implement credit billing service**

Create `src/server/billing/credits.ts` with:

```ts
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { db, schema } from '@/server/db';
import type { AiUsage } from '@/server/agent/types';
import type { AiModelPricing } from '@/server/repositories/ai-models';

export class InsufficientCreditsError extends Error {
  constructor() {
    super('Insufficient credits.');
    this.name = 'InsufficientCreditsError';
  }
}

export function calculateChatCreditCost(input: {
  usage: AiUsage;
  pricing: AiModelPricing;
}) {
  return Math.max(
    input.pricing.minimumCredits,
    Math.ceil(
      (input.usage.promptTokens / 1000) * input.pricing.promptCreditsPer1k +
        (input.usage.completionTokens / 1000) * input.pricing.completionCreditsPer1k,
    ),
  );
}

export function createMemoryCreditLedger(initialBalances: Record<string, number>) {
  const balances = new Map(Object.entries(initialBalances));
  const entries = new Map<string, { entryId: string; balanceAfter: number }>();

  return {
    async getBalance(userId: string) {
      return balances.get(userId) ?? 0;
    },
    async debit(input: {
      userId: string;
      amount: number;
      idempotencyKey: string;
      reason: string;
      metadata: Record<string, unknown>;
    }) {
      const existing = entries.get(input.idempotencyKey);
      if (existing) {
        return existing;
      }
      const balance = balances.get(input.userId) ?? 0;
      if (balance < input.amount) {
        throw new InsufficientCreditsError();
      }
      const result = { entryId: randomUUID(), balanceAfter: balance - input.amount };
      balances.set(input.userId, result.balanceAfter);
      entries.set(input.idempotencyKey, result);
      return result;
    },
  };
}
```

Add database implementations after the memory implementation:
- `getCreditBalance(userId)`: sum `credit_ledger_entries.amount`, and bridge `users.metadata.credits` if ledger sum is zero.
- `assertCanAffordMinimum(userId, pricing)`.
- `debitForAgentRun(...)`: uses `idempotencyKey`, inserts debit with negative amount, returns existing entry if key already exists.

- [ ] **Step 5: Seed development provider/model data**

Modify `src/server/db/seed.ts` imports and ids, then insert:

```ts
await db.insert(aiProviders).values({
  id: ids.aiProviderDevelopment,
  code: 'development',
  name: 'Development Provider',
  providerType: 'development',
  status: 'enabled',
}).onConflictDoUpdate({
  target: aiProviders.id,
  set: { status: 'enabled', updatedAt: new Date() },
});
```

Insert a free model and a pro model with requirement rows. Use deterministic UUIDs in the existing `ids` object.

- [ ] **Step 6: Run tests**

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts src/server/billing/credits.test.ts
pnpm run ts-check
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit**

```bash
git add src/server/repositories/ai-models.ts src/server/repositories/ai-models.test.ts src/server/billing/credits.ts src/server/billing/credits.test.ts src/server/db/seed.ts
git commit -m "feat: add AI model catalog and credit ledger"
```

## Task 3: Provider Adapters And Agent Run Service

**Files:**
- Create: `src/server/ai/provider-adapters.ts`
- Create: `src/server/ai/provider-adapters.test.ts`
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`
- Modify: `src/server/repositories/agent-runs.ts`

- [ ] **Step 1: Write adapter tests**

Create `src/server/ai/provider-adapters.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { createDevelopmentChatAdapter, estimateDevelopmentUsage } from './provider-adapters';

test('estimateDevelopmentUsage returns positive usage', () => {
  const usage = estimateDevelopmentUsage('hello world');

  assert.equal(usage.promptTokens > 0, true);
  assert.equal(usage.completionTokens > 0, true);
  assert.equal(usage.totalTokens, usage.promptTokens + usage.completionTokens);
});

test('development adapter marks deterministic metadata', async () => {
  const adapter = createDevelopmentChatAdapter();
  const result = await adapter.runChat({
    runId: 'run-1',
    userId: 'user-1',
    model: {
      id: 'seed-model-free',
      code: 'dev-free-chat',
      name: 'Development Free Chat',
      providerName: 'Development',
      isDefault: true,
      entitlementLabel: 'Free',
      pricingSummary: '1 credit minimum',
      providerId: 'seed-provider-development',
      providerCode: 'development',
      providerType: 'development',
      baseUrl: null,
      credentialEnvKey: null,
      model: 'development-free-chat',
      pricing: { unit: 'token', promptCreditsPer1k: 1, completionCreditsPer1k: 2, minimumCredits: 1 },
      entitlement: { allowed: true, basis: 'none', label: 'Free', value: null },
    },
    messages: [{ role: 'user', content: 'hello' }],
  });

  assert.match(result.finalMessage, /Development/);
  assert.equal(result.rawMetadata.developmentFallback, true);
});
```

- [ ] **Step 2: Implement provider adapters**

Create `src/server/ai/provider-adapters.ts`:

```ts
import type { AiUsage } from '@/server/agent/types';
import type { ResolvedChatModel } from '@/server/repositories/ai-models';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatProviderRequest = {
  runId: string;
  userId: string;
  model: ResolvedChatModel;
  messages: ChatMessage[];
};

export type ChatProviderResult = {
  finalMessage: string;
  usage: AiUsage;
  rawMetadata: Record<string, unknown>;
};

export type ChatProviderAdapter = {
  runChat(request: ChatProviderRequest): Promise<ChatProviderResult>;
};

export class ProviderConfigurationError extends Error {
  constructor(message = 'Provider is not configured.') {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}

export function estimateDevelopmentUsage(text: string): AiUsage {
  const promptTokens = Math.max(1, Math.ceil(text.length / 4));
  const completionTokens = Math.max(8, Math.ceil(promptTokens * 0.6));
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

export function createDevelopmentChatAdapter(): ChatProviderAdapter {
  return {
    async runChat(request) {
      const prompt = request.messages.at(-1)?.content ?? '';
      const finalMessage = `Development ${request.model.providerCode}/${request.model.model}: ${prompt}`;
      return {
        finalMessage,
        usage: estimateDevelopmentUsage(prompt),
        rawMetadata: { developmentFallback: true },
      };
    },
  };
}
```

Add `createOpenAiCompatibleChatAdapter(fetchImpl = fetch)` and `createChatProviderAdapter(model)`:
- Require `model.baseUrl` and `model.credentialEnvKey`.
- Read key from `process.env[credentialEnvKey]`.
- POST to `${baseUrl.replace(/\/$/, '')}/chat/completions`.
- Parse `choices[0].message.content` and `usage.prompt_tokens`, `usage.completion_tokens`, `usage.total_tokens`.
- Throw `ProviderConfigurationError` when key/base URL missing in production or provider is not configured.

- [ ] **Step 3: Extend run repository metadata mapping**

Modify `src/server/repositories/agent-runs.ts` so `toAgentRunDtoFromDatabase` and memory `toAgentRunDto` extract optional `selectedModel`, `usage`, and `billing` from `capabilitySnapshot` or `input`. Keep old runs readable by returning `null` when metadata is absent.

- [ ] **Step 4: Update run-service tests**

Add tests to `src/server/agent/run-service.test.ts`:

```ts
test('createAndRunAgentRun routes chat through selected model and bills usage', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    chatAdapter: createDevelopmentChatAdapter(),
    creditLedger: createMemoryCreditLedger({ 'user-1': 10 }),
  });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
    input: {},
  });

  assert.equal(run.status, 'succeeded');
  assert.equal(run.selectedModel?.id, 'seed-model-free');
  assert.equal(run.billing?.status, 'billed');
});
```

- [ ] **Step 5: Update run service**

Modify `src/server/agent/run-service.ts`:
- Add `modelId?: string` to `CreateAndRunAgentRunInput`.
- For `taskType === 'chat'`, require `modelId`.
- Resolve model with `resolveChatModelForUser(userId, modelId)`.
- Run minimum credit preflight.
- Create run with selected provider/model snapshot.
- Call `chatAdapter.runChat`.
- Debit credits by usage.
- Complete run with final message and metadata artifact.
- Preserve existing default bundle path for non-chat tasks.

- [ ] **Step 6: Run focused tests**

```bash
pnpm exec tsx --test src/server/ai/provider-adapters.test.ts src/server/agent/run-service.test.ts
pnpm run ts-check
```

Expected: provider adapter and run service tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/server/ai/provider-adapters.ts src/server/ai/provider-adapters.test.ts src/server/agent/run-service.ts src/server/agent/run-service.test.ts src/server/repositories/agent-runs.ts
git commit -m "feat: execute chat through selected AI model"
```

## Task 4: User And Admin APIs

**Files:**
- Create: `src/app/api/agent/chat-models/route.ts`
- Modify: `src/app/api/agent/runs/route.ts`
- Modify: `src/app/api/agent/runs/route.test.ts`
- Create: `src/app/api/admin/ai-models/route.ts` if mutations are implemented through API.
- Modify: `src/server/repositories/ai-jobs.ts`

- [x] **Step 1: Update route parsing tests**

Modify `src/app/api/agent/runs/route.test.ts`:

```ts
test('parseCreateAgentRunBody requires modelId for chat request', () => {
  assert.throws(
    () => parseCreateAgentRunBody({ taskType: 'chat', prompt: 'hello' }),
    /modelId is required/,
  );
});

test('parseCreateAgentRunBody accepts chat modelId', () => {
  const parsed = parseCreateAgentRunBody({
    taskType: 'chat',
    prompt: 'hello',
    modelId: 'seed-model-free',
  });

  assert.equal(parsed.modelId, 'seed-model-free');
});
```

- [x] **Step 2: Add chat models route**

Create `src/app/api/agent/chat-models/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { listAvailableChatModelsForUser } from '@/server/repositories/ai-models';

export async function GET() {
  try {
    const session = await requireActiveAccount();
    const models = await listAvailableChatModelsForUser(session.user.id);
    return NextResponse.json({ models });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
```

- [x] **Step 3: Update agent runs route**

Modify `src/app/api/agent/runs/route.ts`:
- Add `modelId: z.string().min(1).optional()`.
- `superRefine` to require `modelId` when `taskType === 'chat'`.
- Pass `modelId` to service.
- Map `ModelEntitlementRequiredError` to `{ code: 'model_entitlement_required' }`.
- Map `InsufficientCreditsError` to `{ code: 'insufficient_credits' }`.
- Map `ProviderConfigurationError` to `{ code: 'provider_unconfigured' }`.

- [x] **Step 4: Add admin API or server mutation surface**

Deferred admin mutations to Task 5 because this slice only needs read surfaces; admin UI can use the existing repository data path.

If following the existing admin action pattern, add server actions in `src/features/admin/admin-action-controls.tsx`. If API routes are preferred, create `src/app/api/admin/ai-models/route.ts` with admin session checks and provider/model payload validation. Keep secrets as env key names.

- [x] **Step 5: Extend AI job review metadata**

Modify `src/server/repositories/ai-jobs.ts` to read selected model and billing metadata from agent run snapshots and include it in model/config summaries.

- [x] **Step 6: Run tests**

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
pnpm run ts-check
```

Expected: route tests and typecheck pass.

- [x] **Step 7: Commit**

```bash
git add src/app/api/agent/chat-models/route.ts src/app/api/agent/runs/route.ts src/app/api/agent/runs/route.test.ts src/server/repositories/ai-jobs.ts src/app/api/admin/ai-models
git commit -m "feat: expose entitlement filtered chat model APIs"
```

## Task 5: Admin Model Management UI

**Files:**
- Modify: `src/features/admin/admin-nav.tsx`
- Create: `src/app/admin/(console)/ai-models/page.tsx`
- Modify or create: `src/server/repositories/ai-models.ts`
- Modify: `src/features/admin/admin-action-controls.tsx`

- [ ] **Step 1: Add admin table data types**

In `src/server/repositories/ai-models.ts`, add:

```ts
export type AdminAiModelRow = {
  id: string;
  provider: string;
  code: string;
  name: string;
  model: string;
  status: string;
  supportsChat: boolean;
  isDefaultChat: boolean;
  entitlementSummary: string;
  pricingSummary: string;
  credentialSummary: string;
};
```

Add `getAdminAiModels()` returning `AdminModuleData<AdminAiModelRow>`.

- [ ] **Step 2: Add nav entry**

Modify `src/features/admin/admin-nav.tsx` to import `BrainCircuit` or reuse `Bot`, then add:

```ts
{ href: '/admin/ai-models', label: 'AI 模型', icon: Bot },
```

Place it near `AI 任务` and `Agent 能力`.

- [ ] **Step 3: Create admin page**

Create `src/app/admin/(console)/ai-models/page.tsx` using `AdminModulePage`, `StatusBadge`, and existing table patterns. Columns:
- Provider
- Model
- Status
- Chat/default
- Entitlement
- Pricing
- Credential
- Actions

- [ ] **Step 4: Add enable/disable controls**

If using existing `AdminAgentCapabilityActions` as a pattern, create `AdminAiModelActions` in `src/features/admin/admin-action-controls.tsx` with enable/disable buttons wired to the chosen mutation path.

- [ ] **Step 5: Run checks**

```bash
pnpm run ts-check
pnpm run lint:build
```

Expected: no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/admin-nav.tsx 'src/app/admin/(console)/ai-models/page.tsx' src/features/admin/admin-action-controls.tsx src/server/repositories/ai-models.ts
git commit -m "feat: add admin AI model management"
```

## Task 6: Public Chat Model Selection

**Files:**
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/app/chat/page.tsx`
- Test: existing typecheck plus browser verification.

- [ ] **Step 1: Extend public client**

Modify `src/features/public/agent-runtime-client.ts`:

```ts
export type ChatModelOption = {
  id: string;
  code: string;
  name: string;
  providerName: string;
  isDefault: boolean;
  entitlementLabel: string;
  pricingSummary: string;
};

export type CreateAgentRunRequest = {
  taskType: AgentTaskType;
  prompt: string;
  modelId?: string;
  input?: Record<string, unknown>;
};

export async function listChatModels(): Promise<ChatModelOption[]> {
  const response = await fetch('/api/agent/chat-models', { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? '模型列表加载失败');
  }
  return payload.models ?? [];
}
```

- [ ] **Step 2: Update chat page state**

Modify `src/app/chat/page.tsx`:
- import `listChatModels` and `type ChatModelOption`.
- add `chatModels`, `selectedModelId`, `modelLoading`.
- load models after active account check.
- select `models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? null`.
- disable submit if no selected model.

- [ ] **Step 3: Add selector UI**

Add a compact selector above the input form:

```tsx
{chatModels.length > 0 && (
  <select
    value={selectedModelId ?? ''}
    onChange={(event) => setSelectedModelId(event.target.value)}
    className="mb-2 h-9 rounded-lg border border-black/10 bg-white px-3 text-xs text-[#1d1d1f]"
  >
    {chatModels.map((model) => (
      <option key={model.id} value={model.id}>
        {model.name} · {model.entitlementLabel} · {model.pricingSummary}
      </option>
    ))}
  </select>
)}
```

Use existing visual language; do not introduce large cards.

- [ ] **Step 4: Submit selected model**

Change submit call:

```ts
if (!selectedModelId) {
  setErrorMessage('当前账号没有可用模型');
  return;
}
const run = await createAgentRun({ taskType: 'chat', prompt, modelId: selectedModelId });
```

Render `model_entitlement_required` and `insufficient_credits` errors as normal error text without appending assistant content.

- [ ] **Step 5: Render history metadata**

In `mapRunsToMessages`, append assistant metadata only when available:

```ts
const suffix = run.billing?.creditCost
  ? `\n\n模型：${run.selectedModel?.name ?? run.capabilitySummary.model} · 消耗 ${run.billing.creditCost} 积分`
  : '';
content: `${run.finalMessage}${suffix}`;
```

- [ ] **Step 6: Run checks**

```bash
pnpm run ts-check
pnpm run lint:build
```

Expected: no type or lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/public/agent-runtime-client.ts src/app/chat/page.tsx
git commit -m "feat: let users choose entitled chat models"
```

## Task 7: Verification And OpenSpec Task Closure

**Files:**
- Modify: `openspec/changes/real-ai-chat-model-billing/tasks.md`
- Create: `docs/superpowers/verification/2026-05-29-real-ai-chat-model-billing-verification.md`

- [ ] **Step 1: Run full validation**

```bash
pnpm exec tsx --test src/server/ai/model-entitlements.test.ts src/server/repositories/ai-models.test.ts src/server/billing/credits.test.ts src/server/ai/provider-adapters.test.ts src/server/agent/run-service.test.ts src/app/api/agent/runs/route.test.ts
pnpm run validate
pnpm run build
```

Expected: all tests, validation, and build pass.

- [ ] **Step 2: Browser verify local UI**

Start dev server:

```bash
pnpm dev
```

Open:
- `http://localhost:3000/admin/ai-models`
- `http://localhost:3000/chat`

Verify:
- admin page renders provider/model/entitlement/pricing rows.
- chat page shows entitled model selector.
- no text overlaps at desktop and mobile widths.
- submitting chat with selected development model creates a persisted run and shows billing metadata.

- [ ] **Step 3: Check off OpenSpec tasks**

Update `openspec/changes/real-ai-chat-model-billing/tasks.md` from `- [ ]` to `- [x]` for completed tasks 1.1 through 6.3.

- [ ] **Step 4: Write verification report**

Create `docs/superpowers/verification/2026-05-29-real-ai-chat-model-billing-verification.md`:

```md
# Real AI Chat Model Billing Verification

Change: real-ai-chat-model-billing
Date: 2026-05-29

## Commands

- `pnpm exec tsx --test ...`: pass
- `pnpm run validate`: pass
- `pnpm run build`: pass

## Browser Checks

- `/admin/ai-models`: pass
- `/chat`: pass

## Notes

- Development fallback is marked in run metadata.
- Production requires configured provider credentials.
```

- [ ] **Step 5: Commit**

```bash
git add openspec/changes/real-ai-chat-model-billing/tasks.md docs/superpowers/verification/2026-05-29-real-ai-chat-model-billing-verification.md
git commit -m "chore: verify real AI chat model billing"
```

## Self-Review

- Spec coverage: provider/model configuration, entitlement-filtered user model selection, runtime entitlement enforcement, provider execution, credit billing, admin audit, public chat, and verification are each mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, or unresolved placeholders are intentionally present.
- Type consistency: model DTOs use `modelId`, `ResolvedChatModel`, `AiModelPricing`, `AiUsage`, and optional `AgentRunDto.selectedModel/usage/billing` consistently across tasks.

## Execution Recommendation

Use a worktree because the current repository has unrelated uncommitted changes and this implementation touches many files. Use subagent-driven development because the plan has 7 tasks across independent layers that can be reviewed between commits.
