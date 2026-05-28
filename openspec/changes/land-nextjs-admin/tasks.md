## 1. Root Next.js Migration

- [x] 1.1 Move package, lockfile, Next.js, TypeScript, ESLint, PostCSS, shadcn, and package-manager configuration from `projects/` to the repository root.
- [x] 1.2 Replace Coze runtime scripts with standard root `pnpm dev`, `pnpm build`, `pnpm start`, lint, type-check, and validate scripts.
- [x] 1.3 Move `src/`, shared UI components, hooks, utilities, global styles, favicon, robots, and public assets into the root app.
- [x] 1.4 Fix path aliases, imports, metadata, image references, and asset paths after migration.

## 2. Public Product Experience

- [x] 2.1 Preserve and route the existing public pages from the prototype in the root App Router.
- [x] 2.2 Extract repeated public layout/navigation/user components into maintainable feature components.
- [x] 2.3 Add typed public data fixtures/adapters for home, AI tools, memberships, benefits, shop, partners, and user center.
- [x] 2.4 Verify public pages render without depending on `projects/`.

## 3. Admin Management Console

- [x] 3.1 Create admin route structure, layout, navigation, header, and guarded access state.
- [x] 3.2 Define typed admin domain models, PostgreSQL-backed repositories, seed data, and validation helpers.
- [x] 3.3 Implement dashboard metrics, recent jobs, recent orders, user activity, partner leads, and notices.
- [x] 3.4 Implement users, account activation/binding, memberships, benefits, shop/orders, AI jobs, partners, content/assets, and settings screens.
- [x] 3.5 Implement admin list filters, detail panels, status badges, and operational actions with seeded adapter behavior.

## 4. PostgreSQL, Account, And Server Boundaries

- [x] 4.1 Add PostgreSQL/Drizzle configuration, schema, migrations, database client, and seed scripts.
- [x] 4.2 Add account lifecycle, activation token/code, identity binding, session, role, and audit models.
- [x] 4.3 Add server-side active-account, admin-session, and role guard abstractions.
- [x] 4.4 Add API handlers or server actions for activation, binding, and admin read/update flows backed by repositories.
- [x] 4.5 Keep external provider integration behind adapters so S3, email/SMS, payment, and model providers can be connected later without UI rewrites.

## 5. Verification And Cleanup

- [x] 5.1 Run root lint, TypeScript check, and production build.
- [x] 5.2 Run PostgreSQL migration and seed verification against a local database.
- [x] 5.3 Start the root development server and verify representative public, activation/binding, and admin routes in browser.
- [x] 5.4 Confirm no runtime imports, scripts, or assets reference `projects/`.
- [x] 5.5 Delete `projects/` after parity and verification pass.
