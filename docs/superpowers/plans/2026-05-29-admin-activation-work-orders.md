---
change: enhance-admin-activation-localization
design-doc: docs/superpowers/specs/2026-05-29-admin-activation-work-orders-design.md
base-ref: dfd66eb0d1ffd85b6acce85b2eb75f747f5e0cc2
archived-with: 2026-05-29-enhance-admin-activation-localization
---

# Admin Activation Work Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build user-generated browser-bound activation work orders that support admins can approve or reject, while localizing admin UI copy into Chinese.

**Architecture:** Add a persisted activation work order domain beside existing activation tokens. User-side code creates a browser fingerprint payload and work order; admin-side code lists and transitions those work orders through approval/rejection. Approval activates the account and writes audit events.

**Tech Stack:** Next.js App Router, React client components, Drizzle/PostgreSQL, Node test runner via `tsx --test`, Zod validation.

archived-with: 2026-05-29-enhance-admin-activation-localization
---

### Task 1: Work Order Domain And Persistence

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/auth/activation-work-orders.ts`
- Test: `src/server/auth/activation-work-orders.test.ts`
- Modify: `openspec/changes/enhance-admin-activation-localization/tasks.md`

- [ ] **Step 1: Write failing domain tests**

Add tests for digest stability, create payload output, approve transition, reject transition, and invalid-state rejection. Use exported pure helpers for digest/code/status behavior so the tests do not require a live database.

Run: `pnpm exec tsx --test src/server/auth/activation-work-orders.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 2: Add schema and domain implementation**

Add an `activationWorkOrderStatus` enum and `activationWorkOrders` table with code, user id, status, fingerprint digest, limited metadata, expiry, approval/rejection fields, and indexes. Implement pure helpers plus database-backed service functions in `activation-work-orders.ts`.

- [ ] **Step 3: Run tests**

Run: `pnpm exec tsx --test src/server/auth/activation-work-orders.test.ts`
Expected: PASS.

- [ ] **Step 4: Check off Task 1 in OpenSpec tasks**

Mark `1.1`, `1.2`, and `1.3` complete in `openspec/changes/enhance-admin-activation-localization/tasks.md`.

### Task 2: User-Side Work Order Generation

**Files:**
- Create: `src/features/account/browser-fingerprint.ts`
- Create: `src/app/api/account/activation-work-orders/route.ts`
- Modify: `src/features/account/activation-panel.tsx`
- Test: `src/features/account/browser-fingerprint.test.ts`
- Modify: `openspec/changes/enhance-admin-activation-localization/tasks.md`

- [ ] **Step 1: Write failing fingerprint helper tests**

Test that browser payload normalization handles missing fields and produces stable key names.

Run: `pnpm exec tsx --test src/features/account/browser-fingerprint.test.ts`
Expected: FAIL because the helper does not exist.

- [ ] **Step 2: Implement helper, API route, and activation panel**

Implement browser payload collection with graceful fallbacks. Add `POST /api/account/activation-work-orders`, requiring an authenticated pending or active session source where available, and create a work order for the current user. Update the activation panel so users can generate a support work order code and see expiry/device summary.

- [ ] **Step 3: Run focused tests**

Run: `pnpm exec tsx --test src/features/account/browser-fingerprint.test.ts src/server/auth/activation-work-orders.test.ts`
Expected: PASS.

- [ ] **Step 4: Check off Task 2 in OpenSpec tasks**

Mark `2.1`, `2.2`, and `2.3` complete.

### Task 3: Admin Review And Localization

**Files:**
- Modify: `src/server/repositories/users.ts`
- Create: `src/app/api/admin/activation-work-orders/[workOrderId]/approve/route.ts`
- Create: `src/app/api/admin/activation-work-orders/[workOrderId]/reject/route.ts`
- Modify: `src/app/admin/users/page.tsx`
- Modify: `src/features/admin/admin-action-controls.tsx`
- Modify: `src/features/admin/admin-nav.tsx`
- Modify: `src/features/admin/admin-header.tsx`
- Modify: `src/features/admin/admin-shell.tsx`
- Modify: `src/features/admin/module-page.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: admin page modules under `src/app/admin/*/page.tsx` as needed for visible English copy.
- Test: `src/server/repositories/admin-activation-work-orders.test.ts`
- Modify: `openspec/changes/enhance-admin-activation-localization/tasks.md`

- [ ] **Step 1: Write failing admin work order tests**

Test admin row mapping for pending work orders and pure action validation where possible.

Run: `pnpm exec tsx --test src/server/repositories/admin-activation-work-orders.test.ts`
Expected: FAIL because the mapped helpers do not exist.

- [ ] **Step 2: Implement admin list/actions**

Expose recent work orders in user rows or a users-page section. Add approve/reject API routes with `requireAdmin()`, Zod validation, service calls, and localized JSON error messages.

- [ ] **Step 3: Localize admin UI**

Replace visible English admin copy in shared shell, navigation, module controls, action buttons, placeholders, empty labels, and seed/admin user strings.

- [ ] **Step 4: Run focused tests and English-copy scan**

Run: `pnpm exec tsx --test src/server/repositories/admin-activation-work-orders.test.ts src/server/auth/activation-work-orders.test.ts`
Run: `rg -n "\"[A-Za-z][^\"]*\"|'[A-Za-z][^']*'" src/features/admin src/app/admin src/server/repositories/users.ts`
Expected: tests PASS; remaining English strings are technical identifiers, URLs, enum values, emails, or acceptable product names.

- [ ] **Step 5: Check off Task 3 in OpenSpec tasks**

Mark `3.1`, `3.2`, and `3.3` complete.

### Task 4: Verification

**Files:**
- Modify: `openspec/changes/enhance-admin-activation-localization/tasks.md`

- [ ] **Step 1: Run full focused test set**

Run: `pnpm exec tsx --test src/server/auth/activation-work-orders.test.ts src/features/account/browser-fingerprint.test.ts src/server/repositories/admin-activation-work-orders.test.ts src/server/repositories/admin-mutations.test.ts src/server/repositories/admin-modules.test.ts src/server/repositories/admin-dashboard.test.ts src/server/auth/account-domain.test.ts src/features/account/account-state.test.ts`
Expected: PASS.

- [ ] **Step 2: Run static checks**

Run: `pnpm run validate`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 4: Check off verification tasks**

Mark `4.1`, `4.2`, and `4.3` complete in OpenSpec tasks.
