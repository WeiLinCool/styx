# Member Video Generation MVP Design

## Context

The current WebUI already has a `/video-gen` client page, public video model listing, `POST /api/agent/runs`, SSE run events, video task polling, provider billing rules, generated media assets, and a Doubao video task adapter. The missing MVP is not the whole runtime. The missing product boundary is configurable member-only video access, dynamic video style prompts, plan-specific duration and resolution options, and optional image/audio materials passed into Doubao Seedance.

Reference research:

- Industry consensus: mature AI video tools separate plan access from model selection and generation parameters. The UI only presents options the current account can use, while the server re-validates on submit.
- Provider shape: Doubao Seedance video generation is an asynchronous task flow. A task is created with text and optional media content, then polled until a generated video URL is returned.
- Local constraints: this repository already models AI model entitlement, provider adapters, member plan versions, media library storage, and agent run polling. The design should extend those owners instead of creating a parallel video job system.

## Scope

Build the smallest member-only video generation path using `Doubao-Seedance-2.0` as the first adapted model.

In scope:

- Admin-configured video style presets with prompt auto-fill.
- Member-only video gate. Free users cannot generate video.
- Plan-specific duration and resolution options configured by admin.
- Local upload and media-library selection for optional image and audio materials.
- Server-side validation of membership, selected options, model availability, and material access.
- Doubao Seedance request support for prompt, duration, resolution, optional image URL, and optional audio URL.
- Reuse existing agent run creation, SSE streaming, sync polling, billing, and generated media result handling.

Out of scope for MVP:

- Multi-image storyboards, video input, subtitles, advanced camera controls, negative prompts, batch generation, and manual retry queues.
- A separate video job dashboard beyond the existing agent run/admin AI job surfaces.
- Free trial video usage.

## Requirements

1. Free users must not be able to submit video generation. The server is the source of truth.
2. Effective members may generate video only with options allowed by their active membership plan.
3. Clicking a video style must fill the prompt field with that style's configured default prompt. Users may edit the prompt after fill.
4. Duration and resolution options must come from admin configuration, not hardcoded page arrays.
5. Image and audio materials are optional. Users may upload local files or choose existing media-library assets.
6. Generation requests must pass material URLs or provider-usable references to Doubao, not large base64 payloads.
7. `Doubao-Seedance-2.0` must be the first production provider/model path for the MVP.

## State Ownership

| State | Owner | Write Entry | Source Of Truth |
| --- | --- | --- | --- |
| Video style preset | Admin video config repository | Admin video config API | Database |
| Plan video entitlement | Membership/video config repository | Admin membership/video config API | Database |
| Current user's available video config | Server domain/API | Read-only projection | Active entitlement plus video config tables |
| Uploaded material asset | Media service/repository | `/api/user/media-assets/upload` | Generated media asset row plus COS object |
| Selected generation options | User video page | Client form state | Derived UI only until submit |
| Video run | Agent run service/repository | `POST /api/agent/runs` and sync route | Agent run tables |
| Billing record | Points/billing service | Run completion | Points ledger |

## Invariants

1. A video run can be created only when the user has an active membership entitlement that enables video generation.
2. The submitted duration and resolution must be members of the server-resolved option set for the user's current plan.
3. Every material asset attached to a run must belong to the requesting user or be otherwise explicitly accessible to that user before a signed URL is issued.
4. The provider adapter receives small structured references and URLs; uploaded file bytes do not live in agent run JSON.

## Architecture

### Admin Configuration

Add a video generation configuration surface under the admin console. The storage model should be explicit rather than hidden inside model metadata:

- `video_style_presets`: code, name, prompt, sort order, enabled flag, timestamps.
- `membership_plan_video_configs`: plan version reference, video enabled flag, allowed durations, allowed resolutions, default duration, default resolution.

This table should be version-aware so scheduled membership changes can carry video entitlements forward with the rest of the plan configuration. The repository API must expose typed video policy objects and tests; callers should not interpret raw JSON blobs.

