## Context

`projects/` is currently a Next.js 16 prototype for 南风AI / 南风石印工坊. It contains public pages for splash, home, chat, image generation, video generation, workflow, membership, benefits, shop, partner benefits, and user center, plus shadcn/ui components, Tailwind CSS, assets, and utility code. The repository root is not yet a runnable application.

The target state is a landed standard Next.js project at the repository root. `projects/` becomes a migration source only and is removed after its usable code, assets, and configuration have been moved or intentionally replaced.

## Goals / Non-Goals

**Goals:**

- Make the repository root a standard Next.js application using `pnpm dev`, `pnpm build`, `pnpm start`, lint, and type-check commands.
- Preserve and productionize the existing public prototype experience.
- Add a management console under `/admin` with concrete screens, navigation, data contracts, and permission behavior.
- Use PostgreSQL as the production database with explicit schema, migrations, repositories, and seed data.
- Support account activation and identity binding so users can be invited, activated, linked to phone/email/social identities, and recovered by admins.
- Keep the visual direction from `projects/DESIGN.md`: restrained white-background Apple-like minimalism, precise spacing, black/gray palette, and minimal motion.
- Use typed domain boundaries so public pages, admin pages, API handlers, and data adapters do not depend directly on hard-coded page data.
- Finish by deleting `projects/` once root parity and verification pass.

**Non-Goals:**

- Building a separate admin SPA or separate deployment.
- Finalizing payment, model-provider, or logistics integrations beyond stable adapters and UI-ready contracts.
- Rebranding or redesigning the existing visual language.
- Preserving Coze-specific CLI scripts as the primary runtime workflow.

## Decisions

### Root Standard Next.js App

Use the repository root as the only application root. Move `package.json`, lockfile, Next.js config, TypeScript config, ESLint config, PostCSS config, `components.json`, `src/`, `public/`, and relevant assets out of `projects/`.

Alternative considered: keep `projects/` as an app package in a workspace. That preserves prototype history but contradicts the requested final state of拆解掉当前 folder and leaves the runnable entry one level down.

### App Router With Route Groups

Use Next.js App Router route groups:

- `src/app/(public)` for customer-facing pages.
- `src/app/admin` or `src/app/(admin)/admin` for management pages.
- `src/app/api` for server endpoints.

Shared UI remains in `src/components/ui`. Product-specific components move to `src/features/<domain>`. Domain models, adapters, and validation live under `src/server` and `src/lib`.

Alternative considered: leave every page as a single route file. That is acceptable for prototypes but makes the admin console and API/data integration harder to maintain.

### Admin Console Scope

Implement admin as a first-class operational surface, not a placeholder. Initial modules:

- Dashboard: KPIs, recent jobs, orders, users, partner leads, and system notices.
- Users: search, status, membership tier, credits, and activity summary.
- Membership and benefits: plans, benefits, entitlement rules, and manual adjustments.
- Shop and orders: products, stone-print SKUs, order states, fulfillment notes, and refunds/status changes.
- AI jobs: image/video/workflow job queues, statuses, provider metadata, failures, and rerun/review actions.
- Partners: partner leads, onboarding state, benefits, and contact records.
- Content/assets: homepage content, banners, tutorials, examples, and media references.
- Settings: role access, provider config placeholders, storage config placeholders, audit events.

Alternative considered: create only a dashboard shell. That would not satisfy “补足管理端的实现设计” because the implementation would lack operational workflows.

### PostgreSQL Data Layer

Use PostgreSQL as the canonical application database and Drizzle ORM for schema, migrations, typed queries, and seed data. Database access goes through repositories under `src/server` so UI, routes, and API handlers consume domain operations instead of SQL details.

Core tables include users, identities, activation tokens, sessions, admin roles, audit events, memberships, benefits, orders, products, AI jobs, partner leads, content assets, and system settings. Local development should run against a configured PostgreSQL database; seed scripts provide representative records for public and admin flows.

Alternative considered: seed-backed in-memory data for the first version. That is useful for pure prototypes, but this project is moving from prototype to landed implementation and needs durable user activation, binding, admin auditability, and migration discipline.

### Account Activation and Binding

User accounts have an explicit lifecycle:

- `pending_activation`: account exists but cannot use protected product flows until activation.
- `active`: account has completed activation and has at least one verified login identity.
- `suspended`: account exists but is blocked by admin action.
- `archived`: account is retained for audit/history but no longer usable.

Supported binding types are email, phone, and provider identities. Each identity stores provider, provider user id or normalized address, verification status, and timestamps. A user can bind multiple identities, but a verified identity belongs to only one active user. Activation can be completed by invite token, activation code, verified email/phone flow, or admin-assisted activation. Admin-assisted changes must create audit events.

Alternative considered: treating login identity as the user row. That fails for real operations because users may need to bind phone after email signup, connect provider accounts, recover accounts, or be activated by admins after offline/business workflows.

### Authentication and Authorization

Keep the existing auth context for public user state where useful, but add server-side session, activation, and admin guards. Protected product flows require an active account. Admin routes SHALL require an active admin account with role checks. In local development, deterministic dev admin fallback is allowed only when explicitly enabled and never in production.

Alternative considered: protect admin screens only with client-side checks. That is not acceptable for a management console.

## Risks / Trade-offs

- Prototype pages may depend on browser-only state and hard-coded data -> migrate them behind smaller feature components and typed fixtures/adapters.
- Root migration may break imports or asset paths -> move in dependency order and run type-check/build after each major group.
- Admin breadth can sprawl -> ship a coherent MVP with real navigation, tables, details, and actions, while adapter implementations can be staged.
- PostgreSQL may not be configured on a new machine -> document required `DATABASE_URL`, provide migrations/seeds, and make validation fail clearly when database-backed checks are requested.
- Identity binding can create duplicate-account edge cases -> enforce unique verified identities and provide admin merge/recovery workflows in design.
- Activation tokens are security-sensitive -> hash tokens at rest, expire them, rate-limit attempts, and audit admin-assisted activation.
- Deleting `projects/` too early can lose assets -> run a parity checklist before removal.

## Migration Plan

1. Create root-level Next.js project files and scripts from the prototype, adjusted to standard `next` commands.
2. Move shared UI, Tailwind globals, utilities, public assets, and application metadata to root.
3. Move public pages into route groups and fix imports/assets.
4. Add PostgreSQL/Drizzle schema, migrations, database client, repositories, and seed data.
5. Implement account activation, identity binding, session, and admin guard boundaries.
6. Build admin layout, navigation, dashboard, list/detail screens, and action flows.
7. Run lint, type-check, build, migration/seed checks, and local browser verification.
8. Remove `projects/` only after root parity is confirmed.

Rollback is filesystem-based during development: keep migration in small commits/tasks so any failing group can be reverted without affecting unrelated completed groups.

## Open Questions

- Production auth provider, SMS/email sender, and payment provider are not selected in this change. The implementation must keep provider-specific work behind adapters.
- Final deployment target is not specified. The project should remain compatible with standard Next.js hosting until a target is chosen.
