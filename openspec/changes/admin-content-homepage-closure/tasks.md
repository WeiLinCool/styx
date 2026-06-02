## 1. Content Contract And Repository

- [x] 1.1 Define typed homepage content defaults and metadata validators for hero, navigation, stone intro, join-us, and AI tools blocks.
- [x] 1.2 Extend the content repository with admin list helpers, create/update operations, and status transition operations.
- [x] 1.3 Add public homepage content read/normalization that overlays published content on static defaults and ignores draft, archived, missing, or invalid rows.
- [x] 1.4 Add focused tests for validators, public fallback behavior, and status transition invariants.

## 2. Admin API

- [x] 2.1 Add admin content create/update route handlers with body validation and fail-closed admin authorization.
- [x] 2.2 Add publish, draft/unpublish, and archive route handlers with stable error responses.
- [x] 2.3 Add route tests for invalid input, unsupported slugs, duplicate slug handling, and status transitions.

## 3. Admin UI

- [x] 3.1 Replace disabled `/admin/content` actions with real create/edit and status action controls.
- [x] 3.2 Show homepage block type, status, published time, updated time, validation/body summary, and source indicators in a dense table.
- [x] 3.3 Render clear loading, error, success, empty, and disabled states for admin content mutations.

## 4. Public Homepage Rendering

- [x] 4.1 Refactor `/home` into a server data loader plus client homepage component while preserving existing interactions.
- [x] 4.2 Pass normalized homepage content into hero, nav, stone intro, join-us, and AI tools sections.
- [x] 4.3 Confirm static defaults render when the database is unavailable or no published content exists.

## 5. Verification And Closure

- [x] 5.1 Run focused tests for content validators, repository behavior, route validation, and homepage normalization.
- [x] 5.2 Run `pnpm validate`.
- [x] 5.3 Run `pnpm build`.
- [x] 5.4 Run browser verification for `/admin/content` and `/home` when local database/admin auth are available, or document exact blockers.
