# Real AI Chat Model Billing Design

Status: draft
Change: `real-ai-chat-model-billing`
Date: 2026-05-29

## Summary

Build a real chat execution path where admins configure AI providers and models, users only see models allowed by their active entitlements, chat requests execute through the selected provider model, and provider usage is converted into credit ledger debits.

The design keeps the existing `agent_runs` runtime shape and adds typed model catalog, entitlement gates, provider adapters, and billing ledger services around it. The public chat page becomes a client of server-filtered model options instead of a hard-coded or mock model selector.

## Current State

- `src/app/api/agent/runs/route.ts` accepts `taskType`, `prompt`, and `input`; it does not accept `modelId`.
- `src/server/agent/run-service.ts` resolves the default agent capability bundle for the task type and always runs the injected runtime.
- The route currently injects `createDeterministicPiRuntime()`, so chat responses are deterministic development output.
- `agent_runs` persists provider/model snapshot columns and a JSON capability snapshot, which is useful for history and audit.
- Membership plans, benefits, and user entitlements already exist in schema, but model access is not tied to those records.
- Admin Agent capabilities exist, but provider/model pricing and credential references are not first-class.
- User credits are surfaced through metadata/admin summaries; there is no auditable credit ledger tied to AI usage.

## Goals

- Admins can configure provider records, model records, entitlement requirements, pricing, and enabled/default state.
- Active users can load only the enabled chat models allowed by their current entitlements.
- Runtime authorization repeats the entitlement check before provider execution.
- Chat requests with valid `modelId` execute through an OpenAI-compatible provider adapter when credentials exist.
- Development fallback is explicit and unavailable in production unless deliberately configured.
- Provider usage is normalized and billed into an idempotent credit ledger debit tied to the run.
- Run history and admin AI review can show selected model, entitlement basis, token usage, credit charge, and billing status.

## Non-Goals

- Streaming responses.
- Real image/video/workflow billing in this change.
- Full secret management UI; provider credentials are referenced by environment variable names.
- Replacing all existing `agent_capabilities` behavior. The new model catalog feeds chat selection while existing capability snapshots remain compatible.
- Complex reservations/holds. This version uses preflight affordability and final transactional debit.

## Data Model

Add provider/model/billing tables beside the existing agent runtime tables.

### `ai_providers`

- `id uuid primary key`
- `code text unique not null`
- `name text not null`
- `provider_type text not null`, initial values include `openai_compatible` and `development`
- `status text not null`, values `enabled`, `disabled`, `archived`
- `base_url text`
- `credential_env_key text`
- `metadata jsonb not null default {}`
- `created_at`, `updated_at`

The database stores secret references, not secret values. `credential_env_key = "OPENAI_API_KEY"` means the server reads `process.env.OPENAI_API_KEY`.

### `ai_models`

- `id uuid primary key`
- `provider_id uuid not null references ai_providers`
- `code text unique not null`
- `name text not null`
- `model text not null`
- `status text not null`, values `enabled`, `disabled`, `archived`
- `supports_chat boolean not null default false`
- `is_default_chat boolean not null default false`
- `sort_order integer not null default 0`
- `pricing jsonb not null default {}`
- `metadata jsonb not null default {}`
- `created_at`, `updated_at`

Pricing JSON is normalized through typed helpers:

```ts
type AiModelPricing = {
  unit: 'token';
  promptCreditsPer1k: number;
  completionCreditsPer1k: number;
  minimumCredits: number;
};
```

### `ai_model_entitlement_requirements`

- `id uuid primary key`
- `model_id uuid not null references ai_models`
- `requirement_type text not null`, values `none`, `membership_plan`, `benefit_code`, `user_grant`
- `requirement_value text`
- `label text not null`
- `created_at`

Rules are OR semantics: a model is allowed when it has `none`, or the user satisfies at least one active requirement row. This supports free models, paid plan models, benefit-based models, and explicit user grants.

### `credit_ledger_entries`

- `id uuid primary key`
- `user_id uuid not null references users`
- `run_id uuid references agent_runs`
- `entry_type text not null`, values `grant`, `debit`, `adjustment`
- `amount integer not null`
- `balance_after integer`
- `idempotency_key text unique not null`
- `reason text not null`
- `metadata jsonb not null default {}`
- `created_at`

Credits are integer units. Debits store negative `amount`. For chat billing, `idempotency_key = "agent-run:<runId>:usage"`.

### `agent_runs` metadata

Avoid a disruptive migration of the core run table for every billing field. Store billing and selection details in `capability_snapshot` and `input` initially:

```ts
type ChatModelRunSnapshot = {
  modelId: string;
  providerId: string;
  providerCode: string;
  providerType: string;
  modelCode: string;
  modelName: string;
  model: string;
  entitlement: {
    allowed: true;
    basis: 'none' | 'membership_plan' | 'benefit_code' | 'user_grant';
    label: string;
    value: string | null;
  };
  pricing: AiModelPricing;
  billing?: {
    status: 'not_required' | 'pending' | 'billed' | 'failed';
    usage?: AiUsage;
    creditCost?: number;
    ledgerEntryId?: string;
  };
};
```

If querying billing fields becomes common, a later migration can add dedicated columns without changing API semantics.

## Service Boundaries

### Model Catalog Repository

Create `src/server/repositories/ai-models.ts`.

Responsibilities:
- Admin provider/model list and mutation helpers.
- `listAvailableChatModelsForUser(userId)`.
- `resolveChatModelForUser(userId, modelId)`.
- Seed fallback records when no database is configured in development.

The repository returns typed DTOs and never returns credential values.

### Entitlement Resolver

Create `src/server/ai/model-entitlements.ts`.

