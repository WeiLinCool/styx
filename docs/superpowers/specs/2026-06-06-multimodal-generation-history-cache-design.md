# Multimodal Generation History And Temporary Cache Design

Status: Draft
Change: `multimodal-generation-history-cache`
Date: 2026-06-06

## Summary

Image and video generation should behave like recoverable AI conversations instead of one-off page-local tasks. A submitted multimodal task becomes an `agent_run`, appears in user-owned history, continues in the background, and stores completed media in a server-owned temporary cache. The cached result can be previewed from run detail and promoted to the formal media library only when the user clicks "存储媒体".

The design uses the existing agent runtime and media library boundaries:

- `agent_runs` remains the durable task and history source of truth.
- `agent_artifacts` stores safe output metadata and temporary cache references.
- A new media cache service stores generated media bytes in object storage temporary paths.
- `generated_media_assets` remains the formal user media library.
- `save-generated-media` promotes cached artifacts into formal media assets idempotently.

## Current State

Relevant existing structure:

- `src/app/image-gen/page.tsx` submits image runs, listens to SSE, and stores the latest generated result in client state.
- `src/app/video-gen/page.tsx` submits video runs, polls/syncs provider status, and stores the latest generated result in client state.
- `src/app/api/agent/runs/route.ts` validates run creation and returns a run plus transient artifacts.
- `src/server/agent/run-service.ts` owns chat/image/video orchestration, billing, artifacts, and stream events.
- `src/server/repositories/agent-runs.ts` owns `agent_runs`, `agent_artifacts`, and stream event persistence.
- `src/server/media/save-generated-media.ts` creates formal `generated_media_assets` from a provider `sourceUrl`.
- `src/server/media/cos-client.ts` already provides Tencent COS upload/signing behavior.

The current model is close to the desired architecture but has two gaps:

1. Image/video result rendering depends too heavily on immediate client state and stream payloads.
2. Completed generated media may only be represented by provider URLs until formal save, so "稍后回来查看" can fail if the provider URL expires.

## Requirements

Functional requirements:

- Users can list recent own image/video generation runs.
- Users can open a prior run and see prompt, model, input summary, status, billing/save state, and result preview when available.
- After submitting image/video generation, the UI tells users the task is running in the background and can be checked later.
- Provider outputs are cached server-side before a completed result is treated as recoverable.
- Cached outputs do not appear in "我的媒体" and do not become formal saved assets until explicit user save.
- Explicit save promotes a cached artifact to `generated_media_assets` and is idempotent.

Non-functional requirements:

- Large generated media bytes must not be stored in Postgres JSON/text fields.
- API routes must enforce active account and ownership checks before preview/save operations.
- Middleware remains untouched and Edge-safe.
- Existing formal media asset semantics remain intact.
- Existing video provider sync behavior remains compatible.

## State Model

### Run

Owner: `agent_runs` through `AgentRunRepository`

Important fields:

- `taskType`: `image` or `video`
- `status`: `queued`, `running`, `succeeded`, `failed`, `cancelled`
- `prompt`
- `capabilitySnapshot`: model/provider/billing metadata
- `input`: sanitized input parameters
- `conversationId`: existing grouping identifier

### Artifact

Owner: `agent_artifacts`

For generated image/video outputs, metadata should include:

```ts
type GeneratedMediaCacheArtifactMetadata = {
  storageStatus: 'cached' | 'provider_direct' | 'stored';
  cacheStatus?: 'available' | 'expired' | 'cache_failed';
  cacheObjectKey?: string;
  cacheBucket?: string;
  cacheRegion?: string;
  cacheProvider?: 'tencent_cos';
  cacheExpiresAt?: string;
  sourceUrl?: string;
  providerExpiresAt?: string | null;
  saveStatus?: 'not_saved' | 'saving' | 'saved' | 'save_failed' | 'source_expired';
  savedAssetId?: string;
  saveError?: string;
  mimeType?: string;
  filename?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  byteLength?: number;
  providerTaskId?: string;
  model?: string;
};
```

