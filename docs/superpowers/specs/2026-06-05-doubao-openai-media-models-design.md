# Doubao And OpenAI-Compatible Media Models Design

## Context

The repository already has:

- AI provider and model administration under `/admin/ai-models`.
- User-facing `/image-gen` and `/video-gen` surfaces.
- A configured image-generation loop that already uses resolved image-capable models.
- A partially designed video-generation and provider billing direction documented in `2026-06-02-provider-usage-billing-design.md`.

The current gap is authority and routing clarity across three different concerns:

1. Agent primary models for chat/tool use.
2. Media models for image generation.
3. Media models for video generation.

The immediate user problem is a provider/model mismatch such as trying to use `doubao-seedream-5-0` as an Agent Plan model. That mismatch should fail closed in the product. At the same time, the product should support real Doubao media models and leave room for future OpenAI-compatible media providers without reworking the user-facing flows.

## Goals

- Support real Doubao Seedream image models in `/image-gen`.
- Support real Doubao Seedance video models in `/video-gen`.
- Keep Agent primary model selection separate from image/video model selection.
- Make runtime routing based on explicit model capability and execution protocol, not provider-name special cases.
- Extend the admin model/provider configuration so operators can safely configure chat, image, and video models.
- Allow future OpenAI-compatible media providers to reuse the same image-generation path with minimal new code.

## Non-Goals

- Full provider parity across every third-party or open-source media stack.
- Long-term durable storage for generated media.
- A background worker platform for video polling in this change.
- Multi-protocol polymorphism inside a single model record in the first release.

## Industry Consensus -> Transferable Principle -> Local Design

Industry consensus:

- Chat-capable and media-capable models are often exposed through different APIs even when sold by the same provider.
- Image APIs are often synchronous and OpenAI-compatible, while video APIs are commonly asynchronous task systems.
- Admin misconfiguration is common when model capability is inferred from names instead of explicit metadata.

Transferable principle:

- Capability, execution protocol, and provider connection details should be separate authorities.

Repository constraints:

- Route handlers validate transport input.
- `src/server/repositories/ai-models.ts` owns model/provider resolution.
- `src/server/agent/run-service.ts` owns run creation and orchestration.
- Admin surfaces already centralize provider/model configuration.

Local design:

- Keep model capability flags as business truth.
- Add execution protocol as runtime truth.
- Keep provider connection details on provider records.
- Route chat/image/video through separate strict server-side resolution paths.

## State Ownership

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| Provider connection config | AI provider repository/admin mutation | Admin provider create/update route | `ai_providers` |
| Provider billing rules | AI provider repository/admin mutation | Admin provider create/update route | `ai_providers` config/metadata |
| Model capability flags | AI model repository/admin mutation | Admin model create/update route | `ai_models` |
| Model execution protocol | AI model repository/admin mutation | Admin model create/update route | `ai_models` |
| Chat default model | AI model repository/admin mutation | Admin model create/update route | `ai_models.is_default_chat` |
| Image default model | AI model repository/admin mutation | Admin model create/update route | `ai_models.is_default_image` |
| Video default model | AI model repository/admin mutation | Admin model create/update route | `ai_models.is_default_video` |
| Provider task status for video runs | Run service/repository | Run create + sync flow | `agent_runs` snapshots/events |

## Invariants

1. A model used as Agent primary model must be chat-capable and use a chat execution protocol.
2. Image/video models are never resolved through the chat runtime path.
3. Runtime routing is based on explicit capability and execution protocol, never on model-name guessing.

## Architecture

### Capability And Protocol Separation

Capability remains the business-level contract:

- `supportsChat`
- `supportsImageGeneration`
- `supportsImageEdit`
- `supportsImageUpscale`
- `supportsVideoGeneration`

Execution protocol becomes the runtime-level contract:

- `chat_openai_compatible`
- `image_openai_compatible`
- `video_task_polling`

Provider config remains the connection-level contract:

- provider type
- base URL
- credential env key
- protocol-specific config
- billing rules

### Initial Provider Mapping

- Doubao Seedream 5.0 -> `image_openai_compatible`
- Doubao Seedance -> `video_task_polling`

Future OpenAI-compatible image providers can reuse `image_openai_compatible` with no user-facing changes.

## Data Model

Keep schema changes incremental.

### `ai_models`

Preserve existing capability/default columns and add:

- `execution_protocol`

Initial values:

- `chat_openai_compatible`
- `image_openai_compatible`
- `video_task_polling`

The first release should constrain one model record to one primary execution protocol. This keeps resolution, testing, and admin debugging straightforward. If a provider exposes chat and image through separate endpoints, represent those as separate model records.

### `ai_providers`

Continue to store:

- `provider_type`
- `base_url`
- `credential_env_key`
- `billing_rules`
- protocol-specific metadata/config as needed

No additional table is required for the first release.

## Admin Configuration

Keep configuration centralized in `/admin/ai-models`.

### Model Form

Add protocol-aware validation:

- `supportsChat` requires a chat protocol.
- Any image capability requires an image-capable protocol.
- `supportsVideoGeneration` requires a video-capable protocol.
- Enabled models must have a provider configuration that satisfies their protocol.

