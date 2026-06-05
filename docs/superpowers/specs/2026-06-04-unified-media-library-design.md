# Unified Media Library Design

## Summary

This change upgrades the current saved-generated-media capability into a unified user media library that stores both AI-generated assets and user-uploaded local image/video files in one long-lived asset domain. The library remains private by default, supports public share pages, allows administrators to inspect original files through authenticated server access, and invalidates all access immediately when the user deletes an asset.

## Goals

- Store AI-saved media and user-uploaded image/video files in a single user-facing library.
- Keep Tencent COS buckets private while serving previews/downloads through server-controlled signed access.
- Support public share pages without exposing permanent public object URLs.
- Allow admins to inspect original files through authenticated APIs.
- Ensure deletion immediately disables user access, share-page access, and admin raw-file access.

## Non-Goals

- Recycle bin or restore flows.
- Batch upload, resumable upload, or client-direct COS upload.
- Media transcoding, thumbnails, posters, waveform extraction, or moderation.
- Public analytics for share views.

## Product Scope

### Included asset sources

- `ai_generated`: the user saves an image/video artifact produced by an AI run into the library.
- `user_uploaded`: the user uploads a local image/video file into the library.

### Included media kinds

- `image`
- `video`

Audio and generic file support remain out of scope for this change.

## Current-State Constraints

- The repository already stores long-lived AI-saved assets in PostgreSQL and binary objects in private Tencent COS.
- Current user access already relies on signed read URLs generated on the server.
- The existing persistence model is named `generated_media_assets`, but the product requirement now treats this as a general-purpose library, not an AI-only table.

## Invariants

1. Each library asset belongs to exactly one user, and regular users may only manage their own assets.
2. COS remains private-read/private-write; raw object access must flow through server-controlled signed URLs or a public share page backed by short-lived signed URLs.
3. Once an asset is deleted, all access paths must fail immediately: owner preview/download, public share page, and admin inspection.

## Domain Design

### Long-lived asset model

The system keeps the distinction between transient AI run artifacts and long-lived saved assets:

- AI runs continue to own transient generation results and provider-specific metadata.
- The media library owns all long-lived user-visible assets, regardless of whether they originated from AI output or local upload.

This keeps temporary run state separate from user-facing durable storage while still presenting a single “My Media” experience.

### Unified asset domain

The current saved-asset domain should be generalized from “generated media assets” to “media assets”. For v1, physical table renaming is optional. The preferred low-risk path is:

- keep the existing database table if migration risk is high
- generalize repository/service/type names to `media asset` semantics in the application layer
- add source metadata so both upload and AI-save flows land in the same durable asset store

This delivers a unified product experience without forcing an immediate storage-table rename migration.

## Data Model

### Existing fields retained

The long-lived asset record keeps the existing storage and ownership fields:

- `id`
- `userId`
- `kind`
- `title`
- `storageProvider`
- `bucket`
- `region`
- `objectKey`
- `mimeType`
- `byteSize`
- `width`
- `height`
- `durationSeconds`
- `status`
- `metadata`
- `savedAt`
- `deletedAt`
- `createdAt`
- `updatedAt`

### Source generalization

Add:

- `sourceType`: `ai_generated | user_uploaded`

Keep AI-origin fields, but treat them as nullable and source-dependent:

- `runId`
- `conversationId`
- `artifactId`
- `sourceProvider`
- `sourceModel`
- `sourceUrl`
- `sourceExpiresAt`

For `user_uploaded`, those AI-origin fields are null.

### Upload-origin fields

Add:

- `originalFilename`: original client filename for uploaded files
- `sha256`: content digest for upload dedupe or future integrity checks

### Share fields

Add:

- `shareId`: stable public identifier used by the share page
- `shareStatus`: `disabled | active`
- `sharedAt`: timestamp of current active share state

Deletion semantics:

- deleted assets remain soft-deleted records
- deleted assets must always behave as if `shareStatus=disabled`
- public share lookup ignores deleted assets

## Storage Design

### Tencent COS

All uploaded and AI-saved binaries remain in private Tencent COS. The current COS client implementation is reused.

Suggested object-key layout:

- AI-saved assets keep the current structure under `ai-generated/...`
- user-uploaded assets use a parallel prefix such as `user-uploaded/<env>/users/<userId>/assets/<assetId>/<filename>`

The exact prefix is an implementation detail, but keys must preserve:

- environment isolation
- user scoping
- stable uniqueness

### Access strategy

Owner preview/download and admin inspection both use short-lived signed COS URLs generated on the server.

Public sharing does not expose a permanent COS public URL. Instead:

- a public Next.js page resolves the shared asset
- the server verifies that sharing is active and the asset is not deleted
- the page receives a short-lived signed asset URL for preview/download

This preserves private buckets while still allowing public sharing.

## API Design

### Owner library APIs

#### `GET /api/user/media-assets`

Returns a unified list of library assets for the current user.

Add optional filters:

- `kind=image|video`
- `sourceType=ai_generated|user_uploaded`

The default view returns all active assets mixed together.

#### `POST /api/user/media-assets`

Existing endpoint remains the AI-save entrypoint. It continues to save an AI run artifact into the unified library, but now records:

- `sourceType=ai_generated`

#### `POST /api/user/media-assets/upload`

New multipart upload endpoint for local image/video files.

Validation responsibilities:

- require authenticated active user
- accept only image/video media kinds supported by product policy
- validate file size
- validate MIME type
- validate storage quota before durable creation

Flow:

1. parse multipart form
2. validate file and optional title
3. compute digest
4. upload bytes to COS
5. create unified asset record with `sourceType=user_uploaded`
6. increment user storage usage
7. return created asset

