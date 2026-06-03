# Membership Plan Permission Management Design

Date: 2026-06-03

## Scope

Add a traditional permission-management module that lets admin operators configure which user-facing menus, pages, page actions, and API routes are available to each membership plan.

This design covers:

- A code-owned permission resource catalog for menus, pages, actions, and APIs.
- Database-backed resource registration and membership-plan permission bindings.
- A unified runtime permission service consumed by menu rendering, page access, action visibility, and API guards.
- An admin console module for permission-resource overview and membership-plan binding management.
- Incremental migration of existing user-facing surfaces from hardcoded gating to permission-code based gating.

This design does not cover:

- User-direct grants, deny rules, benefit-code based grants, or mixed entitlement subjects.
- Field-level or column-level permission control.
- Admin-console operator permission redesign.
- A general-purpose RBAC platform for arbitrary roles outside existing membership plans.

## Classification

Large.

This change crosses admin UI, public UI, API boundaries, database schema, repository contracts, durable authorization semantics, and runtime navigation/access behavior.

## Existing Context

The repository already has:

- `membership_plans`, `benefits`, and `user_entitlements` in `src/server/db/schema.ts`.
- User-facing menu-like structures in code such as homepage/public navigation data and page-local action controls.
- Server-side entitlement evaluation patterns for AI model access in `src/server/ai/model-entitlements.ts` and `src/server/repositories/ai-models.ts`.
- Admin console module patterns under `src/app/admin/(console)` and `src/features/admin`.
- Existing server auth guards that already enforce login/admin access at route boundaries.

The current gap is that user-facing surface access is still mostly hardcoded in UI and route code. There is no single configurable resource layer that maps membership plans to menus, pages, buttons, and APIs.

## Goals

- Replace hardcoded user-surface gating with membership-plan permission bindings.
- Ensure menus, pages, actions, and APIs all resolve against the same permission codes.
- Keep permission resource definition under engineering control so every configurable resource has a real runtime consumer.
- Let admin operators bind and review permissions by membership plan without code changes.
- Preserve a single durable authorization truth: effective user permissions derive from the user's active membership-plan entitlements plus the plan-to-permission bindings.

## Non-Goals

- Supporting permission rules based on benefit code, manual user grant, or stacked rule expressions in the first release.
- Letting admin users create arbitrary permission resources at runtime.
- Replacing existing admin auth or introducing organization/team scoped permissions.
- Building versioned permission publishing, draft workflows, or historical rollback for permission configuration.

## Reference Translation

Industry consensus -> transferable principle -> repository constraints -> local design:

- Mature permission systems distinguish resource definition from subject binding. Resources are centrally defined; operators configure assignments without inventing new runtime identifiers.
- UI visibility is not sufficient authorization. Sensitive actions are enforced again at page and API boundaries.
- Access control should have one durable source of truth and many consumers, not many competing rule copies.

Local translation:

- Engineering owns the permission resource catalog.
- Admin operators own the membership-plan-to-permission binding state.
- Runtime access always resolves from active membership-plan entitlements plus persisted bindings.
- Menus are permission consumers, not permission truth.

## Mutable State

| State | Owner | Write entry | Source of truth | Notes |
| --- | --- | --- | --- | --- |
| Permission resource definition | Engineering-owned catalog sync | code catalog + resource sync path | catalog mirrored into `permission_resources` | Admin cannot create arbitrary resources. |
| Membership-plan permission binding | Admin permission module | admin mutation routes | `membership_plan_permission_bindings` | Durable configurable authorization state. |
| User active membership eligibility | membership/entitlement domain | existing entitlement grant/expiry flows | `user_entitlements` joined to `membership_plans` | This design reuses existing truth. |
| Effective user permission code set | permission service | none, derived at runtime | derived from active user entitlements + plan bindings | May be cached later but not stored as durable truth in v1. |
| Menu/page/action/API access outcome | runtime guard layer | none, derived | derived from permission service result | Never persisted independently. |

## Invariants

1. Permission resource codes must be globally unique and must be registered by engineering before admin can bind them.
2. Menu visibility alone must never grant access; controlled pages and APIs must perform their own permission checks.
3. Action/button visibility is a UX optimization only; the corresponding write API must still require the relevant permission code.
4. Effective user permissions must derive only from active membership-plan entitlements and plan-permission bindings in the first release.
5. Missing binding state for a controlled resource must fail closed at page/API boundaries in production behavior.

