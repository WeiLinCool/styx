# Doubao Image Generation Loop Design

Date: 2026-06-01
Change: `doubao-image-generation-loop`
Classification: Large

## Summary

Close the `/image-gen` MVP by routing all three visible tabs through server-owned model configuration, entitlement authorization, Doubao-compatible image provider execution, transient image result display, and credit ledger billing.

The implementation extends the existing chat model catalog instead of creating a parallel image model system. Admin-configured AI models gain explicit image capability flags. User-side model selectors load only enabled, entitled, mode-compatible models from the server. Runtime execution repeats those checks before calling Doubao and returns generated media only through transient response artifacts.

## Existing Context

- `/image-gen` currently shows three tabs: `AI生图`, `高清修复`, and `图片换风格`.
- The page still imports static model lists from `src/features/public/tool-data.ts`.
- Chat already has a mature chain: `GET /api/agent/chat-models`, `resolveChatModelForUser`, entitlement filtering, provider execution, and ledger billing.
- Image runs currently use `taskType: "image"` but still rely on default capability bundles and the deterministic runtime path.
- Prior transient image work established that generated media content must not be persisted to durable storage.

## Reference Research

Reference: Volcengine Ark / Doubao image generation documentation
- Promise: Doubao image generation is called through an Ark image generation endpoint with model, prompt, size, response format, and optional image input depending on model capability.
- State owner: provider/model configuration is server-side; credentials are environment-secret values referenced by configuration.
- Invariants: credentials are not exposed to the browser; result URLs can be temporary; generated media should be downloaded or copied by the client if the product does not provide a durable library.
- Transferable principle: isolate provider request/response parsing behind an adapter and normalize provider-specific media into local runtime artifacts.

Reference: existing `real-ai-chat-model-billing` design
- Promise: model availability is the intersection of provider status, model status, task support, and user entitlements; runtime repeats authorization.
- State owner: `ai_models`, `ai_providers`, `ai_model_entitlement_requirements`, `credit_ledger_entries`, and `agent_runs`.
- Transferable principle: image execution should reuse the same authority chain as chat instead of trusting UI-selected model strings.

Industry consensus -> Transferable principle -> Repository constraints -> Local design:

Mature AI tools use server-side model catalogs, entitlement checks, provider adapters, and auditable billing. This repository already implements those pieces for chat and has a transient-media invariant for images. The local design extends the existing catalog with structured image capabilities, adds a Doubao image adapter, and keeps generated/source image payloads out of durable storage.

## State Ownership

| State | Owner | Write Entry | Source Of Truth | Notes |
| --- | --- | --- | --- | --- |
| Provider endpoint and credential reference | `ai_providers` repository | admin provider routes | database | Stores env key references, never secret values. |
| Model task/image support | `ai_models` repository | admin model routes | database | Add explicit image capability/default fields. |
| Entitlement rules | `ai_model_entitlement_requirements` | admin model mutations | database | Reuse existing OR semantics. |
| User model availability | AI model repository | user model-list route | derived from DB + active entitlements | UI consumes, runtime rechecks. |
| Image source upload | `/image-gen` client and runtime request validator | current browser request | current request only | Not durable; validate type and size. |
| Generated image media | `/api/agent/runs` response and client state | image provider adapter | current response only | Not recoverable after refresh/navigation. |
| Run status and metadata | `agent_runs` repository | run service | database | Durable audit/history without media payloads. |
| Billing debit | credit ledger | run service after accepted image result | database | Fixed minimum credit cost for MVP. |

## Invariants

1. Management-configured models are the only source for user-visible image model options.
2. Runtime execution must reject image requests when the selected model is disabled, unsupported for the image mode, or not allowed by current user entitlements.
3. Uploaded source images and generated images must not be persisted in `agent_runs`, `agent_artifacts`, or model metadata.
4. Successful image billing is idempotent and tied to the run id.
5. Failed validation, entitlement rejection, provider configuration failure, and provider failure must not charge credits.

## Design

### Model Catalog

Extend `ai_models` with additive boolean fields:

- `supports_image_generation`
- `supports_image_edit`
- `supports_image_upscale`
- `is_default_image`

The exact column names should follow existing snake_case Drizzle conventions. All new support flags default to `false`. Existing chat rows continue to work unchanged.

Repository DTOs should expose the new fields in admin rows and image model list DTOs. Image model resolution should accept:

```ts
type ImageModelMode = 'generate' | 'edit' | 'upscale';
```

Mode-to-field mapping:

- `generate` -> `supportsImageGeneration`
- `edit` -> `supportsImageEdit`
- `upscale` -> `supportsImageUpscale`

### User APIs

Add a user-facing image model list route, preferably:

```http
GET /api/agent/image-models?mode=generate|edit|upscale
```

It returns only models whose provider is enabled, model is enabled, the requested mode is supported, and the active user's entitlements satisfy the model requirements.

The route returns a DTO close to the existing chat model DTO:

```ts
type ImageModelOption = {
  id: string;
  code: string;
  name: string;
  providerName: string;
  isDefault: boolean;
  entitlementLabel: string;
  pricingSummary: string;
  supportedModes: ImageModelMode[];
};
```

### Runtime API

