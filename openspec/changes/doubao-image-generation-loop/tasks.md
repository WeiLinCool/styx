## 1. Schema And Model Catalog

- [x] 1.1 Add additive Drizzle schema fields for image model capabilities and default image model state while preserving existing chat model behavior.
- [x] 1.2 Generate and review the Drizzle migration for the image model capability fields.
- [x] 1.3 Update seed data so development has at least one entitled image model for text-to-image, image editing, and HD repair flows.
- [x] 1.4 Extend AI model repository DTOs, grouping, summaries, filters, and seed fallback records with image capability/default fields.

## 2. Admin Configuration Surface

- [x] 2.1 Extend admin AI model create/update route validation and repository mutations to accept image capability flags.
- [x] 2.2 Extend `/admin/ai-models` table display, search, quick filters, and model forms/actions to expose image support and default image state.
- [x] 2.3 Add or extend admin tests for image capability parsing, row summaries, and mutation persistence.

## 3. User Image Model Availability

- [x] 3.1 Add an entitlement-filtered image model list API for `generate`, `edit`, and `upscale` modes.
- [x] 3.2 Add repository resolution helpers that validate provider/model status, image mode support, and user entitlement for runtime execution.
- [x] 3.3 Add focused tests for image model listing and runtime resolution, including disabled model, unsupported mode, expired entitlement, and premium entitlement cases.

## 4. Doubao Image Provider Adapter

- [x] 4.1 Add a focused image provider adapter contract and Doubao/Ark implementation for text-to-image and source-image modes.
- [x] 4.2 Normalize provider success responses into transient image artifact inputs and safe metadata.
- [x] 4.3 Normalize provider configuration and upstream request failures into stable existing API error classes.
- [x] 4.4 Add provider adapter tests for request shape, base64 result parsing, temporary URL handling, and safe error trimming.

## 5. Image Runtime, Validation, And Billing

- [x] 5.1 Extend `/api/agent/runs` request validation so image runs require `modelId`, image `mode`, and source image payloads for edit/upscale modes.
- [x] 5.2 Extend the run service with selected-model image orchestration, model snapshotting, source image sanitization, transient output splitting, and durable summary persistence.
- [x] 5.3 Add fixed per-run image credit debit using the selected model pricing minimum after a valid generated image is accepted.
- [x] 5.4 Add service and API tests for successful image generation, edit/upscale source validation, unsupported model mode, entitlement rejection, insufficient credits, provider failure, and no media persistence.

## 6. User Image Generation UI

- [x] 6.1 Replace static `/image-gen` model lists with server-loaded mode-specific image model options and unavailable states.
- [x] 6.2 Add source image upload, preview, type/size validation, and clearing behavior for HD repair and style transfer.
- [x] 6.3 Submit all three tabs through the runtime with selected `modelId`, mode-specific prompt/options, and source image only for the current request.
- [x] 6.4 Preserve the transient result UI with preview, download, prompt copy, warning copy, and clear stale-result behavior across mode changes.
- [x] 6.5 Add client tests or focused component-level checks for model selection, upload validation, error rendering, and transient result parsing.

## 7. Verification And Closure

- [x] 7.1 Run focused repository, provider, service, route, and client tests touched by the change.
- [x] 7.2 Run `pnpm db:generate` and inspect generated migration output.
- [x] 7.3 Run `pnpm build` and record any unrelated blockers.
- [x] 7.4 Run browser verification for `/image-gen` covering all three tabs when local auth/database setup is available, or document the exact blocker.
- [x] 7.5 Update verification notes with invariants checked: server-side entitlement enforcement, no media persistence, successful transient display, and credit debit behavior.