Responsibilities:
- Load active `user_entitlements` with joined `membership_plans` and `benefits`.
- Evaluate requirement rows with OR semantics.
- Return the winning entitlement basis for snapshots.
- Reject expired entitlements.

This resolver is used by both model listing and run creation. The UI is only a convenience layer, not an authorization boundary.

### Provider Adapter

Create `src/server/ai/provider-adapters.ts`.

```ts
type ChatProviderRequest = {
  runId: string;
  userId: string;
  model: ResolvedChatModel;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
};

type AiUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type ChatProviderResult = {
  finalMessage: string;
  usage: AiUsage;
  rawMetadata: Record<string, unknown>;
};
```

Initial adapters:
- `openai_compatible`: POST to `${baseUrl}/chat/completions`, model from `ai_models.model`, bearer token from `credential_env_key`.
- `development`: deterministic local output with usage estimated from prompt length; only allowed outside production unless explicitly enabled through env.

### Billing Service

Create `src/server/billing/credits.ts`.

Responsibilities:
- Read available balance from ledger plus legacy metadata bridge during migration.
- `assertCanAffordMinimum(userId, pricing)`.
- `calculateChatCreditCost(usage, pricing)`.
- `debitForAgentRun({ userId, runId, usage, pricing, modelSnapshot })` transactionally.
- Enforce idempotency by run id.

Cost formula:

```ts
Math.max(
  pricing.minimumCredits,
  Math.ceil(
    (usage.promptTokens / 1000) * pricing.promptCreditsPer1k +
    (usage.completionTokens / 1000) * pricing.completionCreditsPer1k,
  ),
);
```

## API Design

### `GET /api/agent/chat-models`

Requires active account.

Returns:

```ts
{
  models: Array<{
    id: string;
    code: string;
    name: string;
    providerName: string;
    isDefault: boolean;
    entitlementLabel: string;
    pricingSummary: string;
  }>;
}
```

Only entitled enabled chat models are returned.

### `POST /api/agent/runs`

For chat, request body adds `modelId`:

```ts
{
  taskType: 'chat',
  prompt: string,
  modelId: string,
  input?: Record<string, unknown>
}
```

For image/video/workflow, existing `input.model` behavior can remain until those tools are migrated.

Error codes:
- `model_required`
- `model_not_available`
- `model_entitlement_required`
- `insufficient_credits`
- `provider_unconfigured`
- `provider_error`
- existing account and validation errors

Response includes `run`, with `AgentRunDto` extended to expose:
- `selectedModel`
- `billing`
- `usage`

## Runtime Flow

1. User opens chat page.
2. Client calls `GET /api/agent/chat-models`.
3. Server filters enabled chat models by provider status and user entitlements.
4. Client selects default or remembered model if still present.
5. User sends prompt with `modelId`.
6. Server resolves model for user and repeats entitlement authorization.
7. Server checks minimum credits before provider call.
8. Server creates `agent_runs` row with provider/model snapshot.
9. Runtime calls provider adapter.
10. Runtime calculates final credit cost from usage.
11. Billing service writes idempotent debit.
12. Run completes with assistant message, usage, billing metadata, and artifact.

## Admin UI

Add an AI Models management area under existing admin navigation. It can live at `/admin/ai-models` or as a tab under `/admin/agent-capabilities`; `/admin/ai-models` is cleaner because provider/model/pricing is now first-class.

Show:
- Provider code, name, type, status, base URL, credential reference health.
- Model code, display name, provider, actual model identifier, chat support, default status.
- Entitlement requirements: free, membership plan, benefit code, explicit grant.
- Pricing summary.
- Actions for enable/disable and editing metadata/pricing.

AI Jobs/run review should show model snapshot, entitlement basis, usage, credit cost, and billing status.

## Public Chat UI

The chat page should:
- Load model options after active account state is known.
- Disable submit while no entitled model exists.
- Show a compact model selector in the header or composer area.
- Include entitlement label and pricing summary in model options.
- Submit `modelId` with chat prompts.
- Render insufficient-credit and entitlement-required errors without adding fake assistant messages.
- Render run history with selected model and credit cost when available.

## Testing Strategy

Unit tests:
- Entitlement resolver allows free model.
- Entitlement resolver allows membership model for active entitlement.
- Entitlement resolver rejects expired entitlement.
- Runtime rejects known but unauthorized model without provider call.
- Pricing calculation rounds up and respects minimum credits.
- Billing debit is idempotent for the same run.
- OpenAI-compatible adapter normalizes usage.

API tests:
- Model list excludes unauthorized premium model.
- Model list includes premium model after entitlement grant.
- Chat POST requires `modelId` for `taskType: chat`.
- Chat POST returns `model_entitlement_required` for unauthorized model.
- Chat POST returns `insufficient_credits` before provider call.
- Provider configuration error returns `provider_unconfigured`.

UI/browser verification:
- Admin model management page renders provider/model rows and entitlement summaries.
- Chat page shows only entitled models for the logged-in user.
- Chat page submits selected model and renders real/fallback run metadata.

## Rollout

1. Add schema and seed dev/free model.
2. Add repositories and unit tests.
3. Add model list API.
4. Add provider adapter and billing service.
5. Update run service/API.
6. Update admin UI.
7. Update chat UI.
8. Run full validation and browser checks.

Rollback is safe because new tables are additive. Existing agent runs remain readable, and non-chat tools keep their current input behavior.

## Approved Direction

Use typed `ai_providers`, `ai_models`, entitlement requirement rows, and `credit_ledger_entries`. Keep existing `agent_capabilities` compatibility for snapshots and admin continuity, but do not use capability JSON as the source of truth for user model authorization or pricing.
