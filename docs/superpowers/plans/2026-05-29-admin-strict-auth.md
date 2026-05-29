# Admin Strict Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mixed admin access path with a dedicated admin login, verification, whitelist-bypass, and admin-session flow.

**Architecture:** Add dedicated admin auth persistence and services on the server, then switch the admin layout and admin APIs to a new admin-session guard. Build standalone `/admin/login` and `/admin/login/verify` pages that drive the flow and leave SMS OTP as a blocked second step except for explicit whitelist bypass accounts.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, PostgreSQL, Node test runner, Tailwind CSS

---

### Task 1: Add admin auth persistence and tests

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/seed.ts`
- Create: `src/server/auth/admin-auth.test.ts`
- Create: `src/server/auth/admin-auth.ts`
- Modify: `src/server/repositories/users.ts`
- Create: `drizzle/0004_admin_strict_auth.sql`
- Modify: `drizzle/meta/_journal.json`

### Task 2: Add admin auth routes and guard

**Files:**
- Modify: `src/server/auth/guards.ts`
- Create: `src/app/api/admin/login/route.ts`
- Create: `src/app/api/admin/login/verify/route.ts`
- Create: `src/app/api/admin/login/whitelist-bypass/route.ts`
- Create: `src/app/api/admin/logout/route.ts`

### Task 3: Build dedicated login and verify pages

**Files:**
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/admin/login/verify/page.tsx`
- Create: `src/features/admin/admin-login-form.tsx`
- Create: `src/features/admin/admin-verify-form.tsx`
- Modify: `src/features/admin/admin-header.tsx`
- Delete/stop-using: `src/features/admin/admin-auth-actions.tsx`
- Modify: `src/app/admin/layout.tsx`

### Task 4: Verify and clean up

**Files:**
- Modify: `src/server/auth/session.ts`
- Modify: `src/server/auth/session.test.ts`

**Verification:**
- `pnpm exec tsx --test src/server/auth/admin-auth.test.ts src/server/auth/session.test.ts src/features/admin/admin-nav.test.tsx`
- `pnpm exec eslint src/app/admin/layout.tsx src/app/admin/login/page.tsx src/app/admin/login/verify/page.tsx src/features/admin/admin-login-form.tsx src/features/admin/admin-verify-form.tsx src/features/admin/admin-header.tsx src/server/auth/admin-auth.ts src/server/auth/guards.ts src/app/api/admin/login/route.ts src/app/api/admin/login/verify/route.ts src/app/api/admin/login/whitelist-bypass/route.ts src/app/api/admin/logout/route.ts src/server/db/schema.ts src/server/db/seed.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