The artifact `body` and `url` fields should remain null for cached media. The client obtains preview URLs through an ownership-checked access route, not directly from stored object keys.

### Temporary Cache Object

Owner: new `src/server/media/generated-media-cache.ts`

Object path recommendation:

```text
ai-generated-cache/<env>/users/<userId>/runs/<runId>/<artifactId-or-cacheId>.<ext>
```

Default retention recommendation: 7 days for MVP. Retention should be config-driven so production can lower it if cost or policy requires.

### Formal Media Asset

Owner: `generated_media_assets`

Formal assets are only created by explicit save/promotion. A cached object can be copied into the existing formal path pattern or registered as formal only if storage lifecycle policy allows the object to become durable. The safer MVP is copy-to-formal-path, then create the `generated_media_assets` row.

## Core Flows

### Submit Image

1. UI validates local form state and calls `createAgentRun({ taskType: 'image', ... })`.
2. API validates active account, prompt, model, mode, and source image when required.
3. Run service creates and marks an image run running.
4. API returns the running run promptly.
5. UI inserts the run into image history and shows: "任务已在后台运行，你可以稍后回来查看结果。"
6. Existing SSE can remain open as an acceleration path, but history/detail is the durable recovery path.

### Complete Image

1. Provider returns one or more image artifacts.
2. Run service calculates/debits credits as today.
3. For each accepted image artifact, cache service stores the media output into temporary object storage.
4. Repository completes run with sanitized artifacts containing cache metadata.
5. Stream event can include a direct renderable payload if the user is still connected.
6. Later run detail can reconstruct a preview by requesting signed cache access.

### Submit And Complete Video

Video submit currently creates a provider task and returns a running run. The design preserves that.

1. Submit validates account, model, policy, duration, resolution, and selected materials.
2. Run service stores provider task id.
3. UI shows background-running copy and history entry.
4. Sync/poll obtains provider result.
5. Before presenting recoverable success, sync caches the video output and stores artifact cache metadata.
6. Run detail loads cached/saved preview state.

### Preview Cached Artifact

Add a route such as:

```text
GET /api/agent/runs/[runId]/artifacts/[artifactId]/access
```

Behavior:

- Require active account.
- Load run detail for `(runId, userId)`.
- Find image/video artifact.
- If `savedAssetId` exists, delegate to formal media access behavior or return formal access metadata.
- If cache metadata is available and not expired, sign cache object for short-lived preview/download.
- If unavailable or expired, return a stable unavailable/expired error.

### Save Cached Artifact

Extend existing:

```text
POST /api/user/media-assets
body: { runId, artifactId }
```

Preferred behavior:

1. Check whether a formal asset already exists for `(runId, artifactId)`.
2. Load owned run detail and eligible artifact.
3. If artifact has available cache metadata, copy cached object to formal object key and create `generated_media_assets`.
4. If no cache metadata exists, fall back to existing provider `sourceUrl` flow for legacy artifacts.
5. Update artifact metadata to `saveStatus: 'saved'` with `savedAssetId`.

## API And Client Contracts

### Run Listing

Existing `listAgentRuns()` returns all recent runs. The implementation should add task-type filtering rather than forcing the pages to filter a mixed history locally.

Recommended route shape:

```text
GET /api/agent/runs?taskType=image
GET /api/agent/runs?taskType=video
```

The route must accept only known `AgentTaskType` values and return only runs owned by the active user.

### Client DTO

Extend `DirectMediaResultDto` parsing to support:

- `storageStatus: 'cached'`
- cache preview access being requested separately
- `saveStatus`, `savedAssetId`, and expiration states

Avoid putting signed URLs permanently into run DTOs. Signed URLs should be short-lived access responses.

## UI Design

### Image Page

Add a history area to `/image-gen`:

