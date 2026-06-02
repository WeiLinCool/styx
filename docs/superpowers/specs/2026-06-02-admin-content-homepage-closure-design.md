# Admin Content Homepage Closure Design

## Context

The admin console already exposes `/admin/content`, and the database already has `content_assets` with `slug`, `title`, `kind`, `status`, `url`, `body`, `metadata`, `published_at`, owner, and timestamps. Today that page is read-only: the action buttons are disabled, there are no admin mutation routes for content, and user-facing pages do not read `content_assets`.

The first closed loop will be the `/home` page only. Current homepage content is split between hardcoded component-local arrays and `src/features/public/home-data.ts`. This change turns selected homepage sections into structured content assets managed from the admin console while preserving the existing static content as a fallback.

Reference-driven principles:

- Mature CMS products separate draft content from published content and keep production readers on the published view.
- Structured content models make repeated content predictable and reusable.
- Publishing is an explicit state transition; editing a draft must not silently change production content.

## Goals

- Let authorized admins create, edit, publish, unpublish, and archive structured homepage content blocks from `/admin/content`.
- Make `/home` render admin-published content for the selected homepage blocks.
- Keep `/home` stable when no database exists, no content has been published, or a published content record is malformed.
- Reuse the existing `content_assets` table for the first release unless implementation proves an additive schema field is necessary.
- Leave a reusable content contract and tests so later pages can migrate without redefining the workflow.

## Non-Goals

- Migrating every public page in this change.
- Building full CMS version history, scheduled publishing, preview tokens, rich media upload, collaborative editing, or bulk operations.
- Making shop products, membership plans, prices, or entitlement/business rules editable through this content loop.
- Changing public auth, account, billing, or order behavior.

## State Ownership

| State | Owner | Write Entry | Source Of Truth | Notes |
| --- | --- | --- | --- | --- |
| Homepage content block draft | Admin content API + repository | `/api/admin/content` create/update routes | `content_assets` row by `slug` | `status = draft` is not public. |
| Published homepage content block | Admin content API + repository | publish/unpublish/archive routes | `content_assets.status` and `published_at` | Public readers filter to published rows. |
| Public homepage view model | Public content repository | server read from `/home` route | derived from published `content_assets` plus static fallback | UI never writes durable content. |
| Static homepage fallback | `src/features/public/home-data.ts` and current page defaults | code changes only | source code | Used when DB/content is unavailable or invalid. |

## Invariants

1. Public `/home` readers SHALL only use content rows with `status = published` and a non-null `published_at`.
2. Draft edits SHALL NOT change the public homepage until an explicit publish action succeeds.
3. Missing, unavailable, or invalid homepage content SHALL fall back to the existing static homepage data rather than rendering a blank or broken page.
4. Admin mutation routes SHALL validate input and require the existing admin session guard before repository writes.

## Content Model

Use `content_assets.kind = "page"` for homepage blocks and reserve slug prefixes for structured blocks:

- `home.hero`
- `home.nav`
- `home.stone_intro`
- `home.join_us`
- `home.ai_tools`

Each block stores a validated JSON object in `metadata`. `body` can hold longer primary copy where useful, but the public reader should normalize every block into typed view-model objects before rendering.

Initial block coverage:

- Hero: eyebrow, headline, subheadline, body copy, primary CTA label/href, secondary CTA label/href.
- Navigation: public nav links, explore links, AI tool links.
- Stone intro: section headings, category cards, feature bullets, process steps.
- Join us: headings, advantage cards, platform labels, method cards, CTA labels/hrefs.
- AI tools: heading and tool cards.

The design intentionally avoids editing icon components directly. Blocks may store stable icon keys only when needed; rendering maps those keys to local Lucide icons or existing visual defaults.

## Architecture

### Admin UI

`/admin/content` becomes a real operational surface instead of a disabled table:

- Keep the existing dense table and metrics.
- Add create/edit dialogs for homepage blocks using existing shadcn/Radix primitives.
- Add status actions: publish, unpublish to draft, archive.
- Add search/filter behavior if it can be implemented with existing module patterns; otherwise keep filters server-side and avoid fake disabled controls.
- Show record status, slug, placement, updated time, published time, and a concise validation/body summary.

