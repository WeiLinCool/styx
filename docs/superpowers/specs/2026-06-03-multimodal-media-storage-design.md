# Multimodal Media Storage Design

## Context

The application already supports user-facing chat, image generation, and video generation through the agent runtime:

- `src/app/api/agent/runs/route.ts` validates run requests, requires active user sessions, and routes generation through `src/server/agent/run-service.ts`.
- `src/server/agent/run-service.ts` currently treats image and video outputs as direct-delivery results. It pushes provider URLs or data URLs to the client and persists only sanitized artifact summaries into `agent_artifacts`.
- `src/server/repositories/agent-runs.ts` persists `agent_runs`, `agent_artifacts`, run events, and stream events with per-user ownership enforced by repository read methods.
- `src/server/db/schema.ts` currently has no durable media asset table and no user-owned storage-quota state.

Recent verification and specs confirm the current baseline:

- generated image and video outputs are intentionally not stored in OSS/TOS/COS;
- the user can see and download the direct result immediately after generation;
- persisted artifacts only retain scrubbed metadata and no durable reusable media pointer.

The requested closure changes that model, but with two explicit product constraints:

1. Model generation success and model billing must not depend on COS availability.
2. Generated media must enter long-term storage only when the user explicitly chooses to save it to “我的媒体”, because future product plans treat this as paid disk/cloud-drive storage rather than unlimited retention.

That means the system must now represent two different truths:

- **Conversation truth:** what the model generated, what the user saw, whether the generation was billed.
- **Cloud-drive truth:** what the user explicitly saved, what occupies durable storage, and what can be reused across multimodal conversations.

## Goals

- Keep current image/video generation behavior: users still see generation results immediately when the provider succeeds.
- Add an explicit user-facing “我的媒体” storage module for saved generated images and videos.
- Allow users to save generated outputs from conversation results into “我的媒体”.
- Allow users to reuse saved media across future multimodal conversations by selecting owned assets instead of resending raw external URLs.
- Preserve per-conversation traceability so each run can show which outputs were generated and whether they were later saved.
- Add admin audit surfaces that show the generation layer and the storage layer separately, including media link visibility needed for operational review.
- Enforce strict per-user data isolation for storage, retrieval, reuse, and save actions.
- Prepare the product for future storage quota billing without forcing durable storage on every generation.

## Non-Goals

- Persisting user-uploaded source images or videos in this change.
- Automatically storing every generated image or video in COS.
- Implementing team-shared or tenant-shared media libraries.
- Building a full background worker platform beyond what is required for bounded save operations.
- Introducing content moderation, deduplication, or media version history in the first release.
- Refactoring chat history persistence beyond the media-specific additions needed for reuse and audit.

## Industry Consensus -> Transferable Principle -> Local Design

Industry consensus: media-generation systems often separate transient delivery from durable asset management. Generation success is charged when the provider completes usable output, while optional durable storage is treated as a separate lifecycle with its own quota, retention, and retry semantics.

Transferable principle: do not make provider success, user delivery, and optional durable storage share the same status bit or billing authority. Treat generated outputs as conversation artifacts first, then promote them to durable user-owned assets only through an explicit save flow.

Repository constraints: route handlers validate transport input, server domain code owns policy, repositories own persistence shape, admin access must fail closed, and the current run-service already distinguishes direct-delivery media from durable run artifacts.

Local design: keep `agent_runs` authoritative for generation lifecycle and billing, add a new user-owned media asset table for explicit cloud-drive saves, and bridge the two using per-artifact save state plus explicit save APIs that never trust client-supplied URLs or storage coordinates.

## State Ownership

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| Generation success/failure | Agent run service | `createAndRun...AgentRun` orchestration | `agent_runs.status` |
| Provider-delivered media summary | Agent run service | run completion + stream event append | `agent_artifacts` + run stream events |
| Whether an artifact was saved to “我的媒体” | Media save service | explicit user save API | `agent_artifacts.metadata.saveStatus` and `savedAssetId` |
| Durable saved media asset | Media asset repository | explicit user save API | `generated_media_assets` |
| User storage quota and used bytes | account/storage domain | save success / delete success | durable account storage fields |
| Admin audit view | admin repositories/features | read-only aggregation | run snapshots + artifacts + saved assets + ledger data |

## Invariants

