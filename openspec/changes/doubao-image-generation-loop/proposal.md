## Why

The user-facing `/image-gen` page still uses static client-side model options and does not route all image workflows through the configured AI model catalog, entitlement checks, credit billing, and real provider call path. This leaves the image-generation MVP incomplete: admins cannot control which image models users see, membership entitlements do not gate image model access, and the three visible tabs do not all produce real returned images.

The product already has a strong chat-model foundation: admin-configured providers/models, entitlement filtering, runtime authorization, billing ledger debits, and transient image-result handling. This change extends that foundation to Doubao image generation and editing so the user-facing image tools close the loop without creating a parallel model system.

## What Changes

- Add structured image capabilities to the existing AI model catalog so admins can mark a model as supporting text-to-image generation, image editing/style transfer, and image upscale/repair.
- Add default image model selection per image mode, while preserving the existing default chat model behavior.
- Add an entitlement-filtered user image-model list API for `/image-gen` modes.
- Update `/image-gen` to load model options from the server for all three tabs: `AI生图`, `高清修复`, and `图片换风格`.
- Update image run creation so `taskType: "image"` requires a server-resolved `modelId` and mode-specific validation.
- Add a Doubao/Volcengine Ark image provider adapter for the image-generation endpoint, with request shaping for generation, style transfer, and HD repair.
- Keep uploaded source images and generated result media transient: source image payloads are accepted only for the current request, generated image payloads are returned only in the API response, and durable records store only safe summaries.
- Add fixed-per-image-run credit billing using the selected model pricing minimum for successful image runs.

## Capabilities

### New Capabilities

- None. This change extends the existing AI model, public product, runtime, and admin capabilities.

### Modified Capabilities

- `ai-model-billing`: Extend provider/model configuration, model availability, runtime entitlement enforcement, real execution, and credit billing from chat-only to image-capable models.
- `public-product-experience`: Make all `/image-gen` tabs use server-provided image models, real agent runs, transient image previews, and stable unavailable/error states.
- `user-agent-runtime`: Route image runs through the selected configured model, validate image mode support, keep media transient, and snapshot model/billing metadata.
- `admin-management-console`: Expose image model capabilities and default image model state in the AI model management console.

## Impact

- Affected routes:
  - `src/app/image-gen/page.tsx`
  - `src/app/api/agent/runs/route.ts`
  - new or extended user model-list route under `src/app/api/agent`
  - `src/app/api/admin/ai-models/**`
- Affected server domains:
  - `src/server/repositories/ai-models.ts`
  - `src/server/ai/provider-adapters.ts` or a focused image provider adapter module
  - `src/server/agent/run-service.ts`
  - `src/server/billing/credits.ts`
  - `src/server/db/schema.ts` and generated Drizzle migration
- Affected UI:
  - `/image-gen`
  - `/admin/ai-models`
- External provider:
  - Doubao/Volcengine Ark image API via configured provider endpoint and credential environment variable.
- Verification:
  - focused repository/service/route/client tests
  - migration generation
  - `pnpm build`
  - browser verification for `/image-gen` when local auth/database setup allows it