The first UI can use JSON-backed structured forms for arrays where a full nested editor would be too large, but the schema must be validated at the API boundary and public reader.

### API Boundary

Add admin content route handlers under `src/app/api/admin/content`:

- `POST /api/admin/content` creates a draft content asset.
- `PATCH /api/admin/content/[contentId]` updates draftable fields.
- `POST /api/admin/content/[contentId]/publish` publishes current content and sets `published_at`.
- `POST /api/admin/content/[contentId]/draft` unpublishes by setting status to draft and clearing or preserving `published_at` according to repository policy.
- `POST /api/admin/content/[contentId]/archive` archives a record and removes it from public reads.

Routes validate body shape before calling repository functions. Validation errors return stable API responses consistent with existing admin routes.

### Repository

Extend `src/server/repositories/content.ts` or split a focused `admin-content.ts` if the file becomes too mixed.

Repository responsibilities:

- query admin lists and metrics;
- normalize records for admin display;
- create/update content with slug uniqueness handling;
- enforce allowed content kinds, statuses, and homepage slug conventions;
- perform status transitions;
- expose a public read helper that returns a typed homepage content view model with fallback.

### Public Rendering

Refactor `/home` so the route/page layer fetches homepage content server-side, then passes a typed content prop into the interactive client homepage component. The client component continues to own UI-only state such as login modal, create modal, scroll reveal, and mobile nav menu.

Public content flow:

```
content_assets published rows
  -> public content repository
  -> typed homepage content view model
  -> /home server page
  -> client homepage component
  -> existing static fallback for missing sections
```

If converting the current client page directly is too invasive, create `src/features/public/home-page.tsx` as the client component and let `src/app/home/page.tsx` become the server wrapper.

## Error Handling

- Admin create/update rejects empty slug/title, unsupported block slugs, invalid metadata, and duplicate slugs.
- Publish rejects malformed homepage metadata so bad drafts do not become public.
- Public read catches unavailable database fallback through the existing `ensureAdminReadSource`-style pattern or a dedicated public read source helper.
- Public rendering never trusts raw JSON; it consumes normalized values with fallback defaults.
- Archive is terminal for public reads but can remain visible in admin history/list filters.

## Auditability

Content publish, unpublish, archive, and edit actions are admin mutations. If the existing audit module exposes a suitable event writer, these actions should write audit events with admin id, content id, slug, previous status, next status, and reason when supplied. If the audit API cannot be reused cleanly in the first implementation, the design still requires route/repository tests for status transitions and a follow-up note in verification.

## Testing And Verification

Focused tests:

- metadata validators accept the defined homepage blocks and reject malformed arrays/CTA fields;
- public reader returns only published rows and falls back for draft/archived/missing/invalid content;
- admin repository status transitions preserve the invariants;
- admin route handlers reject invalid input before repository writes;
- `/home` build wiring remains valid after server/client split.

Commands:

- targeted test command for touched repository/route/client helpers;
- `pnpm validate`;
- `pnpm build`;
- browser verification for `/admin/content` and `/home` when local auth/database setup allows it.

## Risks And Trade-Offs

- JSON metadata is flexible but can become implicit schema. Mitigation: keep explicit TypeScript validators and tests per block.
- The current homepage is a large client component. Mitigation: split only enough to add a server wrapper and typed client prop, avoiding unrelated visual redesign.
- Publishing malformed JSON would break public rendering if raw data leaks through. Mitigation: validate on publish and normalize again on read.
- Admin editing nested arrays can become complex. Mitigation: start with compact structured controls or validated JSON fields for block arrays, then improve editors after the closure is proven.

## Follow-Up Expansion Path

After the homepage loop is verified, migrate other static content in this order:

1. Brand story, academy, gallery, user benefits, and partner benefits as marketing content blocks.
2. Shop display copy that is not durable business truth.
3. Membership marketing copy and FAQ, while keeping entitlement and billing rules owned by membership/billing domains.
