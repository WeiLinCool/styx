## 1. Content Contract And Repository

- [ ] 1.1 Define typed homepage content defaults and metadata validators for hero, navigation, stone intro, join-us, and AI tools blocks.
- [ ] 1.2 Extend the content repository with admin list helpers, create/update operations, and status transition operations.
- [ ] 1.3 Add public homepage content read/normalization that overlays published content on static defaults and ignores draft, archived, missing, or invalid rows.
- [ ] 1.4 Add focused tests for validators, public fallback behavior, and status transition invariants.

## 2. Admin API

- [ ] 2.1 Add admin content create/update route handlers with body validation and fail-closed admin authorization.
- [ ] 2.2 Add publish, draft/unpublish, and archive route handlers with stable error responses.
- [ ] 2.3 Add route tests for invalid input, unsupported slugs, duplicate slug handling, and status transitions.

## 3. Admin UI

- [ ] 3.1 Replace disabled `/admin/content` actions with real create/edit and status action controls.
- [ ] 3.2 Show homepage block type, status, published time, updated time, validation/body summary, and source indicators in a dense table.
- [ ] 3.3 Render clear loading, error, success, empty, and disabled states for admin content mutations.

## 4. Public Homepage Rendering

- [ ] 4.1 Refactor `/home` into a server data loader plus client homepage component while preserving existing interactions.
- [ ] 4.2 Pass normalized homepage content into hero, nav, stone intro, join-us, and AI tools sections.
- [ ] 4.3 Confirm static defaults render when the database is unavailable or no published content exists.

## 5. Verification And Closure

- [ ] 5.1 Run focused tests for content validators, repository behavior, route validation, and homepage normalization.
- [ ] 5.2 Run `pnpm validate`.
- [ ] 5.3 Run `pnpm build`.
- [ ] 5.4 Run browser verification for `/admin/content` and `/home` when local database/admin auth are available, or document exact blockers.
