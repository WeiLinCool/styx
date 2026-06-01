## Context

The repository is a root-level Next.js App Router application with server-owned auth, repositories, Drizzle persistence, and an existing agent runtime under `src/server/agent`. Chat already uses the durable AI provider/model catalog in `src/server/repositories/ai-models.ts`: admins configure providers and models, model requirements are evaluated through `src/server/ai/model-entitlements.ts`, the user model list is filtered server-side, and the run service repeats entitlement checks before provider execution and credit billing.

The `/image-gen` page has a visible three-tab product surface: `AI生图`, `高清修复`, and `图片换风格`. It currently uses static client model lists from `src/features/public/tool-data.ts`, and non-chat image runs still use default agent capability bundles and the deterministic runtime. A prior transient-image change established the media durability rule: generated image payloads may be returned in the immediate API response, but generated media must not be persisted to the database.

The target provider for this MVP is Doubao through Volcengine Ark. The image API shape is close to OpenAI's image generation pattern: `POST /api/v3/images/generations` with model, prompt, size, optional image input for edit flows, `response_format`, and provider usage/result metadata.

## Goals / Non-Goals

**Goals:**

- Make management-console model configuration the only source for user-side image model selection.
- Support all three `/image-gen` tabs as real runtime flows: text-to-image, HD repair/upscale, and style transfer.
- Gate image model availability and runtime execution by the user's current membership/benefit/model entitlements.
- Route image runs through a Doubao image provider adapter and return generated images through the transient artifact response channel.
- Bill successful image runs through the credit ledger using the selected model's minimum credit cost for MVP.
- Preserve operational auditability through `agent_runs`, safe artifact summaries, capability snapshots, and billing metadata.

**Non-Goals:**

- Long-term media storage, cloud libraries, or server-side image recovery after refresh/navigation.
- Full provider-specific feature parity beyond the three visible MVP modes.
- Multi-image batch generation.
- Sophisticated image pricing by size, count, or provider token/image usage. This MVP uses fixed per-run minimum credits.
- Video generation changes.

## Decisions

### Extend the Existing AI Model Catalog Instead of Creating a Separate Image Catalog

Add structured image task support to `ai_models`, alongside the existing chat fields. The implementation should use explicit columns such as `supports_image_generation`, `supports_image_edit`, `supports_image_upscale`, and `is_default_image` rather than burying support flags in `metadata`.

Rationale: provider, entitlement, pricing, status, admin listing, and runtime resolution already belong to the AI model repository. Reusing the catalog avoids duplicate authorization and admin concepts while still making image support queryable and testable.

Alternative considered: store image support in `ai_models.metadata`. Rejected because API validation and admin filtering would rely on hidden JSON conventions.

Alternative considered: create a separate `image_models` table. Rejected for MVP because it duplicates provider, entitlement, and pricing machinery.

### Use One User Model List Contract With Task/Mode Filtering

Expose a server-filtered image model list for `/image-gen`, either as `GET /api/agent/image-models?mode=generate|edit|upscale` or a generalized model-list route with a task/mode parameter. The response should mirror the chat model DTO shape where practical: id, code, name, provider, default marker, entitlement label, pricing summary, and mode support metadata.

Rationale: UI model selectors are convenience controls, not authority boundaries. The route should hide disabled providers, disabled models, unsupported modes, and entitlement-ineligible models before the page renders.

### Require `modelId` for Image Runs

`POST /api/agent/runs` must require `modelId` for `taskType: "image"` and must validate `input.mode` as one of `generate`, `edit`, or `upscale`. The run service then resolves the model for the user and mode, repeats entitlement and support checks, snapshots provider/model/pricing/entitlement, and only then calls the provider adapter.

Rationale: image execution should match the chat security model. The client cannot pick arbitrary model strings or bypass membership requirements.

### Implement a Focused Doubao Image Adapter

Add an image adapter contract separate from chat streaming. The Doubao adapter should:

- use the provider `baseUrl` and `credentialEnvKey`;
- call the Ark image generation endpoint under the configured base URL;
- send `response_format: "b64_json"` where available so generated output can be returned as a transient `data:` URL without persisting short-lived provider URLs;
- accept source image data URLs for edit/upscale modes;
- normalize provider result images, usage-like metadata, and safe raw metadata.

Rationale: chat and image providers have different request/response shapes. A focused adapter keeps run orchestration readable and avoids forcing image behavior into chat interfaces.

### Treat Source Images and Generated Images as Transient

Client uploads for HD repair and style transfer are read into browser memory as data URLs, validated for MIME type and size, sent in the protected JSON mutation, and never persisted. The run service must strip generated media `body` and `url` before repository persistence, preserving only safe metadata and summary artifact rows.

Rationale: this preserves the existing transient-media invariant and avoids creating an implicit storage product before storage, retention, privacy, and cost are designed.

### Use Fixed Per-Run Image Billing for MVP

Before provider execution, assert the user can afford the selected model's minimum credit price. After a successful provider image response, debit the ledger once with idempotency key `agent-run:<runId>:image-usage` and amount equal to `pricing.minimumCredits`. The run snapshot records billing status, credit cost, ledger entry id, provider model, image mode, and safe provider metadata.

Rationale: this hooks image usage into membership/credit economics now while avoiding premature size/count pricing rules. The ledger remains the durable source for AI debits.

### Keep Admin Operations Dense and Backward-Compatible

The `/admin/ai-models` page remains one operational model console. Model rows should show support badges for chat, image generation, image edit, and image upscale, plus default chat/default image state. Create/update forms should allow admins to set image support flags. Existing chat model behavior must keep working.

Rationale: admins should configure one model once, then decide which tasks it supports and which entitlements gate it.

## Risks / Trade-offs

- Provider documentation differences between Volcengine and BytePlus variants → keep the adapter isolated, support a conservative request shape, and add parser tests around success/error normalization.
- JSON body size can grow when source images are data URLs → validate accepted image MIME types and cap source upload size before mutation submission and again at route parsing.
- `runProtectedMutation` idempotency may replay a transient image response → this is acceptable for immediate retries, but persisted state still must not contain media payloads.
- Fixed minimum-credit image pricing is coarse → record mode/size metadata now so later size-based pricing can be introduced without losing audit context.
- Schema migration touches shared model catalog → make new columns additive with defaults, preserve existing chat defaults, and seed development image models explicitly.

## Migration Plan

1. Add nullable-safe/defaulted image support fields to `ai_models` in `src/server/db/schema.ts`.
2. Generate a Drizzle migration with default `false` support flags and no destructive data changes.
3. Update seed data so development has at least one free Doubao-like/development image model per MVP mode.
4. Extend repository DTOs and admin routes to read/write the new fields.
5. Add image model listing/resolution and runtime adapter code.
6. Update `/image-gen` to consume server model options and source image uploads.
7. Verify focused tests, build, and browser behavior.

Rollback is straightforward for code before production migration. After migration, the additive columns can remain unused if the feature is disabled; existing chat behavior does not depend on removing them.

## Open Questions

- The final production model IDs and pricing values should be seeded or entered by admins. The implementation should not hardcode real paid model access into the user UI.
- If Doubao returns only temporary URLs in some deployments, the adapter should fetch and convert them to data URLs before returning to the client, subject to response size limits.
