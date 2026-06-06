## Context

The repository already has durable agent run infrastructure:

- `agent_runs` stores task type, status, prompt, selected model snapshots, billing state, and conversation IDs.
- `agent_artifacts` stores safe artifact summaries.
- `agent_run_stream_events` stores SSE-style events.
- `generated_media_assets` stores formal user media assets in Tencent COS and powers "我的媒体".
- `save-generated-media` currently downloads a provider `sourceUrl` and creates a formal media asset only when the user clicks save.

Current image/video generation still has a user-experience gap. The page submits a run and listens to SSE/polling, but the useful generated media is shown mainly through immediate event payloads or provider URLs. If the user leaves and returns later, the page does not present a first-class multimodal task history with recoverable result previews. Provider URLs may also expire before the user clicks save.

Mature asynchronous AI generation systems converge on the same contract: creation returns an id quickly, clients recover status/output by id or webhook/polling, and the application must own storage if it promises results beyond the provider retention window. Locally, that means `agent_runs` should own history/state and a server-side temporary cache should own recoverable generated media until the user promotes it to formal media.

## Goals / Non-Goals

Goals:

- Make image and video tasks visible in a list/history similar to AI chat records.
- Let task creation return quickly with clear "后台运行中，可稍后回来查看结果" feedback.
- Cache generated image/video output server-side when provider generation succeeds.
- Let run detail render completed media from cache after navigation/refresh.
- Promote cached media to formal `generated_media_assets` only after explicit user action.
- Preserve billing, entitlement, account, and run ownership boundaries.

Non-goals:

- Build a production-grade distributed job queue in this change.
- Auto-save every generated result into the formal user media library.
- Change admin model/provider configuration.
- Change credit pricing semantics except where save/cache state must be exposed.
- Guarantee recovery for tasks lost by process crash before the provider task id or output is persisted. Video provider task sync remains the recovery mechanism for provider-side jobs.

## Design Summary

Adopt "方案 B": server-owned temporary cache with explicit formal save.

```
User submits prompt
  -> API validates input/account/model
  -> agent_run is created/running and returned immediately
  -> UI shows background-running notice and adds run to history
  -> provider completes asynchronously
  -> server downloads/copies output to temporary media cache
  -> agent_artifact stores cache reference + preview metadata
  -> user opens history/detail and previews cached output
  -> user clicks 存储媒体
  -> cached object is promoted/copied/registered as generated_media_asset
```

## State Ownership

| State | Owner | Write Entry | Source Of Truth / Recovery |
| --- | --- | --- | --- |
| Run status, prompt, model, billing | `agent_runs` via agent run repository | `createAgentRunService`, sync endpoint | Database |
| Stream/progress events | `agent_run_stream_events` | run service orchestration and sync | Database, observational |
| Generated output preview/cache reference | `agent_artifacts.metadata` plus temporary cache storage | media cache service after provider success | Database reference + temporary object |
| Formal media library asset | `generated_media_assets` | save/promote generated media service | Database + COS object |
| Client current selection/input form | image/video page state | React page | Derived UI only |

## Invariants

1. A generated image/video result that is visible after refresh must have a server-owned cache reference or formal saved asset reference; it must not depend only on transient browser state.
2. Temporary cached generated media is not a formal user media asset and must not appear in "我的媒体" or count as saved media quota until explicit save/promotion.
3. A user may only list, preview, or save cached generated media through a run they own.
4. Saving is idempotent for the same `(runId, artifactId)` and must not create duplicate formal assets.
5. API routes validate input and ownership before calling domain services; UI does not own durable truth.

## Architecture Decisions

### Reuse Agent Runs And Conversations

Image and video generation should use the existing `agent_runs.conversationId` model rather than introducing separate "generation sessions". The repository currently has a chat-only conversation listing path; this change should generalize the relevant list/detail behavior so image/video runs can appear in user-visible history.

Rationale: the main durable unit is already a run. Adding a separate history table would duplicate ownership, deletion, and audit semantics.

### Add A Temporary Media Cache Layer

Introduce a focused server media cache abstraction. The MVP can use DB metadata plus Tencent COS temporary object keys, with an implementation boundary that can later be backed by Redis metadata if needed.

Expected behavior:

- Given a direct media result or provider URL/data URL, create a temporary cached object.
- Return cache metadata: provider, bucket/key or cache key, mime type, byte size, dimensions/duration when known, and expiration/retention metadata.
- Expose short-lived preview access only after run ownership is checked.
- Mark artifact metadata with `storageStatus: "cached"` or equivalent, `cacheStatus`, `cacheKey/objectKey`, and typed media metadata.