#### `GET /api/user/media-assets/[assetId]/access`

Existing route remains the owner-access route. It returns short-lived preview/download URLs for owned assets from the unified asset table.

#### `DELETE /api/user/media-assets/[assetId]`

Existing delete route remains the owner delete route. It soft-deletes the unified asset, updates storage usage, and makes sharing immediately unavailable.

COS deletion should be attempted, but user-visible unavailability is determined by database state first.

### Share APIs

#### `POST /api/user/media-assets/[assetId]/share`

Enables sharing for an owned asset.

Behavior:

- create `shareId` if absent
- set `shareStatus=active`
- set `sharedAt`
- return share URL metadata

#### `DELETE /api/user/media-assets/[assetId]/share`

Disables sharing for an owned asset.

Behavior:

- set `shareStatus=disabled`
- share page begins returning not found / unavailable

#### `GET /api/public/media-share/[shareId]`

Public route used by the share page.

Behavior:

- resolve asset by `shareId`
- require `shareStatus=active`
- reject deleted assets
- return sanitized public metadata and a short-lived signed access URL

No owner-only or admin-only fields should be exposed here.

### Admin APIs

#### `GET /api/admin/media-assets/[assetId]/access`

New admin-only route for inspecting original files.

Behavior:

- require admin authorization
- verify asset exists and is not deleted
- issue short-lived signed preview/download URL
- emit audit event

Admin access must not bypass deletion semantics.

## UI Design

### My Media page

The existing user media page becomes the unified library surface.

Add:

- upload button for image/video files
- source filters:
  - `All`
  - `Images`
  - `Videos`
  - `AI Generated`
  - `User Uploaded`

The default list remains mixed. Source is available as a filter and in detail metadata, but not required as a heavy badge on every card.

Per-asset actions:

- preview
- download
- enable sharing
- disable sharing
- copy share link
- delete

### Public share page

New public page:

- displays title and asset preview
- supports image and video rendering
- offers download action
- returns an unavailable state if sharing is disabled, missing, or deleted

### Admin surface

The admin-facing entry can start as a route-level operation rather than a large new UI. The minimum requirement is an authenticated admin path that can fetch the original file through a signed URL with audit logging.

## Validation And Error Handling

### Upload failures

Distinguish at least these cases:

- unsupported media type
- file too large
- storage quota exceeded
- COS upload failure
- database persistence failure

If COS upload succeeds but database persistence fails, the system should report failure and schedule or perform object cleanup to avoid orphaned files.

### Delete failures

Deletion must be fail-closed at the application layer:

- mark the record deleted first or within the same logical operation that removes user-visible access
- if COS deletion fails, the asset still becomes inaccessible through the application
- cleanup of orphaned COS objects can be retried separately

### Share-page failures

Public share lookups return an unavailable/not-found response when:

- share ID is unknown
- share is disabled
- asset is deleted

### Authorization failures

- owner routes reject non-owners
- admin inspection rejects non-admins
- public share routes never expose owner-only metadata

## Mutable State Ownership

### Asset record

- Owner: media asset repository/domain
- Source of truth: PostgreSQL
- Write entries: AI save flow, upload flow, share enable/disable, delete flow, admin read audit

### Binary object

- Owner: Tencent COS
- Source of truth for object availability: COS plus application record status
- Write entries: upload service, delete cleanup

### Share state

- Owner: media asset repository/domain
- Source of truth: PostgreSQL `shareStatus/shareId/sharedAt`
- Write entries: owner share enable/disable, delete flow

## Scenario Coverage

### Save AI output to library

User saves a generated image/video, the system downloads provider output, uploads it into COS, creates a unified asset with `sourceType=ai_generated`, and it appears beside uploaded assets in the same library.

### Upload local media

User uploads a local image/video, the server validates and stores it in COS, creates a unified asset with `sourceType=user_uploaded`, and it appears in the same library.

### Share an asset

User enables sharing for an asset, receives a public share URL, and unauthenticated visitors can open a public share page whose media content is still served through short-lived server-signed access.

### Disable sharing

User disables sharing for an asset and all subsequent public share-page requests fail.

### Delete an asset

User deletes an asset and the library no longer lists it, signed owner access no longer works, public share access no longer works, and admin raw-file inspection no longer works.

### Admin inspection

Admin requests access to a non-deleted asset and receives a short-lived signed URL after passing admin authorization, with the action recorded in audit logs.

## Testing Strategy

Use the lowest meaningful layer first:

- repository tests for unified asset filtering, share-state lookup, deletion semantics, and source-type handling
- route tests for upload validation, owner access, share enable/disable, public share lookup, and admin authorization
- service tests for upload flow, digest handling, quota enforcement, and delete/share state transitions
- `pnpm validate` for type/lint coverage
- `pnpm build` for route wiring

Browser verification is required for:

- upload flow on the user media page
- public share page rendering for image and video
- delete-immediately-invalidates-share behavior

## Migration Strategy

Preferred v1 path:

1. extend the existing saved-asset table with unified-source and share fields
2. update repository/service/type names and semantics toward `media assets`
3. preserve existing AI-save behavior while adding local-upload behavior
4. update the existing “My Media” surface to query the unified asset model

This avoids a risky table split or full storage migration while meeting the product requirement that AI-saved and uploaded assets appear together.

## Open Implementation Notes

- The current database schema may still retain legacy AI-oriented nullable fields for compatibility.
- Physical table renaming is optional in v1; semantic unification at the domain layer is sufficient.
- Client-direct COS upload can remain a future optimization once upload size and UX needs justify it.