1. A model generation that produced usable media and was delivered to the user remains a successful billed generation even if later COS persistence fails or is never requested.
2. Durable storage consumption is created only by explicit user save actions that complete successfully; unsaved generated outputs do not consume cloud-drive quota.
3. Every saved media asset belongs to exactly one `userId` and must trace back to a run and artifact owned by the same `userId`.
4. Client requests may reference only internal identifiers such as `runId`, `artifactId`, and `assetId`; the client never supplies trusted provider URLs, COS object keys, or ownership fields.
5. User-facing media reuse must resolve from owned saved assets, not from stale provider-direct URLs.

## Mutable State Table

| State | Values | Allowed transitions | Notes |
| --- | --- | --- | --- |
| `agent_runs.status` | `queued`, `running`, `succeeded`, `failed` | existing runtime flow | Saving to media library does not change run status. |
| `agent_artifacts.metadata.saveStatus` | `not_saved`, `saving`, `saved`, `save_failed`, `source_expired` | `not_saved -> saving -> saved`; `saving -> save_failed`; `not_saved/save_failed -> source_expired` | This is conversation-level status, not durable asset truth. |
| `generated_media_assets.status` | `ready`, `deleted` | `ready -> deleted` | Keep first release simple; failed saves do not create durable assets. |
| storage usage | numeric bytes | increase on save success, decrease on delete success | Source of truth must exclude deleted assets. |

## User Experience Model

### Conversation Result Surface

Generated image/video result cards continue to appear immediately when provider generation succeeds. Each card must present:

- preview/playback;
- download action;
- save action when eligible;
- save status badge.

Status semantics:

- `临时结果`: generation succeeded, not yet saved.
- `保存中`: save request accepted and currently uploading/persisting.
- `已保存`: saved into “我的媒体”.
- `保存失败`: save attempt failed but can be retried while the provider source is still usable.
- `源文件已失效`: save is no longer possible because the provider-direct source expired.

Generation completion copy must never imply durable storage. The UI should explicitly distinguish:

- “本次生成已完成”
- “是否保存到我的媒体”

### “我的媒体” Module

Add a dedicated user-facing storage module with:

- image/video filter or tabs;
- preview card/list;
- source model;
- generated time;
- file size;
- link back to the originating conversation/run;
- delete action;
- reuse action for insertion into a new multimodal request.

This module is a cloud-drive surface, not merely a conversation history view.

### Reuse in Future Multimodal Conversations

When the user chooses saved media inside a multimodal flow, the client submits only `assetId`. The server validates ownership and resolves the asset to the provider-compatible input form. The client must never pass raw COS URLs as trusted media references.

## Data Model

### Extend `agent_artifacts`

Keep `agent_artifacts` as the conversation artifact summary table. Do not turn it into the durable cloud-drive asset table.

Add lightweight metadata fields for conversation/UI state:

```ts
type AgentArtifactSaveMetadata = {
  saveStatus?: 'not_saved' | 'saving' | 'saved' | 'save_failed' | 'source_expired';
  savedAssetId?: string;
  providerExpiresAt?: string;
  sourceMimeType?: string;
};
```

Existing body/url sanitization remains valid for persisted artifacts. Direct-delivery payloads can still be sent through stream events and API responses.

### New `generated_media_assets` Table

Add a dedicated table for explicit durable saves.

Recommended first-release columns:

```ts
generated_media_assets
- id uuid pk
- user_id uuid not null references users(id)
- run_id uuid not null references agent_runs(id)
- conversation_id uuid not null
- artifact_id uuid not null
- kind agent_artifact_kind not null
- title text not null
- source_provider text not null
- source_model text not null
- source_url text
- source_expires_at timestamptz
- storage_provider text not null default 'tencent_cos'
- bucket text not null
- region text not null
- object_key text not null
- mime_type text
- byte_size bigint not null
- width integer
- height integer
- duration_seconds numeric(10,2)
- status text not null default 'ready'
- metadata jsonb not null default '{}'
- save_requested_at timestamptz not null
- saved_at timestamptz not null
- deleted_at timestamptz
- created_at timestamptz not null
- updated_at timestamptz not null
```

Indexes:

- `user_id`
- `run_id`
- `conversation_id`
- `artifact_id`
- `status`
- unique `object_key`

Soft delete is sufficient for the first release.

### Storage Quota State

The application needs durable per-user quota state, even if the entitlement source evolves later. The exact storage location can follow the existing account/entitlement model, but the design requires these durable fields:

- `storageQuotaBytes`
- `storageUsedBytes`

The source of truth must count only `generated_media_assets.status = 'ready'` and `deleted_at is null`.

