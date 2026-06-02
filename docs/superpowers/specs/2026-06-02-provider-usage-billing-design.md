# Provider Usage Billing Closure Design

## Context

The application already has a durable AI model catalog, chat billing ledger, and image-generation loop:

- `src/server/repositories/ai-models.ts` resolves enabled chat and image models for entitled users.
- `src/server/billing/credits.ts` calculates chat token costs and records idempotent credit ledger debits.
- `src/server/agent/run-service.ts` snapshots model, usage, and billing metadata into agent runs.
- `/image-gen` now routes image generation through configured image-capable models, but image pricing is still fixed at the selected model minimum.
- `/video-gen` still uses static public model data and deterministic media behavior; it is not a real provider or billing loop.

The requested change is an administrator-only usage billing closure. Users do not need to see token or credit conversion details. Administrators need to configure provider-level conversion rules, route Doubao multimodal image/video models through real provider calls, and audit how provider usage became credit ledger debits.

Official provider references inform the design:

- DeepSeek chat usage includes `prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_cache_hit_tokens`, and `prompt_cache_miss_tokens`: https://api-docs.deepseek.com/api/create-chat-completion
- Volcengine Ark Seedance task querying returns task status, `content.video_url`, usage tokens, `duration`, `resolution`, `ratio`, frame rate, and related task metadata: https://www.volcengine.com/docs/82379/1521309
- Volcengine Seedance API docs describe supported duration and resolution parameters and note that duration affects billing: https://www.volcengine.com/docs/82379/1393047

## Goals

- Let administrators configure provider-level usage-to-credit billing rules for chat, image, and video tasks.
- Prioritize Doubao multimodal MVP support for text-to-image and text-to-video models.
- Replace `/video-gen` static model behavior with configured Doubao video models, real provider task creation, task polling, media result display, and final credit billing.
- Preserve the existing server-owned authority model: the client never supplies billable cost or trusted usage.
- Preserve historical auditability by snapshotting raw provider usage, normalized usage breakdown, billing rule snapshot, model snapshot, credit cost, ledger entry id, and balance movement.
- Keep user-facing UI free of token and conversion details.

## Non-Goals

- Showing usage or billing formulas to end users.
- Full provider parity across every non-Doubao media model.
- Long-term durable media storage for generated image or video assets.
- A background worker platform in the first implementation if the current repository does not already provide one.
- Per-model billing overrides in the first release. The first source of truth is provider-level billing rules.

## Industry Consensus -> Transferable Principle -> Local Design

Industry consensus: AI providers expose heterogeneous usage fields. Text models commonly report prompt and completion tokens, cache-aware providers report cache hit/miss prompt tokens, and video generation providers often use asynchronous tasks that expose final usage only after completion.

Transferable principle: billing must normalize provider-specific usage after provider completion, calculate cost server-side from a snapshotted rule, and write an idempotent ledger entry.

Repository constraints: route handlers validate transport input, repositories own persistence details, billing logic already lives in `src/server/billing`, runtime orchestration lives in `src/server/agent`, and admin surfaces should remain dense operational pages under `src/features/admin`.

Local design: add provider-level billing rules, normalize usage in provider adapters or a focused billing normalizer, calculate credits in billing domain code, and expose the full conversion chain only to administrators.

## State Ownership

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| Provider billing rules | AI provider repository/admin mutation | Admin provider create/update route | `ai_providers` JSON config or metadata |
| Model task support | AI model repository/admin mutation | Admin model create/update route | `ai_models` columns |
| Provider task id/status | Agent run service/repository | Video run create and sync flows | `agent_runs.capability_snapshot` / `input` snapshot |
| Raw provider usage | Provider adapter/run service | Provider success parsing | Run snapshot and ledger metadata |
| Normalized usage breakdown | Billing normalizer | Run completion or sync flow | Run snapshot and ledger metadata |
| Credit debit | Billing service | `debitFor...AgentRun` equivalent | `credit_ledger_entries` |
| Admin audit display | Admin repositories/features | Read-only from runs and ledger | Run snapshot plus ledger entry |