Recommended UX changes:

- Add an explicit protocol field.
- Show separate default badges for chat/image/video.
- Show clearer warnings when a media model cannot be used as an Agent primary model.
- Surface provider-model mismatch errors before enablement.

### Provider Form

Provider validation should fail closed:

- `image_openai_compatible` requires valid `baseUrl` and `credentialEnvKey`.
- `video_task_polling` requires the fields needed for create-task and task-status requests.
- Missing protocol-critical config blocks enabling dependent models.

### Admin Testing

Model/provider test actions should follow capability:

- chat model: lightweight chat round trip
- image model: minimal image generation probe
- video model: create-task plus a bounded status probe

The goal is configuration validation, not full production-like load testing.

## Runtime Design

### Model Resolution

Server resolution must be strict by task type:

- `taskType: "chat"` -> resolve only chat-capable models with chat protocol
- `taskType: "image"` -> resolve only image-capable models with image protocol
- `taskType: "video"` -> resolve only video-capable models with video protocol

If capability or protocol does not match, reject the request even if the model exists and is enabled.

### Media Adapter Abstraction

Add a protocol-oriented adapter boundary instead of provider-name branching:

```ts
type MediaExecutionProtocol =
  | 'image_openai_compatible'
  | 'video_task_polling';

type MediaProviderAdapter = {
  protocol: MediaExecutionProtocol;
  createImage?(request: MediaImageRequest): Promise<ImageProviderResult>;
  createVideoTask?(request: MediaVideoCreateRequest): Promise<VideoTaskCreatedResult>;
  getVideoTask?(request: MediaVideoStatusRequest): Promise<VideoTaskStatusResult>;
};
```

Initial implementations:

- OpenAI-compatible image adapter for Seedream and future compatible image gateways.
- Doubao task-polling video adapter for Seedance.

### Run Service Flow

`/api/agent/runs` keeps one entrypoint but internally dispatches by task type:

- chat -> existing chat orchestration
- image -> media image orchestration
- video -> media video orchestration

For image:

- resolve image model
- validate input
- preflight credits
- call `createImage`
- normalize result
- debit
- complete run

For video:

- resolve video model
- validate input
- preflight credits
- create run
- call `createVideoTask`
- persist provider task metadata
- return running state
- sync through bounded polling route or run-sync flow
- on success normalize usage/result, debit idempotently, complete run

### Frontend Contract

Frontend surfaces should remain provider-agnostic:

- `/image-gen` loads enabled image models from the API
- `/video-gen` loads enabled video models from the API
- UI sees unified run status and result payloads

The frontend does not branch on `doubao`, `seedream`, `seedance`, or future provider names.

## Compatibility With Future OpenAI-Compatible Media Providers

The first extensibility target is OpenAI-compatible media.

That means future providers can join by:

1. creating a provider record with connection config;
2. creating image-capable model records using `image_openai_compatible`;
3. reusing the same API route, admin flow, run-service path, and result rendering.

Only genuinely different execution semantics should require a new protocol. This prevents provider-specific branches from leaking into page code, route code, or general runtime orchestration.

## Boundary Graph

`/admin/ai-models` -> admin form validation -> AI model/provider repository -> `ai_models` and `ai_providers`

`/image-gen` -> `/api/agent/image-models` -> AI model repository -> entitlement/capability filtering

`/video-gen` -> `/api/agent/video-models` -> AI model repository -> entitlement/capability filtering

`/api/agent/runs` -> request validation -> task-type model resolution -> chat or media orchestration -> provider adapter -> run repository -> billing

`/api/agent/runs/[runId]/sync` or equivalent -> video status sync -> provider adapter -> run completion/failure

## Risks And Mitigations

- Admin drift between capability and protocol:
  - enforce validation both in form parsing and server repository mutation.
- Provider-specific behavior leaking into shared runtime:
  - isolate protocol implementations behind adapters.
- Video polling duplication or double billing:
  - use existing run status checks and idempotent debit keys.
- Over-generalization too early:
  - support only the protocols needed now; add more only when a real provider requires them.

## Verification Plan

- Repository and model-resolution tests:
  - media models rejected by chat resolver
  - chat models rejected by image/video resolvers
  - default image/default video behavior remains correct
- Admin validation tests:
  - invalid capability/protocol combinations rejected
  - missing provider protocol config blocks enablement
- Adapter tests:
  - OpenAI-compatible image request/response parsing
  - Doubao video task create/query parsing
- API tests:
  - `/api/agent/image-models`
  - `/api/agent/video-models`
  - `POST /api/agent/runs` rejects mismatched model/task combinations
- Run-service tests:
  - image runs complete with adapter result
  - video runs create provider task and later complete through sync
  - failed video tasks do not debit

## Implementation Direction

Recommended implementation order:

1. Add model execution protocol schema and repository support.
2. Strengthen admin provider/model validation and form UX.
3. Introduce protocol-based media adapter interfaces.
4. Refactor image path onto the protocol abstraction.
5. Implement Doubao Seedance video create/query flow.
6. Wire `/video-gen` to real configured models and sync.
7. Add focused verification for routing, validation, and billing safety.
