# Land Next.js Admin Implementation Plan

---
change: land-nextjs-admin
design-doc: docs/superpowers/specs/2026-05-29-land-nextjs-admin-design.md
base-ref: 911e86a3dd67b024cff4cb2de18bf55abeeaa68d
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the nested `projects/` prototype into a root-level standard Next.js application with PostgreSQL/Drizzle data, account activation/binding, and a usable `/admin` management console.

**Architecture:** The root app owns Next.js config, scripts, `src`, and `public`. Public and admin routes share shadcn UI primitives but use feature/domain modules; PostgreSQL access is isolated behind server repositories and guards.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn/Radix UI, PostgreSQL, Drizzle ORM, Zod, pnpm.

---

## File Structure

- Move to root: `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `.npmrc`, `.babelrc`, `next-env.d.ts`.
- Move to root: `src/app`, `src/components`, `src/hooks`, `src/lib`, and `public`.
- Create: `src/server/db/schema.ts`, `src/server/db/index.ts`, `src/server/db/seed.ts`, `src/server/db/migrate.ts`.
- Create: `src/server/repositories/*` for users, admin dashboard, orders, AI jobs, partners, content, settings.
- Create: `src/server/auth/*` for session resolution, active-account guard, admin guard, activation, and binding.
- Create: `src/features/admin/*` for admin shell and modules.
- Create: `src/features/account/*` for activation/binding UI and flows.
- Create: root `drizzle.config.ts` and `drizzle/` migrations output.
- Delete at the end: `projects/`.

## Task 1: Root Next.js Migration

**Files:**
- Move: `projects/package.json` -> `package.json`
- Move: `projects/pnpm-lock.yaml` -> `pnpm-lock.yaml`
- Move: `projects/next.config.ts` -> `next.config.ts`
- Move: `projects/tsconfig.json` -> `tsconfig.json`
- Move: `projects/eslint.config.mjs` -> `eslint.config.mjs`
- Move: `projects/postcss.config.mjs` -> `postcss.config.mjs`
- Move: `projects/components.json` -> `components.json`
- Move: `projects/.npmrc` -> `.npmrc`
- Move: `projects/.babelrc` -> `.babelrc`
- Move: `projects/next-env.d.ts` -> `next-env.d.ts`
- Move: `projects/src` -> `src`
- Move: `projects/public` -> `public`

- [x] **Step 1: Move root application files**

Run:

```bash
mv projects/package.json package.json
mv projects/pnpm-lock.yaml pnpm-lock.yaml
mv projects/next.config.ts next.config.ts
mv projects/tsconfig.json tsconfig.json
mv projects/eslint.config.mjs eslint.config.mjs
mv projects/postcss.config.mjs postcss.config.mjs
mv projects/components.json components.json
mv projects/.npmrc .npmrc
mv projects/.babelrc .babelrc
mv projects/next-env.d.ts next-env.d.ts
mv projects/src src
mv projects/public public
```

Expected: root contains `package.json`, `src/`, and `public/`.

- [x] **Step 2: Replace Coze runtime scripts**

Edit `package.json` scripts to:

```json
{
  "scripts": {
    "build": "next build",
    "dev": "next dev",
    "lint": "eslint",
    "lint:build": "eslint . --quiet",
    "start": "next start",
    "ts-check": "tsc -p tsconfig.json",
    "validate": "pnpm run --parallel '/^(ts-check|lint:build)$/'",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/server/db/migrate.ts",
    "db:seed": "tsx src/server/db/seed.ts"
  }
}
```

Expected: no root script calls `projects/scripts/*`, `coze dev`, `coze build`, or `coze start`.

- [x] **Step 3: Simplify Next config**

Edit `next.config.ts` to remove Coze-only settings:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
```

Expected: no `turbopack.root: '..'` or `allowedDevOrigins` remains.

- [x] **Step 4: Install from root**

Run:

```bash
pnpm install
```

Expected: dependencies install using root `package.json`.

- [x] **Step 5: Commit root migration**

Run:

```bash
git add package.json pnpm-lock.yaml next.config.ts tsconfig.json eslint.config.mjs postcss.config.mjs components.json .npmrc .babelrc next-env.d.ts src public projects
git commit -m "chore: migrate next app to repository root"
```

## Task 2: PostgreSQL And Drizzle Foundation

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/server/db/schema.ts`
- Create: `src/server/db/index.ts`
- Create: `src/server/db/migrate.ts`
- Create: `src/server/db/seed.ts`
- Modify: `package.json`

- [x] **Step 1: Add database dependencies if missing**

Run:

```bash
pnpm add drizzle-orm pg zod
pnpm add -D drizzle-kit tsx @types/pg
```

Expected: dependencies are present in root `package.json`.

- [x] **Step 2: Create Drizzle config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
```

- [x] **Step 3: Create database schema**

Create `src/server/db/schema.ts` with enums and tables for users, identities, activation tokens, sessions, roles, audit events, memberships, products, orders, AI jobs, partners, content, and settings. Include unique indexes for verified identity ownership and activation token hashes.

- [x] **Step 4: Create database client**

Create `src/server/db/index.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL is required in production');
}

const pool = connectionString
  ? new Pool({ connectionString })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;
export { schema };
```

- [x] **Step 5: Create migration runner**

Create `src/server/db/migrate.ts` that exits with a clear message when `DATABASE_URL` is missing and otherwise runs Drizzle migrations from `./drizzle`.

- [x] **Step 6: Create seed script**

Create `src/server/db/seed.ts` that inserts representative users, identities, admin roles, membership plans, products, orders, AI jobs, partner leads, content assets, settings, and audit events. It must be idempotent by using stable ids or upserts.

- [x] **Step 7: Generate migration**

Run:

```bash
pnpm db:generate
```

Expected: a migration appears under `drizzle/`.

- [x] **Step 8: Commit database foundation**

Run:

```bash
git add package.json pnpm-lock.yaml drizzle.config.ts drizzle src/server/db
git commit -m "feat: add postgresql drizzle foundation"
```

## Task 3: Account Activation And Binding

**Files:**
- Create: `src/server/auth/account-types.ts`
- Create: `src/server/auth/account-service.ts`
- Create: `src/server/auth/session.ts`
- Create: `src/server/auth/guards.ts`
- Create: `src/server/repositories/users.ts`
- Create: `src/server/audit/audit-service.ts`
- Create: `src/features/account/activation-panel.tsx`
- Create: `src/app/api/account/activate/route.ts`
- Create: `src/app/api/account/bind/route.ts`

- [ ] **Step 1: Define account domain types**

Create `src/server/auth/account-types.ts` with account states, identity provider types, activation input types, and binding result unions.

- [ ] **Step 2: Implement user repository**

Create repository functions:

```ts
getUserById(userId)
getUserByIdentity(provider, subject)
listUserIdentities(userId)
createActivationToken(userId, purpose)
consumeActivationToken(token)
bindVerifiedIdentity(userId, identity)
setUserAccountState(userId, state, actorId, reason)
```

Expected: verified identity conflicts return a typed error instead of overwriting.

- [ ] **Step 3: Implement audit service**

Create `recordAuditEvent({ actorId, targetId, type, metadata })` and use it from account mutations.

- [ ] **Step 4: Implement activation service**

Create `activateAccountWithToken`, `activateAccountByAdmin`, `reissueActivation`, and `suspendAccount`. Hash tokens before storage and reject expired/consumed tokens.

- [ ] **Step 5: Implement identity binding service**

Create `bindEmailIdentity`, `bindPhoneIdentity`, and `bindProviderIdentity`; enforce one verified identity per active user.

- [ ] **Step 6: Implement session and guards**

Create `resolveSession`, `requireActiveAccount`, and `requireAdmin`. Production must fail closed when no session exists. Development fallback must require an explicit env flag.

- [ ] **Step 7: Add account API routes**

Create `POST /api/account/activate` and `POST /api/account/bind` route handlers with Zod validation and typed JSON errors.

- [ ] **Step 8: Add activation panel UI**

Create an account activation panel that explains pending state, accepts activation code/token, and offers binding actions for email/phone/provider placeholders.

- [ ] **Step 9: Commit account lifecycle**

Run:

```bash
git add src/server/auth src/server/repositories src/server/audit src/features/account src/app/api/account
git commit -m "feat: add account activation and binding"
```

## Task 4: Public Product Migration And Protected Flows

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/home/page.tsx`
- Modify: `src/app/chat/page.tsx`
- Modify: `src/app/image-gen/page.tsx`
- Modify: `src/app/video-gen/page.tsx`
- Modify: `src/app/workflow/page.tsx`
- Modify: `src/app/membership/page.tsx`
- Modify: `src/app/shop/page.tsx`
- Modify: `src/app/user-center/page.tsx`
- Create: `src/features/public/*`

- [ ] **Step 1: Keep public route parity**

Run:

```bash
find src/app -maxdepth 2 -type f -name page.tsx | sort
```

Expected: splash/root, home, chat, image-gen, video-gen, workflow, membership, user-benefits, partner-benefits, shop, and user-center pages exist under root `src/app`.

- [ ] **Step 2: Extract repeated public shell components**

Create feature components for public navigation, auth entry, product cards, benefit lists, and tool panels when route files contain duplicated UI.

- [ ] **Step 3: Add public data adapters**

Create typed data modules for homepage content, tool model options, membership plans, benefits, shop products, partner content, and user-center fixtures backed by seed-shaped records.

- [ ] **Step 4: Wire protected pages to active account state**

User center, membership purchase actions, checkout actions, and generation history must call the account/session abstraction and render the activation panel when account state is pending.

- [ ] **Step 5: Commit public migration**

Run:

```bash
git add src/app src/features/public src/features/account src/lib src/hooks
git commit -m "feat: migrate public product experience"
```

## Task 5: Admin Shell

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/features/admin/admin-shell.tsx`
- Create: `src/features/admin/admin-nav.tsx`
- Create: `src/features/admin/admin-header.tsx`
- Create: `src/features/admin/status-badge.tsx`

- [ ] **Step 1: Create guarded admin layout**

`src/app/admin/layout.tsx` must call `requireAdmin()` on the server and render an access-denied state when unauthorized in development, or throw/redirect according to the guard contract in production.

- [ ] **Step 2: Create admin shell**

Create sidebar navigation links for dashboard, users, memberships, benefits, orders, AI jobs, partners, content, and settings.

- [ ] **Step 3: Create dashboard page**

Create dashboard cards and tables for KPIs, recent users, recent AI jobs, recent orders, partner leads, and notices using repository functions.

- [ ] **Step 4: Commit admin shell**

Run:

```bash
git add src/app/admin src/features/admin
git commit -m "feat: add admin shell and dashboard"
```

## Task 6: Admin Modules

**Files:**
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/admin/memberships/page.tsx`
- Create: `src/app/admin/benefits/page.tsx`
- Create: `src/app/admin/orders/page.tsx`
- Create: `src/app/admin/ai-jobs/page.tsx`
- Create: `src/app/admin/partners/page.tsx`
- Create: `src/app/admin/content/page.tsx`
- Create: `src/app/admin/settings/page.tsx`
- Create: `src/server/repositories/admin-dashboard.ts`
- Create: `src/server/repositories/orders.ts`
- Create: `src/server/repositories/ai-jobs.ts`
- Create: `src/server/repositories/partners.ts`
- Create: `src/server/repositories/content.ts`
- Create: `src/server/repositories/settings.ts`

- [ ] **Step 1: Implement users module**

Users page must show search/filter controls, lifecycle state, identities, membership, credits, activity, and audit summary. Include actions for reissue activation, activate, suspend, and archive.

- [ ] **Step 2: Implement memberships and benefits modules**

Pages must show plan definitions, pricing labels, benefit rules, entitlement summaries, and manual adjustment-ready actions.

- [ ] **Step 3: Implement orders module**

Orders page must show order status, user, products/SKUs, fulfillment notes, totals, and status update-ready actions.

- [ ] **Step 4: Implement AI jobs module**

AI jobs page must show job type, user, prompt summary, provider metadata, output references, status, error summary, and review/rerun-ready actions.

- [ ] **Step 5: Implement partners module**

Partners page must show leads, stage, source, contact details, benefit interest, and next action.

- [ ] **Step 6: Implement content and settings modules**

Content page must show homepage content, banners, tutorials, examples, and media references. Settings page must show role access, provider placeholders, storage placeholders, and audit events.

- [ ] **Step 7: Commit admin modules**

Run:

```bash
git add src/app/admin src/features/admin src/server/repositories
git commit -m "feat: implement admin management modules"
```

## Task 7: API Boundaries And Mutations

**Files:**
- Create: `src/app/api/admin/users/[userId]/activate/route.ts`
- Create: `src/app/api/admin/users/[userId]/suspend/route.ts`
- Create: `src/app/api/admin/users/[userId]/activation/route.ts`
- Create: `src/app/api/admin/orders/[orderId]/status/route.ts`
- Create: `src/app/api/admin/ai-jobs/[jobId]/review/route.ts`

- [ ] **Step 1: Add admin user mutation routes**

Each route must call `requireAdmin()`, validate input with Zod, call repository/service functions, and record audit events.

- [ ] **Step 2: Add order and AI job operation routes**

Order status and AI job review routes must call `requireAdmin()`, validate status/action inputs, persist changes, and record audit events.

- [ ] **Step 3: Wire admin action buttons**

Admin UI actions must call the API routes and surface success/error states with existing UI feedback primitives.

- [ ] **Step 4: Commit API boundaries**

Run:

```bash
git add src/app/api/admin src/features/admin src/server
git commit -m "feat: add admin api boundaries"
```

## Task 8: Verification And Prototype Removal

**Files:**
- Modify: `openspec/changes/land-nextjs-admin/tasks.md`
- Delete: `projects/`

- [ ] **Step 1: Run static verification**

Run:

```bash
pnpm validate
pnpm build
```

Expected: both commands pass.

- [ ] **Step 2: Run database verification**

Run:

```bash
pnpm db:migrate
pnpm db:seed
```

Expected: both pass when `DATABASE_URL` points to PostgreSQL. If `DATABASE_URL` is unavailable, record the exact blocker in the final verification notes.

- [ ] **Step 3: Start development server**

Run:

```bash
pnpm dev
```

Expected: server starts from repository root.

- [ ] **Step 4: Browser verify representative routes**

Open and inspect:

```text
/
/home
/user-center
/admin
/admin/users
/admin/orders
/admin/ai-jobs
/admin/settings
```

Expected: pages render without blank screens or incoherent layout overlap.

- [ ] **Step 5: Confirm no runtime references to projects**

Run:

```bash
rg "projects/" package.json next.config.ts tsconfig.json src public
```

Expected: no runtime references.

- [ ] **Step 6: Remove prototype folder**

Run:

```bash
rm -rf projects
```

Expected: root app remains buildable.

- [ ] **Step 7: Check off OpenSpec tasks**

Update `openspec/changes/land-nextjs-admin/tasks.md` from `- [ ]` to `- [x]` for completed items.

- [ ] **Step 8: Commit cleanup**

Run:

```bash
git add .
git commit -m "chore: verify landed app and remove prototype"
```

## Self-Review

- Spec coverage: root migration, public pages, PostgreSQL/Drizzle, activation/binding, admin console, API boundaries, verification, and prototype deletion are represented.
- Placeholder scan: no TBD/TODO placeholders remain; implementation details are specified by file and command.
- Type consistency: domain names match the design document and OpenSpec capabilities.