- Recent image runs across generate, HD repair, and style transfer.
- Status labels: running, succeeded, failed, expired, saved.
- Thumbnail when cached/saved.
- Select run to show detail.
- "复用提示词" or direct form prefill for adjustment.
- "存储媒体" only when eligible.

### Video Page

Add analogous video history:

- Running rows can call sync/refresh.
- Completed rows show preview if cached/saved.
- Failed rows show message and retry affordance.
- Material selections from old runs can be reused only when still valid and owned.

### Copy

Use explicit asynchronous language:

- Submission success: "任务已在后台运行，你可以稍后回来查看结果。"
- Running state: "后台生成中，不需要保持页面打开。"
- Cached unsaved: "结果已临时缓存，存储媒体后会进入我的媒体。"
- Expired: "临时结果已过期，无法预览或保存。"

## Failure Modes

| Failure | Expected Behavior |
| --- | --- |
| Provider request fails | Run failed; no cache object required. |
| Provider succeeds but cache write fails | Do not present durable success. Mark run failed or artifact cache failed with visible message. |
| Billing fails after provider success | Preserve existing billing-failed semantics; artifacts may be persisted as failed according to current run-service behavior. |
| Cache expires before save | Preview/save unavailable unless `savedAssetId` exists. |
| Save copy/upload fails | Artifact save state becomes `save_failed`; user can retry. |
| Duplicate save | Existing formal asset is returned. |
| Cross-user preview/save | Reject; no signed URL or asset is created. |

## Implementation Notes

### Media Cache Service

Create `src/server/media/generated-media-cache.ts` with focused functions:

```ts
type CacheGeneratedMediaInput = {
  userId: string;
  runId: string;
  artifactId: string;
  kind: 'image' | 'video';
  title: string;
  sourceUrl?: string;
  dataUrl?: string;
  mimeType?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
};

type CachedGeneratedMedia = {
  storageProvider: 'tencent_cos';
  bucket: string;
  region: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  expiresAt: string;
  metadata: Record<string, unknown>;
};
```

Reuse existing download logic from `save-generated-media` where practical, but keep cache and formal save as separate services. The cache service should not create `generated_media_assets`.

### Run Repository

Add or adjust repository methods:

- `listRunsForUser(userId, { taskType?: AgentTaskType })`
- keep existing all-runs behavior for compatibility
- `getRunDetailForUser` remains the ownership-checked detail source

Avoid widening `listConversationRunsForUser` for chat context assembly unless chat behavior explicitly requires it. For multimodal pages, task-filtered run listing is clearer.

### Save Service

Extend `createSaveGeneratedMediaService` with dependencies for cache access/copy:

- `copyCachedObjectToFormalObject` or a COS client method that can copy by object key
- `getCachedObjectMetadata` if metadata is not fully trusted from artifact metadata
- fallback `fetchSource` remains for legacy/provider-direct artifacts

If COS copy is unavailable in the local client wrapper, implement save from cache by signed/fetched cache URL or by downloading object bytes through a storage read method. Prefer copy/read from storage over refetching provider URL.

## Testing Plan

Focused tests should cover:

- `parse/list` route task type filtering.
- Repository preserves cache metadata and isolates users.
- Cache service writes from provider URL and data URL.
- Run service image completion stores cached artifact metadata.
- Video sync completion stores cached artifact metadata.
- Save service promotes cached object, handles duplicates, rejects cross-user access, and falls back to provider URL for legacy artifacts.
- Client parser accepts cached media result state and rejects malformed access payloads.

## Acceptance Criteria

- A user can submit image/video generation and immediately see a background-running message.
- The new run appears in the relevant history list.
- A completed generated result remains visible after refresh when cache is available.
- Unsaved cached output is clearly distinct from "我的媒体".
- Clicking "存储媒体" creates or returns a formal media asset and updates the artifact as saved.
- Cross-user access and save attempts fail closed.
- Validation and build checks pass or blockers are documented.
