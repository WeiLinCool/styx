# Direct Media Result Push Design

Date: 2026-06-01
Scope: user-facing `/image-gen` and `/video-gen` MVP
Classification: Large

## Goal

Complete the first web loop for AI image and AI video generation by pushing model results directly to the browser as soon as the provider response is available.

The MVP does not transfer generated media into OSS/TOS/COS. It keeps the media delivery path lightweight:

1. The user submits an authenticated image or video generation request.
2. The server creates an `agent_run` and returns the running run immediately.
3. The browser subscribes to the existing run SSE endpoint.
4. The server emits media progress and completion events when the runtime/provider has a result.
5. The browser previews and downloads the returned provider result directly.

OSS storage is intentionally reserved for a later phase through a storage handoff boundary, but it is not enabled in this MVP.

## Existing Context

The repository already has the core pieces needed for this shape:

- `/api/agent/runs` creates authenticated agent runs.
- `/api/agent/runs/[runId]/events` streams persisted run events over SSE.
- Chat runs already return quickly and complete in background orchestration.
- `agent_runs`, `agent_run_stream_events`, and `agent_artifacts` persist task state, event state, and artifact summaries.
- `/image-gen` currently handles transient image results from the immediate POST response.
- `/video-gen` currently submits a video run but does not receive a usable preview result.

This change extends the existing chat-style asynchronous run pattern to media tasks instead of adding a separate media job queue.

## Reference Research

Industry consensus: asynchronous AI media APIs commonly separate task creation from result readiness, then expose progress/completion through polling, callbacks, or event streams. Generated media is often returned as a temporary provider URL before the application chooses whether to persist it.

Transferable principle: the application should make task state durable and idempotent, while treating provider media URLs as short-lived delivery payloads unless the product has explicitly taken ownership by copying them to application storage.

Repository constraints: this app already has App Router API routes, a server-owned agent run service, persisted SSE events, account guards, and existing image/video pages. Reusing that path preserves auditability and avoids a second job model for the MVP.

Local design: create media runs as durable `agent_runs`, stream progress and completion through `agent_run_stream_events`, direct-push provider media URLs or data URLs to the active browser, and persist only artifact summaries marked as externally delivered or transient.

## State Ownership

| State | Owner | Write Entry | Source Of Truth | Notes |
| --- | --- | --- | --- | --- |
| Media run lifecycle | `agent_runs` repository | agent run service | database | `queued -> running -> succeeded/failed`. |
| Streamed progress/results | `agent_run_stream_events` | media orchestration | database event log | SSE endpoint only reads persisted events. |
| Prompt and generation options | agent run service | `/api/agent/runs` | database | Store non-sensitive request options. |
| Provider temporary media URL or data URL | active browser session | SSE `artifact_completed` event | current page state | Not guaranteed recoverable after refresh. |
| Durable artifact summary | `agent_artifacts` | agent run service | database | Records kind/title/status/metadata, not app-owned media bytes. |
| Future OSS object URL | future storage adapter | media storage handoff | object storage + database | Out of scope for MVP. |

## Invariants

1. A media run must be recoverably auditable even if the provider media URL expires later.
2. The MVP must not claim that generated media has been saved to application storage.
3. The server must not write generated media files to local disk.
4. SSE events are the user-facing delivery channel for media progress and completion.
5. Persisted artifact summaries must distinguish provider-delivered/transient media from future app-owned storage media.

## Architecture

### Run Creation

`POST /api/agent/runs` remains the entrypoint for `taskType: 'image' | 'video'`.

For media tasks, the service should:

- resolve the existing default capability bundle;
- create an `agent_run`;
- mark it `running`;
- start background media orchestration;
- return the running run immediately with no required transient artifact payload.

This mirrors the current chat behavior and lets the page subscribe to events by run id.

### Media Orchestration

The media orchestration path should emit:

- `artifact_started` when the provider task starts;
- `artifact_progress` for known progress/status updates when available;
- `artifact_completed` when a provider result URL or data URL is available;
- `run_completed` when the run has been marked succeeded;
- `run_failed` on provider, runtime, validation, or billing failure.