Extend `POST /api/agent/runs` validation:

- `taskType: "chat"` still requires `modelId`.
- `taskType: "image"` also requires `modelId`.
- `input.mode` must be `generate`, `edit`, or `upscale`.
- `edit` and `upscale` require a valid source image data URL.
- Source image MIME types should be limited to common browser image formats such as PNG, JPEG, WebP, and GIF if supported by provider.
- Source image payload size must be capped before provider execution.

The run service gets a selected-model image path parallel to the chat path:

1. Resolve image model for user and mode.
2. Assert minimum credits.
3. Create run with selected model snapshot.
4. Mark running.
5. Call the image provider adapter.
6. Accept at least one valid generated image.
7. Debit fixed minimum credits with image idempotency key.
8. Complete run with safe durable artifact summaries and transient response artifacts.

### Doubao Image Adapter

Create a focused image adapter interface rather than extending the chat adapter:

```ts
type ImageProviderRequest = {
  runId: string;
  userId: string;
  model: ResolvedImageModel;
  mode: ImageModelMode;
  prompt: string;
  size?: string;
  scale?: string;
  sourceImageDataUrl?: string;
};

type ImageProviderResult = {
  finalMessage: string;
  artifacts: AgentArtifactInput[];
  rawMetadata: Record<string, unknown>;
};
```

The Doubao implementation should use provider `baseUrl` and `credentialEnvKey`, then call the image generation endpoint under the configured base URL. Prefer `response_format: "b64_json"` so generated images can become transient `data:` URLs without persisting provider URLs. If a provider returns a temporary URL, the adapter/runtime may fetch it and convert it to a data URL within size/type limits.

Prompt shaping:

- `generate`: use the user's prompt directly.
- `edit`: combine the selected style name and optional user prompt into the provider prompt.
- `upscale`: combine HD repair prompt and scale metadata into the provider prompt.

### Transient Persistence

Source image data URLs must be removed from durable run input before repository persistence. Generated image artifacts must be split:

- transient response artifact contains `dataUrl`, MIME, title, filename, and safe metadata;
- durable artifact summary has `body: null`, `url: null`, and metadata such as mode, MIME, dimensions, byte length, provider/model, and `transient: true`.

### Billing

For MVP image billing, reuse `AiModelPricing.minimumCredits` as a fixed per-run cost. Chat token pricing remains unchanged.

Add or generalize billing helpers so image runs can write a ledger debit with:

- `entryType: "debit"`
- `idempotencyKey: "agent-run:<runId>:image-usage"`
- `reason: "image usage"`
- metadata containing selected model snapshot, image mode, size/scale, pricing, and safe provider metadata

### UI

`/image-gen` should:

- load mode-specific model options from the server;
- select the server default when no current compatible model exists;
- show unavailable states when no model is available;
- validate source image uploads client-side for HD repair and style transfer;
- preview uploaded source images locally;
- clear stale generated output when starting a new run or switching incompatible mode state;
- submit all tabs through `createAgentRun` with `taskType: "image"`, `modelId`, and mode-specific input;
- keep the existing transient result UI: generated image preview, primary download action, copy prompt action, and warning that the image is not server-saved.

## Error Handling

- `model_required`: image request omitted `modelId`.
- `invalid_request`: unsupported mode, invalid source image, oversized payload, or invalid prompt.
- `model_not_available`: disabled/unknown/unsupported-mode model.
- `model_entitlement_required`: model exists but current user entitlement does not allow it.
- `insufficient_credits`: user cannot afford the selected model minimum.
- `provider_unconfigured`: provider endpoint or credential env value is missing.
- `provider_error`: upstream Doubao call failed or returned unsupported output.

## Verification Plan

Focused checks:

1. Repository tests for image model listing and resolution by mode and entitlement.
2. Route tests for image model API and image run request validation.
3. Adapter tests for Doubao request shape, response parsing, temporary URL handling, and error normalization.
4. Run service tests for successful transient image output, no durable media persistence, entitlement rejection, unsupported mode rejection, source image validation, and image billing debit.
5. Client tests for `/image-gen` model loading, upload validation, submit payloads, unavailable state, and transient result parsing.

General checks:

- `pnpm db:generate`
- focused test command covering touched tests
- `pnpm build`
- browser verification for `/image-gen` across all three tabs when local auth/database state is available

## Files Likely To Change

- `src/server/db/schema.ts`
- `drizzle/**` generated migration files
- `src/server/repositories/ai-models.ts`
- `src/server/repositories/ai-models.test.ts`
- `src/server/ai/provider-adapters.ts` and/or a new image adapter module
- `src/server/ai/provider-adapters.test.ts`
- `src/server/billing/credits.ts`
- `src/server/agent/run-service.ts`
- `src/server/agent/run-service.test.ts`
- `src/app/api/agent/runs/route.ts`
- `src/app/api/agent/runs/route.test.ts`
- new `src/app/api/agent/image-models/route.ts`
- `src/features/public/agent-runtime-client.ts`
- `src/features/public/agent-runtime-client.test.ts`
- `src/app/image-gen/page.tsx`
- `src/features/admin/admin-ai-models-module.tsx`
- `src/app/api/admin/ai-models/**`