### User Configuration API

Create a user-facing read endpoint such as `GET /api/agent/video-config`.

Response:

- `enabled`: false for free or ineligible accounts.
- `upgradeRequired`: true when video is blocked by membership.
- `styles`: enabled style presets ordered by admin sort.
- `durations`: allowed numeric seconds for the user's plan.
- `resolutions`: allowed provider resolution values and display labels.
- `defaults`: default style, duration, and resolution.
- `models`: available video models from the existing entitlement-aware model listing.

The client page should stop hardcoding `VIDEO_STYLES`, `DURATIONS`, and `CLARITIES`.

### User Video Page

The `/video-gen` page should:

- Load video config after login and activation checks.
- Show member upgrade messaging for free users.
- Render style buttons from config; clicking a style replaces the prompt with the style prompt.
- Render duration/resolution controls from config.
- Support selecting image/audio from local upload or media library.
- Upload local materials before run creation and submit asset IDs to the server.
- Preserve existing SSE and sync behavior for generated video completion.

### Material Handling

Extend media upload support to include audio MIME types needed for the MVP, for example `audio/mpeg`, `audio/wav`, and `audio/mp4` if the provider accepts them. Media library DTOs must include enough kind/type metadata for the picker to filter images and audio.

On generation submit, the client sends material asset IDs, not public URLs. The server resolves ownership and creates provider-usable signed URLs with appropriate expiry. Signed URLs should be short-lived and only created during run creation or provider task creation.

### Agent Run Validation

Extend `POST /api/agent/runs` video input validation:

- `durationSeconds`: number, allowed values resolved server-side.
- `resolution`: string, allowed values resolved server-side.
- `stylePresetId` or `stylePresetCode`: optional, must reference an enabled preset if present.
- `imageAssetId`: optional UUID.
- `audioAssetId`: optional UUID.

The API route should validate shape; the agent run service or a video policy service should validate authority and allowed values.

### Doubao Adapter

Extend `VideoProviderCreateRequest` with optional image and audio URLs. The Doubao video task body should include text plus optional media content entries according to the provider protocol supported by `Doubao-Seedance-2.0`.

The adapter should keep existing suffix handling for duration and resolution, unless provider docs or tests require separate fields. Parsing remains task ID on create and video URL on status.

### Billing

Use the existing video billing rule support. The durable run input must store canonical `durationSeconds` and `resolution` so `calculateMediaRunCreditCost` can apply duration seconds and resolution multipliers consistently.

## Error Handling

- Free user: return a member-upgrade response from the config endpoint and a fail-closed error from run creation.
- Missing config for a member plan: disable generation with a clear admin-configuration error.
- Invalid duration/resolution: reject with `invalid_request`.
- Material not found or not owned: reject with `forbidden` or `invalid_request`.
- Provider misconfiguration: reuse `provider_unconfigured`.
- Provider failure: reuse `provider_error` / run failed event path.

## Verification

Lowest meaningful checks:

- Unit tests for video policy resolution: free blocked, member enabled, plan options filtered, defaults valid.
- API validation tests for video run input and material IDs.
- Repository tests for video config persistence and version/plan projection.
- Adapter tests for Doubao request body with text only, image, audio, and image+audio.
- Existing agent run service tests extended to canonical `durationSeconds` and `resolution`.
- `pnpm validate`.
- `pnpm build` for route/client wiring.
- Browser verification for `/video-gen` member gate, prompt auto-fill, option rendering, upload/select controls, and submit disabled states.

## Open Decisions Resolved

- Video is a premium member feature. Free users cannot generate.
- MVP supports plan-specific duration and resolution options.
- Style prompts are managed by admin and dynamically loaded by the user page.
- Image and audio materials are optional.
- Materials can come from local upload or the user's media library.
- The first provider/model target is Doubao `Doubao-Seedance-2.0`.
