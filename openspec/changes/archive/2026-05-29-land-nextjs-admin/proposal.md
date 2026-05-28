## Why

The current product exists as a prototype under `projects/`, which makes the repository root non-runnable and leaves production concerns such as application structure, management workflows, and verification undefined. This change turns the prototype into a standard Next.js application that can be developed, built, deployed, and maintained from the repository root.

## What Changes

- **BREAKING**: Replace the nested `projects/` prototype as the runtime application entry with a standard root-level Next.js project.
- Migrate the existing public-facing South Wind AI pages, shared UI components, assets, metadata, styles, and utilities from `projects/` into the root application.
- Remove Coze-specific project commands from the application runtime in favor of standard `pnpm dev`, `pnpm build`, `pnpm start`, lint, and type-check workflows.
- Introduce a production-oriented application structure for route groups, shared components, feature modules, data access, validation, and API handlers.
- Add a management console under `/admin` covering operational dashboards, users, memberships, benefits, shop/orders, AI generation jobs, partner leads, content/assets, and system settings.
- Use PostgreSQL as the landed application database, with typed schema/migration/data-access boundaries.
- Define user account activation and identity binding behavior for public users and admin-managed accounts.
- Define admin role and permission behavior sufficient for a landed implementation.
- Delete the source prototype folder after equivalent capabilities are available from the root project.

## Capabilities

### New Capabilities

- `standard-nextjs-app`: Root-level Next.js application structure, scripts, configuration, assets, verification commands, and removal of the nested prototype runtime.
- `public-product-experience`: Migrated public South Wind AI pages and user-facing flows from the prototype.
- `admin-management-console`: Management console requirements for operational users to administer users, benefits, shop/orders, AI jobs, partners, content, and settings.
- `account-activation-binding`: User account lifecycle, activation, identity binding, and admin-assisted account recovery/activation.

### Modified Capabilities

None.

## Impact

- Affected code: root project files, `src/app`, shared components, styles, assets, scripts, and final removal of `projects/`.
- Affected routes: public routes from the prototype plus new `/admin` routes.
- Affected dependencies: Next.js, React, Tailwind CSS, shadcn/Radix UI, PostgreSQL, Drizzle ORM/migrations, S3-related adapters if retained for media storage.
- Affected workflows: development, build, lint, type-check, and local verification commands move to the repository root.
