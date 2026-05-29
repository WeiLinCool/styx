---
archived-with: 2026-05-29-admin-auth-nav-workorders
status: final
---
# Admin Auth Nav Workorders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin login/logout interactions, fix route-aware sidebar highlighting, and turn activation binding work orders into a paginated status-tabbed queue with archive management.

**Architecture:** Reuse the existing cookie-backed auth endpoints and admin layout boundaries, move shell interactions into small client components, and extend the work-order repository/page contract to support server-side queue status filtering and pagination. Keep the current users table intact while isolating new queue logic into focused admin feature units.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, Node test runner, ESLint

---

### Task 1: Finalize OpenSpec artifacts and queue design references

**Files:**
- Modify: `openspec/changes/admin-auth-nav-workorders/proposal.md`
- Modify: `openspec/changes/admin-auth-nav-workorders/design.md`
- Modify: `openspec/changes/admin-auth-nav-workorders/tasks.md`
- Modify: `openspec/changes/admin-auth-nav-workorders/specs/admin-management-console/spec.md`
- Modify: `openspec/changes/admin-auth-nav-workorders/specs/account-activation-binding/spec.md`
- Modify: `docs/superpowers/specs/2026-05-29-admin-auth-nav-workorders-design.md`

- [ ] **Step 1: Review the written spec artifacts for consistency**

Read:

```bash
sed -n '1,220p' openspec/changes/admin-auth-nav-workorders/proposal.md
sed -n '1,260p' openspec/changes/admin-auth-nav-workorders/design.md
sed -n '1,220p' openspec/changes/admin-auth-nav-workorders/tasks.md
sed -n '1,220p' openspec/changes/admin-auth-nav-workorders/specs/admin-management-console/spec.md
sed -n '1,220p' openspec/changes/admin-auth-nav-workorders/specs/account-activation-binding/spec.md
sed -n '1,260p' docs/superpowers/specs/2026-05-29-admin-auth-nav-workorders-design.md
```

Expected: all files describe the same four queue statuses, auth shell scope, and nav behavior with no placeholder language.

- [ ] **Step 2: Run the open-phase guard and store the design-doc path**

Run:

```bash
COMET_SEARCH_ROOTS=("." "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.cursor/skills")
COMET_GUARD="${COMET_GUARD:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-guard.sh' -type f -print -quit 2>/dev/null)}"
COMET_STATE="${COMET_STATE:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-state.sh' -type f -print -quit 2>/dev/null)}"
bash "$COMET_GUARD" admin-auth-nav-workorders open --apply
bash "$COMET_STATE" set admin-auth-nav-workorders design_doc docs/superpowers/specs/2026-05-29-admin-auth-nav-workorders-design.md
bash "$COMET_GUARD" admin-auth-nav-workorders design --apply
```

Expected: guard output passes and `.comet.yaml` advances to `phase: build`.

- [ ] **Step 3: Commit the change artifacts**

Run:

```bash
git add openspec/changes/admin-auth-nav-workorders docs/superpowers/specs/2026-05-29-admin-auth-nav-workorders-design.md
git commit -m "docs: define admin auth nav workorder change"
```

Expected: one commit containing only spec/design artifacts for this change.

### Task 2: Add failing coverage for route-aware admin navigation

**Files:**
- Create: `src/features/admin/admin-nav.test.tsx`
- Modify: `src/features/admin/admin-nav.tsx`
- Test: `src/features/admin/admin-nav.test.tsx`

- [ ] **Step 1: Write the failing nav-active tests**

```tsx
import test from 'node:test';
import assert from 'node:assert/strict';

import { isAdminNavItemActive } from './admin-nav';

test('dashboard nav item matches only the admin root', () => {
  assert.equal(isAdminNavItemActive('/admin', '/admin'), true);
  assert.equal(isAdminNavItemActive('/admin', '/admin/users'), false);
});

test('module nav item matches exact and nested routes', () => {
  assert.equal(isAdminNavItemActive('/admin/users', '/admin/users'), true);
  assert.equal(isAdminNavItemActive('/admin/users', '/admin/users/123'), true);
  assert.equal(isAdminNavItemActive('/admin/users', '/admin/orders'), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test src/features/admin/admin-nav.test.tsx
```

Expected: FAIL because `isAdminNavItemActive` does not exist yet and `admin-nav.tsx` is not structured for direct testing.

