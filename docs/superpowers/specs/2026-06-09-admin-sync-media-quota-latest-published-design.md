# Admin Sync Media Quota Uses Latest Published Version

## Summary

Change the admin user-management action "同步媒体额度" so that it syncs a user's media storage quota from the latest published membership plan version for the user's active membership plan, instead of from the user's currently effective entitlement version.

This change is intentionally limited to the admin-triggered resync action. It does not change the general runtime policy resolution used elsewhere for upload or sharing permissions.

## Problem

The current admin route `POST /api/admin/users/[userId]/membership-media-policy` resolves quota through `resolveCurrentUserMediaPolicy()`. That function prefers the user's currently active entitlement version. As a result, when an admin manually resyncs media quota for a member whose entitlement still points to an older plan version, the user continues to receive the older quota even if a newer plan version has already been published.

The requested admin behavior is different: manual sync should treat the latest published version as the source of truth for quota.

## Scope

In scope:

- Change the admin resync route behavior.
- Update admin success copy to match the new semantics.
- Record enough audit metadata to identify which plan/version was used.
- Add reusable tests for the new route-level/server-level behavior.

Out of scope:

- Changing general user media policy resolution for upload or sharing.
- Changing entitlement issuance or migration behavior.
- Applying scheduled or draft versions through this admin action.

## Existing Ownership And Boundaries

- Admin UI action entry: `src/features/admin/admin-action-controls.tsx`
- Admin API boundary: `src/app/api/admin/users/[userId]/membership-media-policy/route.ts`
- Current user media policy resolution: `src/server/auth/membership-media-policy.ts`
- Membership version lookup and published-version resolution: `src/server/repositories/membership-plan-versions.ts`
- Quota persistence: `src/server/repositories/users.ts`

The admin route is the correct place to switch the policy source. Durable quota remains owned by `users.storageQuotaBytes`.

## Mutable State

| State | Owner | Write Entry | Source of Truth |
| --- | --- | --- | --- |
| `users.storageQuotaBytes` | `users` table | admin resync route and membership approval flow | persisted user record |
| membership version media quota | membership plan version records | plan draft/publish workflow | membership plan version repository |
| user's active membership context | entitlement records | subscription approval / entitlement lifecycle | `userEntitlements` |

## Invariants

1. Admin quota resync only updates `storageQuotaBytes`; it must not reset or rewrite `storageUsedBytes`.
2. Admin quota resync must use the latest published version for the user's active membership plan, not the entitlement's bound version.
3. Draft versions and future scheduled versions must never be used as the source for this admin action.

## Design

### Recommended Approach

Introduce a dedicated server-side resolver for the admin resync flow rather than changing `resolveCurrentUserMediaPolicy()`.

The admin flow and runtime media policy flow now have different semantics:

- Runtime media policy: what the user is currently entitled to use right now.
- Admin resync policy: what quota should be force-synced from the latest published membership definition.

Keeping them separate avoids hidden behavior changes in upload and sharing paths.

### Resolver Behavior

Add a new server function for admin use only. Expected behavior:

1. Load the user's currently active membership context from active entitlements.
2. Determine the most relevant active membership plan code.
3. Resolve the latest published version for that plan code.
4. Return that version's `mediaLibraryPolicy`.
5. If the user has no active membership plan, return the restrictive default policy with `storageQuotaBytes = 0`.

For legacy entitlements without `planVersionId`, the resolver should still rely on active `planCode`, then resolve the latest published version by that plan code.

### Route Changes

Update `POST /api/admin/users/[userId]/membership-media-policy` to:

- call the new admin-specific resolver,
- persist the returned `storageQuotaBytes`,
- emit audit metadata that includes the resolved source plan/version when available.

Suggested audit metadata additions:

- `sourcePlanCode`
- `sourceVersionId`
- `sourceVersionNumber`
- `storageQuotaBytes`

### UI Copy

Update the admin success message from "媒体额度已按用户当前生效会员版本同步。" to wording that reflects latest published version semantics.

Recommended copy:

- `媒体额度已按会员方案最新发布版本同步。`

## Alternatives Considered

### Option A: Minimal inline route change

Resolve latest published version directly inside the route without a new helper.

Pros:

- smallest code diff

Cons:

- policy logic leaks into route layer
- harder to test and reuse
- future semantics become less explicit

### Option B: Dedicated admin resolver

Create a dedicated resolver for admin resync semantics.

Pros:

- clear ownership
- preserves runtime policy behavior
- testable and explicit

Cons:

- slightly more code than Option A

### Option C: Change `resolveCurrentUserMediaPolicy()`

Pros:

- one shared rule everywhere

Cons:

- changes user-facing runtime behavior outside admin sync
- too much blast radius for this request

Option B is the selected design.

## Error Handling

- Invalid `userId` remains a 400 via existing parameter validation.
- Admin auth remains unchanged and fail-closed.
- If no active membership exists, the route should still succeed and sync quota to restrictive default `0`.
- If the user's active plan code exists but no published version can be resolved, treat this as a server/data integrity error rather than silently using a draft.

## Verification Plan

Add focused tests covering:

1. Entitlement points to an older version, but a newer published version exists: admin sync writes the newer published quota.
2. No active membership exists: admin sync writes restrictive default quota `0`.
3. A draft version newer than the published version exists: admin sync still uses the latest published version.

Run the lowest meaningful verification layer first:

- targeted tests for the route and/or resolver
- `pnpm validate` if local environment permits

## Local Design Fit

This repository already separates:

- runtime entitlement resolution,
- membership version repositories,
- admin mutation routes,
- user quota persistence.

The design follows those existing boundaries and keeps the behavioral change tightly scoped to the admin console action.