## COS Object Key Strategy

Use a structured object key that encodes isolation boundaries without leaking prompts or other sensitive text:

```text
ai-generated/{env}/users/{userId}/conversations/{conversationId}/runs/{runId}/{assetId}.{ext}
```

Example:

```text
ai-generated/prod/users/USER_UUID/conversations/CONV_UUID/runs/RUN_UUID/ASSET_UUID.png
```

Properties of this strategy:

- user prefixing supports direct operational isolation and cleanup;
- conversation/run segments preserve audit traceability;
- asset ids avoid collisions for multi-output runs;
- no prompt text, model prompt fragments, or other sensitive user content appear in object keys.

Durable truth must be `bucket + region + objectKey`. Do not treat a historical signed URL as durable storage identity.

## API and Boundary Design

### Generation APIs

Existing generation routes keep their current responsibility:

- validate user request;
- execute provider generation;
- charge generation cost when the provider completes usable output;
- return or stream direct-delivery media;
- persist sanitized run artifacts and run snapshots.

They do **not** auto-save to COS.

### User Save API

Add a save endpoint with semantics similar to:

```text
POST /api/user/media-assets
```

Request body:

```ts
{
  runId: string;
  artifactId: string;
}
```

Validation rules:

- active authenticated user required;
- referenced run must belong to the user;
- referenced artifact must belong to the run and be a save-eligible image/video output;
- artifact must not already be saved;
- provider source must still be retrievable;
- user must have enough remaining storage quota before upload begins.

The route must not accept provider URLs, COS keys, `userId`, or any ownership/storage fields from the client.

### User Media Library APIs

Add dedicated user APIs for:

- list saved assets;
- get saved asset detail;
- soft delete saved asset;
- list assets eligible for multimodal reuse;
- resolve signed download/view URL when needed.

These APIs always scope by the current session user and never trust client ownership claims.

### Admin Audit APIs

Add separate admin-only read endpoints for:

- run-centric multimodal audit;
- saved-asset-centric audit.

Do not reuse user media library APIs for admin review.

Admin filters should include:

- user;
- conversation id;
- run id;
- task type;
- saved/not saved;
- save failure state;
- time range.

## Service Design

### Media Save Service

Add a focused server domain module, for example under `src/server/media`, responsible for:

1. validating save eligibility;
2. checking storage quota;
3. marking conversation artifact save state as `saving`;
4. downloading/reading provider media source;
5. uploading the media bytes to Tencent COS;
6. inserting the durable asset row;
7. updating artifact metadata to `saved`;
8. increasing the user’s used storage bytes atomically;
9. recording audit events.

Recommended repository transaction boundary:

- create asset row + update artifact metadata + increment storage usage should succeed or fail together after the COS upload returns success.

If the system cannot include COS and database writes in one transaction, the source of truth remains the database. A successful COS upload followed by DB failure should trigger compensating deletion of the uploaded object where possible.

### Media Reuse Resolver

Add a focused resolver used by future multimodal input flows:

- input: `assetId`, `userId`
- output: validated reusable media descriptor

This keeps future multimodal providers from reaching directly into repositories or passing raw URLs through the client boundary.

## Save Flow

Recommended save flow:

1. User clicks “保存到我的媒体”.
2. API validates session and payload.
3. Service loads the run and artifact for the current user.
4. Service validates artifact is an image/video output with a still-usable provider source.
5. Service checks remaining storage quota against estimated/actual content length.
6. Service marks artifact `saveStatus = saving`.
7. Service downloads provider media bytes.
8. Service uploads bytes to Tencent COS using the structured object key.
9. Service writes `generated_media_assets` row.
10. Service updates artifact metadata to `saveStatus = saved` and `savedAssetId = <assetId>`.
11. Service increments user storage usage.
12. Service records run/media audit events and returns the saved asset summary.

If any step after (6) fails:

- run generation remains `succeeded`;
- storage usage does not increase;
- artifact metadata becomes `save_failed` with safe failure reason in metadata or log event;
- the user can retry while the provider source remains valid.

If the provider source expires before a successful retry:

- mark the artifact `source_expired`;
- do not create any durable asset;
- the user retains the history of generation, but no reusable saved asset exists.

## Generation Billing and Save Billing

### Generation Billing

Model/provider billing remains tied to generation success, not durable storage:

- provider returns usable output;
- user receives the output;
- generation is billed according to the existing model/provider billing policy.

Do not refund generation automatically just because saving to COS later fails. The model work already happened.

