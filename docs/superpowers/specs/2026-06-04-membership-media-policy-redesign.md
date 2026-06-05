# Membership Media Policy Redesign

## Summary

This change replaces the current free-form “advanced benefits” editing model as the runtime authority for user media-library capabilities. Membership plan versions will instead own a structured capability policy, and the first closed-loop policy area will be the media library:

- storage quota for cloud media assets
- ability to upload local image/video files
- ability to enable public sharing for saved media assets

The goal is to make membership configuration, version publishing, user entitlement application, and runtime permission checks operate as one coherent system rather than loosely-coupled `benefits[]` records interpreted by string conventions.

## Goals

- Replace free-form media-related benefit editing with structured membership capability policy fields.
- Make the membership plan version the runtime authority for media library permissions.
- Support a full closed loop:
  - admin configures policy
  - plan version publishes policy
  - user membership activation/renewal applies policy
  - runtime upload/share/quota checks enforce policy
- Keep current user-used storage tracking intact while making quota assignment derive from membership policy.

## In Scope

Only these three capabilities are included in the first policy redesign:

- `storageQuotaBytes`
- `allowUserUpload`
- `allowPublicSharing`

## Out Of Scope

- Compatibility mapping from old free-form benefit items into the new runtime policy.
- General policy-engine rollout for every existing membership benefit.
- Automatic global backfill/recalculation of every historical user on plan-policy edits.
- Multi-policy composition, experimentation, or entitlement stacking.

## Why The Current Model Is Not Sufficient

The existing advanced-benefits editor stores generic rows shaped like:

- `code`
- `name`
- `kind`
- `quantity`
- `unit`

That shape is acceptable for display-oriented benefit summaries, but it is not a reliable runtime policy model for:

- boolean capability flags
- storage quotas that must be enforced numerically
- server-side authorization decisions
- closed-loop product behavior after publish

Using generic rows as the runtime source of truth would force fragile string-based interpretation and spread policy knowledge across multiple layers.

## Core Decision

The runtime authority for media-library capability checks moves from free-form `benefits[]` to a structured membership policy object stored on the membership plan version.

The old `benefits[]` collection is no longer treated as the source of truth for these three capabilities.

## Invariants

1. A user’s media-library runtime permissions must be derivable from the user’s currently effective membership plan version.
2. Upload and share authorization must be enforced server-side even if the UI hides or disables controls.
3. `storageUsedBytes` remains the source of truth for actual used storage; `storageQuotaBytes` becomes the applied quota snapshot from the effective membership media policy.

## Data Model

### New structured membership policy

Each membership plan version gains a structured media policy object:

- `mediaLibraryPolicy.storageQuotaBytes: number`
- `mediaLibraryPolicy.allowUserUpload: boolean`
- `mediaLibraryPolicy.allowPublicSharing: boolean`

This object is versioned with the membership plan version and publishes with it.

### Existing free-form benefits

The current free-form benefits list is no longer the runtime authority for these media capabilities.

For this project, because the user explicitly chose a non-compatible redesign path:

- no compatibility adapter is added
- old benefit rows for media policy are not interpreted at runtime
- the new structured policy is the only authority for the three targeted capabilities

### User storage fields

Retain:

- `users.storageQuotaBytes`
- `users.storageUsedBytes`

Clarified semantics:

- `storageQuotaBytes`: applied quota snapshot from the currently effective membership media policy
- `storageUsedBytes`: actual bytes currently consumed by the user’s saved media

Do not store these in the user row:

- `allowUserUpload`
- `allowPublicSharing`

Those booleans remain dynamic membership-derived permissions, not user-row truth.

## State Ownership

### Membership media policy

- Owner: membership plan version domain
- Source of truth: membership plan version persistence
- Write entry: admin membership workspace draft editing + publish/schedule flow

### Applied user quota snapshot

- Owner: user account / membership activation flow
- Source of truth: `users.storageQuotaBytes`
- Write entry: membership activation, renewal, and explicit admin resync action

### Runtime upload/share permission

- Owner: membership entitlement resolution
- Source of truth: currently effective membership media policy
- Write entry: none at request time; request handlers read current effective policy

## Admin Editing Design

### Replace free-form editor for media policy

The admin “advanced benefits” area should no longer ask operators to manually compose generic benefit rows for media behavior.

Instead, it gets a dedicated structured panel for media-library policy:

- cloud media storage quota
- allow local image/video upload
- allow public sharing

Suggested editing controls:

- storage quota numeric input
- unit selector or fixed display converted to bytes internally
- upload permission toggle
- public sharing toggle

### UI behavior

This structured policy is part of the version draft, just like price, billing period, and permissions.

Admin expectations:

- edit media policy in draft
- save draft
- publish immediately or schedule
- understand that published changes affect future effective versions, not retroactively overwrite every active user automatically

## Publish And Activation Closed Loop

### Plan version lifecycle

1. Admin edits draft version media policy.
2. Draft persists the structured policy.
3. Publish/schedule promotes that exact policy into the effective plan version.

### User entitlement application

When a user newly activates or renews into a plan version:

1. resolve the effective plan version
2. read `mediaLibraryPolicy`
3. write `storageQuotaBytes` to the user row from `mediaLibraryPolicy.storageQuotaBytes`
4. leave `storageUsedBytes` untouched

This produces a durable quota snapshot while still allowing runtime booleans to be read from the effective plan.

### Admin resync action

Because this project does not include a global automatic backfill for all already-active users, add an explicit admin operation:

- “resync membership media policy for this user”

This action recalculates the user’s applied storage quota snapshot from the currently effective membership plan version.

This is required for operational closure and local testing practicality.

## Runtime Enforcement

### Upload

`POST /api/user/media-assets/upload` must enforce:

1. user has active account/session
2. current effective membership media policy has `allowUserUpload=true`
3. `storageUsedBytes + fileSize <= storageQuotaBytes`

If upload is not allowed, reject before any COS write attempt.

### Save AI-generated media into library

The save-generated-media flow still checks quota, but the quota it sees must be the quota snapshot produced from membership policy.

This means:

- no new boolean gate here
- quota gate remains
- quota source is now policy-driven via applied user quota snapshot

### Public share enablement

`POST /api/user/media-assets/[assetId]/share` must enforce:

1. user owns the asset
2. current effective membership media policy has `allowPublicSharing=true`

If sharing is not allowed, reject before changing asset share state.

### Public share reading

Public share page reading does not require membership validation at read time. The share state is already controlled when sharing is enabled/disabled and when assets are deleted.

## UI Product Behavior

### My Media page

The user-facing page should reflect capability state:

- hide or disable upload control when `allowUserUpload=false`
- hide or disable sharing action when `allowPublicSharing=false`

However, these are UX affordances only. Server routes remain authoritative.

### Admin membership workspace

The structured media policy editor should replace the current expectation that operators encode media behavior through generic benefits.

## Migration Strategy

Because the user explicitly chose a non-compatible redesign path:

- do not add runtime fallback from legacy benefits
- do not preserve old media benefit semantics
- move targeted media capability enforcement entirely onto the new structured policy

This means implementation must ensure seed/default plan versions include valid policy data before the runtime checks are switched on.

## Existing Membership Configuration To Preserve Conceptually

Although old benefit-row semantics are not preserved, existing plan-level intent must still be reflected in the new model by explicitly configuring the new structured policy for current plans.

At minimum, seed/default plans must have clear media policy defaults, for example:

- free plan: small quota, uploads disabled or enabled per product decision, sharing disabled or enabled per product decision
- paid/pro plans: larger quota, uploads enabled, sharing enabled if business rules allow

The exact values are product decisions, but the new model must require every active plan version to carry explicit policy data.

## Boundary Graph

- Admin UI: edits structured membership media policy
- Admin API: validates and persists policy in membership draft/publish flow
- Membership version repository/domain: owns versioned policy storage
- Membership activation/renewal flow: applies quota snapshot to user row
- User media upload/share APIs: enforce runtime membership policy
- User media repository/storage: enforce quota and asset state

## Verification Strategy

Use the lowest meaningful layer first:

- repository tests for membership version policy persistence
- admin route tests for draft parsing and policy save behavior
- membership activation/renewal tests for quota snapshot application
- user media route tests for upload/share denial when policy forbids them
- `pnpm validate`
- `pnpm build`
- browser verification for:
  - admin media policy editing
  - user upload button hidden/disabled when forbidden
  - user share button hidden/disabled when forbidden

## Scenarios

### Free-plan user with uploads disabled

- plan version policy sets `allowUserUpload=false`
- user enters My Media page and cannot upload
- direct POST to upload route is rejected server-side

### Paid-plan user with sharing enabled

- plan version policy sets `allowPublicSharing=true`
- user can enable sharing for an owned asset
- share route succeeds

### Plan upgrade changes quota

- new plan version has larger `storageQuotaBytes`
- user renews or admin resyncs
- `users.storageQuotaBytes` updates to the new value
- existing `storageUsedBytes` remains unchanged

### Deleted asset

- asset deletion still disables access and public sharing immediately
- this behavior is independent of membership policy and remains unchanged

## Open Questions Deliberately Deferred

- Exact seed quota values by plan tier
- Whether free users may upload but not share, or neither upload nor share
- Whether media-library policy should later expand to audio/files or bulk upload

These are product tuning questions and do not block the architecture defined here.