Rationale: Redis is suitable for short metadata, not large images/videos. Large media bytes should be in object storage; DB stores durable references and lifecycle metadata.

### Promote Cached Media On Explicit Save

Update `save-generated-media` so it can save from either:

- an unsaved cached object, preferred path; or
- a provider `sourceUrl`, fallback for legacy/uncached artifacts while still valid.

Promotion should reuse/copy the cached object into the formal generated-media path or register it as formal according to storage constraints. After success, artifact metadata is updated with `saveStatus: "saved"` and `savedAssetId`.

### Return Fast And Continue In Background

For image/video pages, successful submission should immediately add a run card and show copy such as:

> 任务已在后台运行，你可以稍后回来查看结果。

The page may keep SSE/polling open when present, but it must not imply the user needs to wait on the page. History/detail reload must be the durable recovery path.

### Recovery Boundaries

For the MVP, "background" means the current application process schedules existing orchestration and persisted provider tasks can be resynced where supported, especially video. This change should not claim durable distributed queue guarantees unless a queue worker is actually introduced.

If an image provider call is running only inside a process and the process dies before output is persisted, the run may remain running/failed according to existing recovery behavior. The UI should handle stale running states gracefully.

## UI / Information Architecture

Add a task history panel or list to `/image-gen` and `/video-gen`:

- Show recent own runs filtered by task type.
- Each row/card shows prompt summary, status, selected model label, created time, billing/save status, and result thumbnail/video preview when cached or saved.
- Selecting a record loads detail and can prefill prompt/options for adjustment.
- Running records show "后台运行中" and can be refreshed/synced.
- Failed records show failure reason and allow retry with the same input when safe.
- Completed unsaved records show "存储媒体".
- Saved records show "已保存到我的媒体".

For implementation pragmatism, this can start as a right-side or lower history column inside the existing generation pages rather than introducing a new route.

## Data Flow

### Submit

1. UI calls `POST /api/agent/runs` with task type, prompt, model, input.
2. API validates active account and request shape.
3. Run service creates a run and starts/schedules execution.
4. API returns `run` quickly.
5. UI inserts/updates run in local history and shows background-running feedback.

### Complete

1. Provider returns image/video output.
2. Run service bills as today.
3. Media cache service stores/copies output to temporary object storage.
4. Repository completes run with sanitized artifact metadata that points to the cache, not raw large media.
5. Stream event includes a renderable direct/cached media payload when the client is still connected.
6. Later `GET /api/agent/runs/[runId]` returns enough metadata for the client to request preview access.

### Preview

1. UI loads run detail.
2. If artifact is cached/saved, UI requests signed access through a user-owned run/media access route.
3. Server checks active account and run ownership before returning a short-lived URL.

### Save

1. UI calls existing `POST /api/user/media-assets` with `runId` and `artifactId`.
2. Service checks run ownership and artifact eligibility.
3. Service promotes cached object or falls back to source URL.
4. Service creates/returns formal `generated_media_assets` and updates artifact save state.

## Error Handling

- Provider failure: run becomes failed with error message; no cache object is required.
- Cache write failure after provider success: run should be failed or marked with a cache failure state that is clearly visible; do not silently show a non-recoverable success.
- Save promotion failure: artifact gets `saveStatus: "save_failed"` and `saveError`; run remains completed.
- Expired cache: UI shows "临时结果已过期，无法预览/保存" unless a formal saved asset exists.
- Duplicate save: return existing saved asset and keep artifact metadata in saved state.

## Boundary Graph

```
src/app/image-gen, src/app/video-gen
  -> features/public/agent-runtime-client
  -> app/api/agent/runs + app/api/user/media-assets
  -> server/agent/run-service
  -> server/media/generated-media-cache + save-generated-media
  -> server/repositories/agent-runs + generated-media-assets
  -> server/db/schema + object storage
```

## Verification Strategy

- Unit tests for media cache metadata parsing and promotion decisions.
- Repository tests for listing image/video runs and artifact cache/save metadata.
- Route tests for run creation validation, run detail ownership, and save idempotency.
- Service tests for provider output -> cache -> artifact -> save promotion.
- `pnpm validate` for type/lint coverage.
- `pnpm db:generate` and migration review if schema changes.
- Browser verification for `/image-gen` and `/video-gen` running/completed/history/save states when local auth/database are available.

## Open Questions

- Retention period for temporary cached media should be configured. Default recommendation: 7 days for MVP unless product wants a shorter retention.
- Exact UI placement can be decided during implementation, but the first version should prioritize recoverability and clarity over a full gallery redesign.