### Storage Billing / Quota

Durable storage consumption is independent:

- unsaved results consume no durable quota;
- successful save consumes durable quota based on actual stored bytes;
- deletion releases durable quota.

This separation prepares the future “paid disk/cloud-drive” product model without conflating generation credits and storage capacity.

## Error Handling

### Save Failures

Save failures must not rewrite generation history. The user saw a successful generated result, so the run remains successful and billed.

Expected save-failure classes:

- provider source expired before save;
- provider source fetch failed;
- COS upload failed;
- asset insert failed;
- storage quota exhausted;
- duplicate save race.

User-facing handling:

- show `保存失败` when retry is possible;
- show `源文件已失效` when retry is no longer possible;
- preserve the download action if the provider source still works.

### Duplicate Save Submission

The save endpoint must be idempotent per `(userId, runId, artifactId)`:

- repeated requests after success return the existing saved asset;
- concurrent requests should not create duplicate durable assets or double-count storage usage.

### Object Upload / DB Partial Failure

If COS upload succeeds but the durable database write fails:

- attempt compensating object deletion immediately;
- record an audit event if cleanup fails;
- return save failure to the user;
- do not increment storage usage or mark the artifact saved until the database truth exists.

## Security and Isolation

- Every user-facing save, list, detail, delete, and reuse action scopes by authenticated `userId`.
- `runId`, `artifactId`, and `assetId` must all be checked against the same `userId`.
- Admin queries are separate and permission-guarded.
- Middleware remains unchanged and Edge-safe; all COS logic must stay in server-only modules.
- Object keys do not encode prompts, phone numbers, names, or other sensitive content.
- Signed COS URLs, if used, are derived server-side on demand and are not treated as durable identifiers.

## Admin Audit Design

Admin needs to audit both the generation layer and the storage layer.

### Run-Centric Audit View

For each generation run, show:

- user;
- conversation id;
- run id;
- task type;
- provider/model;
- generation status;
- generation credit charge and ledger entry;
- generated artifact count;
- each artifact’s save status;
- provider link presence and expiry;
- save attempts / failure reason summary.

### Asset-Centric Audit View

For each saved durable asset, show:

- user;
- asset id;
- source run id and conversation id;
- type;
- title;
- mime type;
- byte size;
- COS bucket/region/object key;
- created/saved timestamps;
- delete status.

Where operationally appropriate, admin surfaces may expose the relevant provider/COS link or a server-generated inspect/download link, but the UI should avoid implying that those URLs are durable identifiers.

## Testing Strategy

Use the lowest meaningful layers first:

- schema/repository tests for `generated_media_assets` persistence, per-user filtering, soft delete, and duplicate-save protection;
- domain/service tests for save eligibility, quota checks, save state transitions, and partial-failure compensation;
- route tests for payload validation, auth guarding, duplicate save behavior, and user isolation;
- targeted runtime tests to ensure generation success remains unaffected by save failures;
- browser verification for:
  - conversation result card save states;
  - “我的媒体” list rendering;
  - admin audit list/detail visibility.

If local COS integration is not available in development, fake or stub the COS client at the service boundary and record the infrastructure limitation in verification.

## Boundary Graph

Conversation UI -> `/api/agent/runs` -> run service -> provider adapter -> billed run + direct media event + sanitized artifact

Conversation UI save action -> `/api/user/media-assets` -> media save service -> media asset repository + COS client + storage quota owner

“我的媒体” UI -> user media APIs -> media asset repository

Admin audit UI -> admin audit APIs -> run repository + media asset repository + ledger/relevant snapshots

## Open Questions Resolved

- **Should every generated output auto-save to COS?** No. Durable storage is explicit user choice only.
- **Should generation success depend on COS save success?** No. Generation success and billing remain independent from later save success.
- **Should user uploads be stored in this change?** No. Only model-generated outputs are in scope.
- **Should saved media be shareable across users or tenants?** No. First release is strictly user-owned isolation.

## Local Design Summary

The repository should add an explicit cloud-drive media layer without collapsing it into the existing generation lifecycle. Image/video generation continues to produce immediate direct-delivery outputs and charge model usage on provider success. A new user-driven save flow promotes selected generated artifacts into durable COS-backed assets recorded in `generated_media_assets`, updates conversation save state, consumes storage quota, and unlocks cross-conversation multimodal reuse. Admin audit surfaces then read both layers together: what was generated and billed, and what the user later chose to store.
