---
archived-with: 2026-05-29-land-nextjs-admin
status: final
---
# Land Next.js Admin Design

Status: approved for implementation planning
Change: `land-nextjs-admin`
OpenSpec: `openspec/changes/land-nextjs-admin`

## Summary

Convert the nested `projects/` prototype into a landed standard Next.js application at the repository root. The root app owns public product routes, PostgreSQL-backed account/data models, account activation and identity binding, and a first-class `/admin` management console.

The implementation must not preserve `projects/` as a runtime package. `projects/` is a migration source and should be deleted only after the root app builds, public/admin routes render, database migration/seed checks pass, and no runtime references point back to it.

## Architecture

### Application Structure

The root repository becomes the only Next.js app:

```text
src/
  app/
    (public)/
      page.tsx
      home/page.tsx
      chat/page.tsx
      image-gen/page.tsx
      video-gen/page.tsx
      workflow/page.tsx
      membership/page.tsx
      user-benefits/page.tsx
      partner-benefits/page.tsx
      shop/page.tsx
      user-center/page.tsx
    admin/
      layout.tsx
      page.tsx
      users/page.tsx
      memberships/page.tsx
      benefits/page.tsx
      orders/page.tsx
      ai-jobs/page.tsx
      partners/page.tsx
      content/page.tsx
      settings/page.tsx
    api/
      admin/
      account/
    globals.css
    layout.tsx
  components/
    ui/
    shell/
  features/
    public/
    admin/
    account/
  server/
    db/
    repositories/
    auth/
    audit/
  lib/
  hooks/
public/
```

`src/components/ui` remains the shadcn/Radix base layer. Product and admin screens should use feature components from `src/features/*` rather than concentrating all logic in route files.

### Runtime Commands

The root `package.json` must expose standard commands:

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm lint`
- `pnpm ts-check`
- `pnpm validate`
- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:seed`

Coze-specific scripts are not the primary runtime path.

## PostgreSQL Data Model

Use PostgreSQL as the canonical database and Drizzle ORM for schema, migrations, typed query helpers, and seed data.

Core tables:

- `users`: user id, display name, avatar, account state, membership summary, credit balance, timestamps.
- `user_identities`: user id, provider type, provider subject, normalized email/phone, verified flag, timestamps.
- `activation_tokens`: user id, hashed token/code, purpose, expiry, consumed timestamp, attempt counters.
- `sessions`: user id, session token hash, expiry, metadata.
- `admin_roles`: user id, role, permissions, status.
- `audit_events`: actor id, target id, event type, metadata, timestamp.
- `membership_plans`, `benefits`, `user_entitlements`.
- `products`, `orders`, `order_events`.
- `ai_jobs`: job type, user id, prompt summary, provider metadata, status, output references, error summary.
- `partner_leads`.
- `content_assets`.
- `system_settings`.

Unique constraints:

- A verified email identity is unique across active accounts.
- A verified phone identity is unique across active accounts.
- A provider identity tuple `(provider, provider_subject)` is unique across active accounts.
- Activation token hashes are unique and expire.

Repository functions under `src/server/repositories` are the only place that should know query details. UI and route handlers consume domain functions such as `getAdminDashboard()`, `listUsers()`, `activateUser()`, `bindIdentity()`, and `listAiJobs()`.

## Account Activation And Binding

Account states:

- `pending_activation`: created but not yet allowed into protected product flows.
- `active`: activated and has at least one verified login identity.
- `suspended`: blocked by admin action.
- `archived`: retained for history/audit and no longer usable.

Activation can happen through:

- Valid activation token.
- Valid activation code.
- Verified email or phone flow.
- Admin-assisted activation.

Identity binding supports:

- Email.
- Phone.
- Third-party provider identity.

Rules:

- Protected public flows require `active`.
- Admin routes require `active` plus admin role.
- A verified identity can belong to only one active user.
- Admin-assisted activation, suspension, archival, token reissue, and identity changes must create audit events.
- Activation tokens/codes are hashed at rest, expire, and track failed attempts.

## Public Product Experience

The public product experience migrates the existing prototype routes while preserving the visual language from `projects/DESIGN.md`: white canvas, restrained black/gray palette, precise spacing, modest border radius, and subtle motion.

Public pages should render with production-shaped data from typed data access. During early local development, seed data is acceptable, but it must come through the same domain interfaces used by real PostgreSQL-backed repositories.

Protected pages and actions include user center, membership purchase/entitlement views, shop checkout, and generation history. Pending users should be sent to activation/binding instead of silently seeing broken or empty states.

## Admin Console

The admin console is an operational product surface, not a placeholder. It should include:

- Dashboard: KPIs, recent users, recent AI jobs, recent orders, partner leads, and notices.
- Users: search/filter users; view lifecycle state, identities, membership, credits, activity, and audit summary.
- Account operations: reissue activation, activate, suspend, archive, inspect binding conflicts.
- Memberships and benefits: plans, benefit definitions, entitlement summaries, and manual adjustments.
- Shop/orders: products, stone-print SKUs, orders, fulfillment notes, status changes.
- AI jobs: image/video/workflow job queues, failures, provider metadata, review/rerun-ready actions.
- Partners: leads, stages, contact details, benefit interest, next action.
- Content/assets: homepage content, banners, tutorials, examples, media references.
- Settings: role access, provider placeholders, storage placeholders, recent audit events.

Admin pages should use dense, scannable operational layouts: navigation, tables, filters, detail panels, status badges, and action controls. Avoid landing-page composition inside the admin console.

## Security And Authorization

Server-side guards are required for admin pages and admin APIs. Client-side checks can improve UX but are not sufficient.

The guard stack:

1. Resolve session.
2. Load user.
3. Require `active` state.
4. Require admin role/permission for admin routes.
5. Record audit events for sensitive mutations.

Development fallback is allowed only when explicitly enabled outside production. Production must fail closed if session or database configuration is missing.

## Migration Strategy

1. Move root application config and package scripts.
2. Move `src`, shared UI, globals, utilities, and public assets.
3. Fix imports, aliases, metadata, robots, favicon, and image paths.
4. Introduce PostgreSQL/Drizzle schema, migrations, DB client, and seed data.
5. Implement account lifecycle, activation, binding, sessions, roles, and audit domain code.
6. Migrate public pages and wire protected flows to account state.
7. Implement admin shell and module screens.
8. Add admin and account API/server-action boundaries.
9. Run root validation, database migration/seed verification, build, and browser verification.
10. Delete `projects/` after root parity is confirmed.

## Verification

Minimum verification before completion:

- `pnpm install`
- `pnpm validate`
- `pnpm build`
- `pnpm db:migrate`
- `pnpm db:seed`
- Browser check for public home, user center or protected flow, `/admin`, users, orders, AI jobs, and settings.
- Search check proving no runtime import/script/asset references `projects/`.

If local PostgreSQL is unavailable, implementation must document the exact missing `DATABASE_URL` blocker and still run non-database checks that do not require a database.
