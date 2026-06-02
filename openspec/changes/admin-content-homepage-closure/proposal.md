## Why

The admin console has a visible content management area, and the database already has a `content_assets` table, but the loop is not closed. Admins can inspect content-like rows, yet they cannot create, edit, publish, unpublish, or archive content through the console. User-facing pages also do not read those records, so admin configuration cannot affect the public experience.

The first closed loop should be intentionally narrow: make selected `/home` homepage content blocks admin-managed, published through explicit status transitions, and rendered by the user-facing homepage with static fallback. This proves the content workflow without mixing it with shop pricing, membership entitlements, or a full CMS.

## What Changes

- Turn `/admin/content` from a read-only table into an operational content surface for homepage blocks.
- Add admin content create/edit/publish/unpublish/archive mutation routes with input validation and admin authorization.
- Reuse `content_assets` as the durable source for structured homepage block content.
- Add public content read logic that returns only published homepage content and normalizes it into a typed `/home` view model.
- Refactor `/home` enough for server-side content loading while preserving existing client interactions and visual layout.
- Preserve current static homepage data as fallback whenever database content is absent, unavailable, draft, archived, or invalid.

## Capabilities

### New Capabilities

- `content-management-closure`: Admin-managed homepage content blocks with explicit draft/publish/archive state and public rendering.

### Modified Capabilities

- `admin-management-console`: Add real content mutation actions and status transitions for homepage content.
- `public-product-experience`: Render admin-published homepage content while preserving static fallback.

## Impact

- Affected admin route:
  - `src/app/admin/(console)/content/page.tsx`
- Affected admin APIs:
  - new routes under `src/app/api/admin/content`
- Affected feature UI:
  - `src/features/admin`
  - `src/app/home/page.tsx` or a new `src/features/public/home-page.tsx`
- Affected server repository:
  - `src/server/repositories/content.ts` and focused tests
- Affected public data:
  - `src/features/public/home-data.ts` as fallback and typed defaults
- Verification:
  - metadata validator tests
  - repository/status transition tests
  - admin route validation tests
  - `pnpm validate`
  - `pnpm build`
  - browser verification for `/admin/content` and `/home` when local database/admin auth are available