Provider-specific adapters can normalize provider output into a common media result:

```ts
type MediaProviderResult = {
  kind: 'image' | 'video';
  title: string;
  delivery: {
    mode: 'provider_url' | 'data_url';
    url: string;
    expiresAt?: string | null;
  };
  metadata: {
    mimeType?: string;
    filename?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
    providerTaskId?: string;
    model?: string;
  };
};
```

The event payload should include enough data for the browser to preview and download:

```ts
{
  artifact: {
    kind: 'image' | 'video',
    title: string,
    delivery: {
      mode: 'provider_url' | 'data_url',
      url: string,
      expiresAt: string | null
    },
    metadata: {
      mimeType?: string,
      filename?: string,
      width?: number,
      height?: number,
      durationSeconds?: number,
      storageStatus: 'provider_direct'
    }
  }
}
```

### Persistence

When a media task succeeds, `agent_artifacts` should store only the durable summary:

- `kind`: `image` or `video`
- `title`: generated media title
- `body`: `null`
- `url`: `null` for MVP direct-push results
- `metadata.storageStatus`: `provider_direct`
- `metadata.deliveryMode`: `provider_url` or `data_url`
- `metadata.providerExpiresAt`: optional expiry timestamp
- safe media metadata such as MIME type, filename, dimensions, duration, provider/model identifiers

If the later OSS phase is enabled, the same artifact can move to:

- `metadata.storageStatus: 'stored'`
- `url`: application-owned OSS/TOS/COS playback URL
- additional storage object metadata

### OSS Reservation

Add no OSS dependency in this MVP. Reserve the boundary by keeping media result normalization separate from storage ownership:

```ts
type MediaStorageHandoff = {
  store(result: MediaProviderResult, context: { runId: string; userId: string }): Promise<StoredMediaResult>;
};
```

The MVP implementation uses no-op direct delivery and marks `storageStatus: 'provider_direct'`. A later OSS implementation can stream-copy from the provider URL to object storage without changing page-level event handling.

## UI Design

`/image-gen` and `/video-gen` should both move to the same interaction pattern:

1. Submit prompt/options.
2. Receive a running run id.
3. Open `EventSource(createAgentRunEventsUrl(run.id))`.
4. Render running/progress state from events.
5. Render media preview on `artifact_completed`.
6. Keep the download action next to the preview.
7. Show a direct-delivery warning:

   `生成结果暂未保存到云端，请及时下载。链接可能过期，刷新或离开页面后可能无法恢复。`

Image preview uses `img`; video preview uses `video controls`.

If the run fails, the page should close the EventSource, show the stable error message, and keep any prior completed result clearly separate from the failed run.

## Error Handling

- Authentication and account activation continue to fail before run creation.
- Missing media capability bundles create a failed run and emit `run_failed`.
- Provider errors mark the run failed and emit `run_failed`.
- Completion without a usable media URL/data URL marks the run failed with a clear incomplete-output message.
- SSE disconnects do not cancel the server task. The user may reload recent run details, but direct provider media is not guaranteed to be recoverable in this MVP.

## Boundaries

- Route handlers validate request shape and account state.
- Agent run service owns lifecycle transitions and event emission.
- Provider/runtime adapters own provider request and response normalization.
- Repositories own persisted query shape.
- UI owns current-session media preview/download state.
- Future storage adapters own application storage transfer and storage URL generation.

## Verification Plan

Focused checks:

1. Service test: media run returns `running` immediately and completes asynchronously.
2. Service/repository test: media orchestration emits `artifact_started`, `artifact_completed`, and `run_completed` events.
3. Persistence test: completed media artifact summary stores no body, no app-owned URL, and `storageStatus: 'provider_direct'`.
4. API/client test: media create response returns a run id that can be used with the existing SSE URL helper.
5. UI/browser check: `/image-gen` and `/video-gen` render progress, preview, download action, and direct-delivery warning.

General checks:

- Run focused service/API/client tests touched by the implementation.
- Run `pnpm validate`; if existing unrelated type errors remain, report exact blockers.
- Run `pnpm build` for App Router wiring.
- Use browser verification for the user-visible image and video pages when the local app can serve them.