## Invariants

1. The client never supplies trusted usage, billing rules, credit cost, ledger entry ids, or balance changes.
2. A completed provider call creates at most one debit ledger entry per run and task usage key.
3. Billing rule changes do not rewrite historical debits; historical audit reads the snapshotted rule.
4. Failed provider tasks do not debit credits.
5. Successful video tasks are billed only after final provider status exposes a usable output and usage or fallback billable unit.

## Provider Billing Rules

Provider records should gain a `billingRules` config. The first implementation can store this in provider JSON config/metadata to avoid premature table fragmentation. Video capability columns should still be explicit model columns because model support is queryable runtime authority.

Example shape:

```ts
type ProviderBillingRules = {
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
```

Doubao Seedance MVP should default to `video.mode = "provider_usage_tokens"` because Ark task results expose token usage. The system should still record duration and resolution so administrators can later switch to seconds-based pricing with auditable context.

## Usage Normalization

Add focused billing domain functions:

```ts
normalizeProviderUsage(providerType, taskType, rawUsage, runInput)
calculateCreditCost(taskType, usageBreakdown, billingRules)
```

Normalized usage should be structured enough for admin display and future cost formulas:

```ts
{
  taskType: 'video',
  providerType: 'doubao',
  units: [
    { kind: 'output_tokens', amount: 108900 },
    { kind: 'total_tokens', amount: 108900 },
    { kind: 'duration_seconds', amount: 5 },
    { kind: 'resolution', value: '720p' },
    { kind: 'ratio', value: '16:9' }
  ],
  rawUsage: { completion_tokens: 108900, total_tokens: 108900 }
}
```

DeepSeek chat normalization should recognize `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens`. Doubao image normalization should accept provider usage when present and fall back to configured fixed or per-image rules when image responses do not include usage.

## Doubao Image Billing Update

The existing image flow already resolves configured image models and calls the Doubao image adapter. Replace fixed `minimumCredits` billing with provider rule billing:

1. Resolve selected image model and provider.
2. Preflight against `minimumCredits`.
3. Call image provider adapter.
4. Normalize raw image usage and image count/mode/size.
5. Calculate credit cost from provider image rules.
6. Debit ledger with idempotency key `agent-run:<runId>:image-usage`.
7. Snapshot raw usage, usage breakdown, billing rule, credit cost, ledger id, and safe image metadata.

Generated image payload durability remains unchanged: image bytes may be returned as transient response data but must not be persisted.

## Doubao Video MVP

Add video support to the model catalog:

- `supports_video_generation`
- `is_default_video`

Add a `GET /api/agent/video-models` route that mirrors the chat/image model list contracts and filters by provider/model status, video support, and user entitlement. `/video-gen` should use this route instead of static `videoModels`.

Extend `POST /api/agent/runs` for `taskType: "video"`:

- require `modelId`;
- validate prompt, duration, resolution, ratio, watermark, seed, and related supported parameters;
- resolve the selected video model server-side;
- preflight against provider video `minimumCredits`;
- create an agent run;
- call the Doubao video adapter to create an Ark content-generation task;
- persist provider task id and initial provider status;
- return a running run to the client.

Add a video sync path. For MVP, prefer front-end polling that triggers server-side status sync because the current repository does not have a durable background worker abstraction. The sync path can be `POST /api/agent/runs/[runId]/sync` or a run-detail read that performs an explicit bounded sync for running video tasks.

When provider status is:

- `running` or equivalent: update task status, append an event, and keep the run running.
- `failed` or cancelled: mark the run failed, store safe error metadata, and do not debit.
- `succeeded`: validate video URL, normalize usage/duration/resolution, calculate credits, debit ledger idempotently, create direct media result metadata, mark run succeeded, and append billing/run completion events.

The video result should use existing direct-media result conventions. Provider URLs must be treated as direct delivery with expiry when the provider exposes that contract; no long-term storage is introduced in this change.

## Admin Configuration

Keep configuration in `/admin/ai-models` rather than creating scattered pages.