## Data Model

Add two tables.

### `permission_resources`

Purpose: persist the engineering-defined permission catalog for admin listing, binding, validation, and runtime lookup.

Suggested fields:

- `id`
- `code`
- `name`
- `resource_type` as enum: `menu | page | action | api`
- `module`
- `description`
- `route_pattern` nullable
- `action_key` nullable
- `is_active`
- `metadata`
- `created_at`
- `updated_at`

Suggested metadata keys:

- `dependsOn`: array of recommended dependency permission codes
- `recommendedWith`: array of codes commonly granted together
- `defaultPlanCodes`: optional bootstrap-only hints for seed/backfill

Constraints:

- unique index on `code`
- index on `resource_type`
- index on `module`
- index on `is_active`

### `membership_plan_permission_bindings`

Purpose: map membership plans to permission resources.

Suggested fields:

- `id`
- `plan_id`
- `permission_resource_id`
- `created_at`
- `updated_at`

Constraints:

- unique index on `(plan_id, permission_resource_id)`
- index on `plan_id`
- index on `permission_resource_id`

## Permission Resource Model

Permission resources remain code-owned.

Example codes:

- `menu.user_center`
- `menu.user_benefits`
- `page.user_center`
- `page.image_gen`
- `action.user_center.copy_invite_code`
- `action.membership.submit_subscription`
- `api.user.media_assets.list`
- `api.user.points.checkin`

Each resource should include:

- stable `code`
- human-readable `name`
- `resourceType`
- `module`
- optional route or action metadata
- optional dependency hints

The catalog should live in a dedicated server module, for example:

- `src/server/auth/permission-catalog.ts`

That module is the engineering source of truth. Database rows are the synchronized operational mirror.

## Architecture

### Permission Catalog

Add a typed permission catalog in code. The catalog defines every configurable resource and its metadata.

Responsibilities:

- provide compile-time checked permission codes;
- provide a sync source for `permission_resources`;
- give admin UIs stable metadata for grouping and labeling;
- allow route/page/action declarations to import canonical codes instead of string literals where practical.

### Permission Service

Add a unified permission service, for example in:

- `src/server/auth/permission-service.ts`

Responsibilities:

- resolve active user membership-plan entitlements;
- resolve the bound permission resources for those plans;
- return the effective permission-code set;
- expose helpers such as:
  - `listUserPermissionCodes(userId)`
  - `hasUserPermission(userId, code)`
  - `hasUserAnyPermission(userId, codes)`
  - `requireUserPermission(session, code)`

The service should reuse existing entitlement truth rather than cookies or client-owned membership state.

### Repository Layer

Add repositories focused on:

- syncing/loading permission resources;
- listing resources for admin views;
- reading/writing plan bindings;
- resolving user permission codes from active entitlements.

Possible modules:

- `src/server/repositories/permission-resources.ts`
- `src/server/repositories/membership-plan-permissions.ts`

Repository responsibilities:

- query shape and joins;
- deduplicate permission codes across multiple active entitlements for the same plan;
- hide persistence details from page and API callers.

### Admin Console Module

Add `/admin/permissions` as an operational module with two views:

1. Permission resource overview
2. Membership-plan permission binding workspace

Resource overview:

- metrics by resource type;
- filters by type, module, and active state;
- dense table with code, name, type, module, route/action metadata, status.

Binding workspace:

- membership-plan list on the left;
- grouped resource checklist on the right;
- grouping by module, then by resource type;
- search by code or name;
- save action writes the binding set for the selected plan;
- warning callouts when a selected resource has recommended dependencies that are not selected.

Admin cannot create or delete resources from this screen.

### Runtime Consumers

#### Menus

Menu definitions should include a `permissionCode` field. Rendering filters menu items against the effective permission set.

#### Pages

Controlled pages declare a required permission code. Access is validated server-side before rendering protected content. Unauthorized users go to a dedicated no-access surface instead of seeing a client-only redirect after render.

#### Actions

Page actions/buttons declare a permission code. The UI hides or disables them based on effective permissions, but the corresponding mutation API still enforces the same or stricter permission code.