- [ ] **Step 3: Implement the minimal active-state helper and client nav**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function isAdminNavItemActive(href: string, pathname: string) {
  if (href === '/admin') {
    return pathname === '/admin';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
```

Add the helper to `src/features/admin/admin-nav.tsx`, derive `pathname` from `usePathname()`, and switch the hard-coded dashboard styling to `isAdminNavItemActive(item.href, pathname)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node --test src/features/admin/admin-nav.test.tsx
```

Expected: PASS for both route-matching scenarios.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/admin-nav.tsx src/features/admin/admin-nav.test.tsx
git commit -m "fix: sync admin nav active state with routes"
```

### Task 3: Add failing coverage for admin auth shell actions

**Files:**
- Create: `src/features/admin/admin-auth-actions.test.tsx`
- Create: `src/features/admin/admin-auth-actions.tsx`
- Modify: `src/features/admin/admin-header.tsx`
- Modify: `src/app/admin/layout.tsx`
- Test: `src/features/admin/admin-auth-actions.test.tsx`

- [ ] **Step 1: Write the failing auth-action tests**

```tsx
import test from 'node:test';
import assert from 'node:assert/strict';

import { getAdminAuthActionState } from './admin-auth-actions';

test('authenticated admins see logout action state', () => {
  assert.deepEqual(getAdminAuthActionState(true), { kind: 'logout', label: '退出登录' });
});

test('unauthenticated admin fallback sees login action state', () => {
  assert.deepEqual(getAdminAuthActionState(false), { kind: 'login', label: '进入后台' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test src/features/admin/admin-auth-actions.test.tsx
```

Expected: FAIL because `admin-auth-actions.tsx` does not exist yet.

- [ ] **Step 3: Implement the auth action component and wire it into header/layout**

```tsx
export function getAdminAuthActionState(authenticated: boolean) {
  return authenticated
    ? { kind: 'logout' as const, label: '退出登录' }
    : { kind: 'login' as const, label: '进入后台' };
}
```

In `src/features/admin/admin-auth-actions.tsx`, add a client component that:
- posts `POST /api/auth/logout` for authenticated state,
- posts `POST /api/auth/login` with a small form or prefilled development payload for unauthenticated development state,
- calls `router.refresh()` after success,
- shows localized pending/error text.

Render it from `src/features/admin/admin-header.tsx` for authenticated sessions and from the denied panel in `src/app/admin/layout.tsx` for development fallback.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node --test src/features/admin/admin-auth-actions.test.tsx
```

Expected: PASS for login/logout action-state selection.

- [ ] **Step 5: Run focused validation for the touched files**

Run:

```bash
pnpm exec eslint src/features/admin/admin-auth-actions.tsx src/features/admin/admin-header.tsx src/app/admin/layout.tsx
```

Expected: no lint errors for the new auth-action integration.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/admin-auth-actions.tsx src/features/admin/admin-auth-actions.test.tsx src/features/admin/admin-header.tsx src/app/admin/layout.tsx
git commit -m "feat: add admin auth shell actions"
```

### Task 4: Add failing coverage for queue-status mapping and pagination contract

**Files:**
- Modify: `src/server/repositories/admin-activation-work-orders.test.ts`
- Modify: `src/server/repositories/admin-activation-work-orders.ts`
- Test: `src/server/repositories/admin-activation-work-orders.test.ts`

- [ ] **Step 1: Extend the repository test with queue mapping and page slicing**

```ts
test('mapActivationWorkOrderForAdmin converts legacy approved rows into closed queue records', () => {
  const row = mapActivationWorkOrderForAdmin({
    workOrder: {
      id: 'order-2',
      code: 'ACT-CLOS-0001',
      status: 'approved',
      deviceMetadata: { platform: 'MacIntel', screen: '1440x900', timezone: 'Asia/Shanghai' },
      expiresAt: new Date('2026-05-30T08:00:00.000Z'),
      createdAt: new Date('2026-05-29T08:00:00.000Z'),
    },
    user: {
      id: 'user-2',
      displayName: '已办结用户',
      email: 'closed@styx.local',
      phone: null,
      accountState: 'active',
    },
  });

  assert.equal(row.queueStatus, 'closed');
  assert.equal(row.outcome, 'approved');
});
```

Also add a small pure-function test for pagination metadata:

```ts
test('paginateAdminWorkOrders returns second page boundaries', () => {
  const page = paginateAdminWorkOrders({
    status: 'archived',
    page: 2,
    pageSize: 10,
    records: Array.from({ length: 25 }, (_, index) => ({ id: `${index}` })),
  });

  assert.equal(page.page, 2);
  assert.equal(page.total, 25);
  assert.equal(page.records.length, 10);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test src/server/repositories/admin-activation-work-orders.test.ts
```

Expected: FAIL because `queueStatus`, `outcome`, and `paginateAdminWorkOrders` do not exist yet.

- [ ] **Step 3: Implement queue mapping and pagination helpers**

```ts
export type AdminWorkOrderQueueStatus = 'pending' | 'processing' | 'closed' | 'archived';

export function mapLegacyWorkOrderStatus(status: ActivationWorkOrderStatus): {
  queueStatus: AdminWorkOrderQueueStatus;
  outcome: 'approved' | 'rejected' | 'expired' | null;
} {
  if (status === 'pending') return { queueStatus: 'pending', outcome: null };
  if (status === 'approved') return { queueStatus: 'closed', outcome: 'approved' };
  if (status === 'rejected') return { queueStatus: 'closed', outcome: 'rejected' };
  return { queueStatus: 'archived', outcome: 'expired' };
}
```

Extend `mapActivationWorkOrderForAdmin` to include `queueStatus`, `outcome`, and `closedAt`, then add a pure pagination helper for slicing records and returning `page`, `pageSize`, and `total`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
node --test src/server/repositories/admin-activation-work-orders.test.ts
```

Expected: PASS for queue-status mapping and pagination helper behavior.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/admin-activation-work-orders.ts src/server/repositories/admin-activation-work-orders.test.ts
git commit -m "refactor: add admin workorder queue mapping"
```

### Task 5: Upgrade the activation work-order domain to queue lifecycle actions

**Files:**
- Modify: `src/server/auth/activation-work-orders.ts`
- Modify: `src/server/auth/activation-work-orders.test.ts`
- Modify: `src/app/api/admin/activation-work-orders/[workOrderId]/approve/route.ts`
- Modify: `src/app/api/admin/activation-work-orders/[workOrderId]/reject/route.ts`
- Create: `src/app/api/admin/activation-work-orders/[workOrderId]/processing/route.ts`
- Create: `src/app/api/admin/activation-work-orders/[workOrderId]/archive/route.ts`
- Test: `src/server/auth/activation-work-orders.test.ts`

- [ ] **Step 1: Write failing lifecycle transition tests**

```ts
test('getActivationWorkOrderTransition allows pending work order to move into processing', () => {
  const result = getActivationWorkOrderTransition({
    currentStatus: 'pending',
    expiresAt: new Date('2026-05-30T00:00:00.000Z'),
    action: 'start_processing',
    now: new Date('2026-05-29T00:00:00.000Z'),
  });

  assert.deepEqual(result, { ok: true, nextStatus: 'processing' });
});
```

```ts
test('getActivationWorkOrderTransition allows closed work order to move into archived', () => {
  const result = getActivationWorkOrderTransition({
    currentStatus: 'closed',
    expiresAt: new Date('2026-05-30T00:00:00.000Z'),
    action: 'archive',
    now: new Date('2026-05-29T00:00:00.000Z'),
  });

  assert.deepEqual(result, { ok: true, nextStatus: 'archived' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test src/server/auth/activation-work-orders.test.ts
```

Expected: FAIL because the domain only knows `approve` and `reject`, and the status union does not include `processing`, `closed`, or `archived`.

- [ ] **Step 3: Implement minimal lifecycle support**

Update the domain model in `src/server/auth/activation-work-orders.ts` so the unions look like:

```ts
export type ActivationWorkOrderStatus = 'pending' | 'processing' | 'closed' | 'archived';
export type ActivationWorkOrderAction = 'start_processing' | 'approve' | 'reject' | 'archive';
```

Add transition logic:

```ts
if (input.action === 'start_processing' && input.currentStatus === 'pending') {
  return { ok: true, nextStatus: 'processing' };
}

if ((input.action === 'approve' || input.action === 'reject') && input.currentStatus === 'processing') {
  return { ok: true, nextStatus: 'closed' };
}

if (input.action === 'archive' && input.currentStatus === 'closed') {
  return { ok: true, nextStatus: 'archived' };
}
```

Carry the approval/rejection result in metadata or dedicated fields so business outcome survives after the top-level status becomes `closed`.

- [ ] **Step 4: Wire route handlers for processing and archive actions**

Implement `POST` handlers that:
- call `requireAdmin()`,
- parse an optional `reason`,
- invoke the corresponding domain method,
- return localized success payloads via `NextResponse.json`.

Use the existing approve/reject routes as the structural template.

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
node --test src/server/auth/activation-work-orders.test.ts
```

Expected: PASS for the expanded lifecycle transitions.

- [ ] **Step 6: Commit**

```bash
git add src/server/auth/activation-work-orders.ts src/server/auth/activation-work-orders.test.ts src/app/api/admin/activation-work-orders
git commit -m "feat: add activation workorder queue lifecycle"
```

### Task 6: Build the paginated work-order queue UI on the users page

**Files:**
- Create: `src/features/admin/admin-work-order-queue.tsx`
- Modify: `src/app/admin/users/page.tsx`
- Modify: `src/features/admin/admin-action-controls.tsx`
- Modify: `src/server/repositories/admin-activation-work-orders.ts`
- Test: `src/server/repositories/admin-activation-work-orders.test.ts`

- [ ] **Step 1: Write the failing repository-level contract test for query-driven queue loading**

```ts
test('getAdminActivationWorkOrders defaults invalid page values to page 1', async () => {
  const queue = await getAdminActivationWorkOrders({
    status: 'closed',
    page: Number.NaN,
    pageSize: 10,
  });

  assert.equal(queue.page, 1);
  assert.equal(queue.status, 'closed');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test src/server/repositories/admin-activation-work-orders.test.ts
```

Expected: FAIL because `getAdminActivationWorkOrders` currently takes no arguments and returns a flat array.

- [ ] **Step 3: Implement the repository contract and queue component**

Update `src/server/repositories/admin-activation-work-orders.ts` to expose:

```ts
export async function getAdminActivationWorkOrders(input: {
  status: AdminWorkOrderQueueStatus;
  page: number;
  pageSize: number;
}): Promise<AdminActivationWorkOrderQueue> { /* ... */ }
```

Then create `src/features/admin/admin-work-order-queue.tsx` that renders:
- tab buttons for `pending`, `processing`, `closed`, `archived`,
- status counts,
- queue rows with device summary and timestamps,
- action buttons according to current tab,
- simple previous/next pagination controls driven by URL search params.

In `src/app/admin/users/page.tsx`, read `searchParams.status` and `searchParams.page`, fetch the queue payload, and render `<AdminWorkOrderQueue queue={queue} />` above `<AdminUsersModule ... />`.

- [ ] **Step 4: Update row actions for queue lifecycle**

In `src/features/admin/admin-action-controls.tsx`, add or revise work-order buttons roughly as:

```ts
pending -> "开始处理"
processing -> "通过并办结", "拒绝并办结"
closed -> "归档"
archived -> no mutation actions
```

Keep success/error messages localized and continue to `router.refresh()` after each action.

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
node --test src/server/repositories/admin-activation-work-orders.test.ts
pnpm exec eslint src/app/admin/users/page.tsx src/features/admin/admin-work-order-queue.tsx src/features/admin/admin-action-controls.tsx src/server/repositories/admin-activation-work-orders.ts
```

Expected: repository tests pass and lint is clean for the queue UI/repository integration.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/users/page.tsx src/features/admin/admin-work-order-queue.tsx src/features/admin/admin-action-controls.tsx src/server/repositories/admin-activation-work-orders.ts src/server/repositories/admin-activation-work-orders.test.ts
git commit -m "feat: add paginated admin workorder queue"
```

### Task 7: Run full verification and update change tracking

**Files:**
- Modify: `openspec/changes/admin-auth-nav-workorders/tasks.md`
- Modify: `docs/superpowers/verification/2026-05-29-admin-auth-nav-workorders-verification.md`
- Test: `src/features/admin/admin-nav.test.tsx`
- Test: `src/features/admin/admin-auth-actions.test.tsx`
- Test: `src/server/repositories/admin-activation-work-orders.test.ts`
- Test: `src/server/auth/activation-work-orders.test.ts`

- [ ] **Step 1: Run the targeted automated checks**

Run:

```bash
node --test src/features/admin/admin-nav.test.tsx
node --test src/features/admin/admin-auth-actions.test.tsx
node --test src/server/repositories/admin-activation-work-orders.test.ts
node --test src/server/auth/activation-work-orders.test.ts
pnpm run validate
```

Expected: all tests pass and TypeScript/ESLint validation completes without errors.

- [ ] **Step 2: Record verification evidence**

Write `docs/superpowers/verification/2026-05-29-admin-auth-nav-workorders-verification.md` with:

```md
# Admin Auth Nav Workorders Verification

- Date: 2026-05-29
- Commands:
  - `node --test src/features/admin/admin-nav.test.tsx`
  - `node --test src/features/admin/admin-auth-actions.test.tsx`
  - `node --test src/server/repositories/admin-activation-work-orders.test.ts`
  - `node --test src/server/auth/activation-work-orders.test.ts`
  - `pnpm run validate`
- Result: PASS / FAIL
- Notes: any manual QA observations for login/logout, route highlight, queue tabs, and archive flow
```

- [ ] **Step 3: Mark completed OpenSpec tasks**

Update `openspec/changes/admin-auth-nav-workorders/tasks.md` so each finished checklist item becomes checked:

```md
- [x] 1.1 Add explicit admin login and logout actions in the admin shell using the existing auth routes.
```

Repeat for all completed items.

- [ ] **Step 4: Commit**

```bash
git add openspec/changes/admin-auth-nav-workorders/tasks.md docs/superpowers/verification/2026-05-29-admin-auth-nav-workorders-verification.md
git commit -m "test: verify admin auth nav workorder change"
```
=======
>>>>>>> admin-auth-nav-workorders