Provider create/edit forms should expose a compact billing rules section:

- Chat token rules, including cache hit and cache miss input rates.
- Image billing mode and rates.
- Video billing mode and rates.
- Minimum credits per task type.

Model create/edit forms should expose model capabilities and defaults:

- chat support/default chat;
- image generation/edit/upscale support/default image;
- video generation support/default video;
- entitlement requirements.

Validation should reject negative rates, non-integer minimum credits, unsupported modes, and unusable provider billing configs for enabled models.

## Admin Audit

Admin-only AI job/run views should expose a billing detail panel. It should read historical run and ledger snapshots, not current provider rules.

Display fields:

- run id and user;
- task type;
- provider and model;
- provider task id/status for video;
- raw provider usage;
- normalized usage breakdown;
- billing rule snapshot;
- calculated credit cost;
- ledger entry id;
- balance after;
- run status and error summary.

List rows can remain concise, for example:

- `Video · Doubao Seedance · 108900 tokens · 109 credits`
- `Chat · DeepSeek · input 500 / cache hit 300 / output 200 · 2 credits`

## Boundary Graph

`/video-gen` UI -> `/api/agent/video-models` -> AI model repository -> entitlement policy

`/video-gen` UI -> `/api/agent/runs` -> request validation -> run service -> video model resolution -> Doubao video adapter -> agent run repository

Polling UI -> run sync route -> run service -> Doubao task query -> usage normalizer -> billing calculator -> credit ledger -> run completion

Admin UI -> admin repositories -> runs + credit ledger snapshots

## Migration And Compatibility

Schema changes should be additive:

1. Add video capability/default columns to `ai_models`.
2. Store provider billing rules in provider JSON config/metadata for the first implementation.
3. Seed development/Doubao-like video models only as disabled or development-safe defaults unless real credentials are configured.
4. Keep existing chat and image behavior working when billing rules are missing by falling back to current model pricing minimums only in non-production or explicit development providers.

Production enabled providers should require valid billing rules for supported task types.

## Risks And Mitigations

- Provider response shape drift: isolate parsing in provider adapters and add response fixture tests.
- Video async partial failure: make status sync idempotent and bill only on succeeded status.
- Concurrent sync or retries: use ledger idempotency keys and run status checks before completion writes.
- Admin misconfiguration: validate provider rules before enabling models and expose test-call diagnostics.
- Media durability creep: reuse existing transient/direct media conventions and avoid persisting video bytes.
- Large JSON snapshots: store safe summaries and raw usage, not full request bodies or media payloads.

## Verification Plan

- Billing unit tests:
  - DeepSeek cache hit/miss chat usage.
  - Doubao image provider usage and fixed/per-image fallback.
  - Seedance video token usage and minimum credits.
  - Seconds-based video fallback.
  - Rule snapshot and historical cost stability.
- Ledger tests:
  - idempotent debit for video completion;
  - no debit on failed video task;
  - insufficient credits before provider work where minimum preflight applies.
- API validation tests:
  - video run requires `modelId`;
  - disabled/unentitled/unsupported video model is rejected;
  - duration, resolution, ratio, watermark, and seed validation.
- Adapter tests:
  - Doubao video create-task request shape;
  - task poll running/succeeded/failed parsing;
  - sensitive provider errors are redacted.
- Repository tests:
  - list/resolve video models;
  - default video model behavior;
  - run snapshot persists provider task id, usage breakdown, billing, and direct media summary.
- UI/browser verification:
  - `/video-gen` loads admin-configured models;
  - submitting a prompt enters running state;
  - polling updates final video result;
  - admin view shows billing detail panel.

## Open Implementation Notes

- The implementation plan should decide whether video status sync is a dedicated sync route or bounded sync inside run-detail polling. Dedicated sync is clearer and easier to test.
- If provider billing rules are stored in metadata first, repository DTOs should expose typed parsed billing rules so UI and billing code do not parse raw JSON independently.
- If production enables a provider with missing task billing rules, the model should fail closed for that task type.