#### APIs

Controlled route handlers declare a required permission code and call a shared guard helper near the boundary. Permission enforcement belongs before domain mutations.

## Boundary Graph

```
permission catalog in code
  -> resource sync / repository
  -> permission_resources
  -> admin permissions module
  -> membership_plan_permission_bindings

user_entitlements + membership_plans
  -> permission service
  -> effective permission codes
  -> menu filtering
  -> page guards
  -> action visibility
  -> API guards
```

## Runtime Resolution Rules

1. Load the authenticated user session.
2. Resolve active user entitlements using existing entitlement timing rules.
3. Derive active membership-plan ids/codes from those entitlements.
4. Load all bound permission resource codes for those active plans.
5. De-duplicate into one effective permission-code set.
6. Evaluate resource access against that set.

This release binds only to membership plans. Benefit-level grants, direct grants, and deny precedence do not participate.

## Migration Strategy

Use a compatibility-first rollout.

### Phase 1

- Add schema, repositories, and permission catalog.
- Sync catalog into `permission_resources`.
- Build admin resource overview and binding UI.
- Seed or backfill default bindings for existing membership plans.

### Phase 2

- Start consuming permission codes in user-facing menu rendering.
- Add server-side guards to the highest-risk controlled pages.
- Add action/button visibility checks.
- Add matching API permission guards.

### Phase 3

- Replace remaining hardcoded checks on migrated surfaces.
- Add tests and validation coverage for every newly controlled surface.

This order prevents a state where the UI still exposes features whose APIs have already started failing with `403` due to missing bindings.

## Error Handling

- Unauthenticated user: existing login/session flow handles it.
- Authenticated but missing required page permission: redirect or render a dedicated no-access page.
- Authenticated but missing required API permission: return `403` with a stable error code such as `permission_denied`.
- Resource code declared in code but not present in database sync: treat as configuration error and fail closed at guarded boundaries.
- Plan binding save with unknown resource ids: reject at API validation/repository layer.
- Dependency hints missing from a selected binding set: warn in admin UI; do not silently auto-grant in v1.

## Auditability

Permission binding changes are sensitive admin mutations.

Admin writes should record:

- actor admin id;
- target membership plan id/code;
- added permission codes;
- removed permission codes;
- timestamp;
- optional operator note if that pattern already exists or is inexpensive to add.

If a reusable audit writer already exists, reuse it. If not, repository tests plus an explicit follow-up verification note are required.

## Verification Strategy

### Logic Tests

- permission catalog validation rejects duplicate codes;
- active entitlement resolution maps to the expected active plan set;
- permission resolution deduplicates codes across multiple entitlements;
- `hasUserPermission` and `requireUserPermission` respect fail-closed behavior.

### Repository Tests

- plan binding reads/writes persist expected resource associations;
- inactive or missing resources are handled explicitly;
- binding replacement preserves uniqueness and does not leave duplicates.

### Route/Page Tests

- guarded page allows access when permission exists;
- guarded page blocks access when permission is missing;
- guarded API returns `403 permission_denied` when permission is missing;
- menu filtering hides unauthorized entries;
- action visibility reflects the resolved permission set.

### Commands

- targeted tests for permission service, repositories, and route handlers;
- `pnpm validate`;
- `pnpm build`;
- browser verification for `/admin/permissions` and at least one migrated user flow when local setup allows it.

## Risks And Trade-Offs

- Membership-plan-only binding is intentionally narrow. It is simpler and matches the explicit user choice for v1, but later expansion to benefit-level grants will require extending the resolver.
- Resource definition in code plus binding in database introduces sync responsibility. Mitigation: keep one catalog module and a deterministic sync path.
- Incremental migration means some untouched surfaces may still use old hardcoded gating for a period. Mitigation: track migrated surfaces explicitly in implementation tasks.
- If a menu is hidden but the page/API is not yet guarded, authorization is incomplete. Mitigation: page/API guards are first-class requirements, not optional follow-up polish.

## Follow-Up Expansion Path

After this release is proven, the model can grow in this order:

1. Benefit-code based permission bindings.
2. User-direct grant support for support/manual exception flows.
3. Stronger dependency management with optional auto-selection policies.
4. Permission coverage tooling that reports unguarded pages/actions/APIs against the catalog.
