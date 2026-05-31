---
change: user-points-referral-checkin
design-doc: docs/superpowers/specs/2026-05-30-user-points-referral-checkin-design.md
base-ref: HEAD
---

# User Points Referral Check-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a closed user points loop with stable invite codes, delayed referral rewards, daily check-in rewards, admin point adjustments, and ledger-backed balance visibility across user and admin surfaces.

**Architecture:** Reuse `credit_ledger_entries` and `src/server/billing/credits.ts` as the single balance source, add small dedicated tables for invite/referral/check-in state, and centralize new business rules in a focused server module invoked by registration, paid-order, admin membership activation, and admin adjustment entry points. Keep route handlers thin and fail closed on auth/admin boundaries.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, Zod, Node test runner via `tsx --test`

---

## File Structure

- `src/server/db/schema.ts`: add invite-code, referral, and daily-check-in tables plus any supporting enums/indexes.
- `src/server/billing/credits.ts`: extend ledger helpers for reusable grant/adjustment operations and balance reads.
- `src/server/points/types.ts`: shared points domain types for invite summary, ledger activity, and qualification source.
- `src/server/points/service.ts`: business rules for invite creation, referral binding, qualification, check-in, and admin adjustments.
- `src/server/points/service.test.ts`: service-level coverage for reward idempotency and guardrails.
- `src/server/repositories/points.ts`: persistence helpers for invite/referral/check-in/ledger queries.
- `src/server/repositories/points.test.ts`: repository/pure-query tests when helpful.
- `src/server/auth/account-service.ts`: register/login entry for invite binding.
- `src/server/repositories/admin-mutations.ts`: authoritative order/admin mutation entry points where referral qualification and point adjustments should hang.
- `src/app/api/auth/login/route.ts`: accept invite code at registration boundary if current API contract needs it.
- `src/app/api/auth/me/route.ts`: return real ledger-backed points and user-center summary fields.
- `src/lib/auth-context.tsx`: extend user shape so the client can hold real points/invite data.
- `src/app/user-center/page.tsx`: render invite card, check-in card, and recent points activity.
- `src/app/api/user/points/checkin/route.ts`: authenticated daily check-in endpoint.
- `src/app/api/user/invite/route.ts`: authenticated invite summary endpoint if data is not fully folded into `auth/me`.
- `src/features/admin/admin-users-module.tsx`: show real point balances and expose adjustment actions.
- `src/features/admin/admin-action-controls.tsx`: add point-adjustment UI/action plumbing.
- `src/app/api/admin/users/[userId]/points/route.ts`: admin adjustment mutation endpoint.
- `src/server/repositories/users.ts`: replace fake credit aggregation with real ledger-backed balances in admin rows.

### Task 1: Lock the points-growth domain and failing service tests

**Files:**
- Create: `src/server/points/types.ts`
- Create: `src/server/points/service.ts`
- Create: `src/server/points/service.test.ts`
- Modify: `docs/superpowers/specs/2026-05-30-user-points-referral-checkin-design.md`

- [ ] **Step 1: Write failing service tests for the core invariants**

Create `src/server/points/service.test.ts` with cases covering:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseDailyCheckinReward,
  buildReferralRewardKey,
  buildDailyCheckinKey,
} from './service';

test('chooseDailyCheckinReward always returns an integer between 1 and 3', () => {
  for (let index = 0; index < 100; index += 1) {
    const reward = chooseDailyCheckinReward();
    assert.equal(Number.isInteger(reward), true);
    assert.equal(reward >= 1 && reward <= 3, true);
  }
});

test('buildReferralRewardKey keys rewards by referred user', () => {
  assert.equal(
    buildReferralRewardKey('user-123'),
    'referral-reward:referred-user:user-123',
  );
});

test('buildDailyCheckinKey keys rewards by user and business date', () => {
  assert.equal(
    buildDailyCheckinKey('user-123', '2026-05-30'),
    'daily-checkin:user-123:2026-05-30',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/points/service.test.ts
```

Expected: FAIL because `src/server/points/service.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal points domain primitives**

Create `src/server/points/types.ts` with:

```ts
export type ReferralQualificationSource = 'order_paid' | 'membership_activated';

export type InviteSummary = {
  code: string;
  inviteUrl: string;
  invitedCount: number;
  qualifiedCount: number;
  rewardedPoints: number;
};

export type RecentPointActivity = {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
};
```

Create `src/server/points/service.ts` with:

```ts
export function chooseDailyCheckinReward() {
  return Math.floor(Math.random() * 3) + 1;
}

export function buildReferralRewardKey(referredUserId: string) {
  return `referral-reward:referred-user:${referredUserId}`;
}

export function buildDailyCheckinKey(userId: string, businessDate: string) {
  return `daily-checkin:${userId}:${businessDate}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm exec tsx --test src/server/points/service.test.ts
```

Expected: PASS for reward bounds and idempotency-key helpers.

- [ ] **Step 5: Commit**

```bash
git add src/server/points/types.ts src/server/points/service.ts src/server/points/service.test.ts docs/superpowers/specs/2026-05-30-user-points-referral-checkin-design.md
git commit -m "test: define points growth service primitives"
```

### Task 2: Add schema coverage for invite codes, referrals, and daily check-ins

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/db/schema.points.test.ts`

- [ ] **Step 1: Write failing schema-shape tests**

Create `src/server/db/schema.points.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  userInviteCodes,
  userReferrals,
  userDailyCheckins,
} from './schema';

test('points-growth tables are exported from schema', () => {
  assert.equal(userInviteCodes._.name, 'user_invite_codes');
  assert.equal(userReferrals._.name, 'user_referrals');
  assert.equal(userDailyCheckins._.name, 'user_daily_checkins');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/db/schema.points.test.ts
```

Expected: FAIL because the points-growth tables are not defined yet.

- [ ] **Step 3: Add the new schema tables**

Update `src/server/db/schema.ts` to add:

```ts
export const userInviteCodes = pgTable(
  'user_invite_codes',
  {
    id,
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    status: text('status').notNull().default('active'),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('user_invite_codes_code_unique_idx').on(table.code),
    uniqueIndex('user_invite_codes_active_user_unique_idx')
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
  ],
);
```

Add `userReferrals` and `userDailyCheckins` with:
- unique `referred_user_id`
- unique `(user_id, checkin_date)`
- nullable `qualifiedAt`, `qualifiedBy`, `rewardLedgerEntryId`
- `ledgerEntryId` foreign keys back to `creditLedgerEntries.id` where useful

- [ ] **Step 4: Run the schema test to verify it passes**

Run:

```bash
pnpm exec tsx --test src/server/db/schema.points.test.ts
```

Expected: PASS with all three new tables exported.

- [ ] **Step 5: Generate migration files**

Run:

```bash
pnpm db:generate
```

Expected: a new Drizzle migration for invite-code, referral, and check-in tables appears under `drizzle/`.

- [ ] **Step 6: Commit**

```bash
git add src/server/db/schema.ts src/server/db/schema.points.test.ts drizzle
git commit -m "feat: add points growth schema"
```

### Task 3: Add ledger-backed grant and adjustment helpers

**Files:**
- Modify: `src/server/billing/credits.ts`
- Modify: `src/server/billing/credits.test.ts`

- [ ] **Step 1: Extend credit-ledger tests with grant and signed-adjustment behavior**

Add to `src/server/billing/credits.test.ts`:

```ts
test('calculateCreditBalance includes positive grant amounts', () => {
  assert.equal(calculateCreditBalance({ legacyCredits: 0, ledgerAmount: 200 }), 200);
});
```

Add a new memory-ledger helper expectation:

```ts
test('memory ledger can apply signed adjustments idempotently', async () => {
  const ledger = createMemoryCreditLedger({ 'user-1': 10 });
  const result = await ledger.adjust({
    userId: 'user-1',
    amount: 5,
    idempotencyKey: 'adjust:user-1:1',
    reason: 'manual add',
    metadata: {},
  });

  assert.equal(result.balanceAfter, 15);
  assert.equal(await ledger.getBalance('user-1'), 15);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/billing/credits.test.ts
```

Expected: FAIL because `adjust` is not implemented on the memory ledger yet.

- [ ] **Step 3: Implement reusable grant/adjustment helpers**

Update `src/server/billing/credits.ts` so the memory helper exposes:

```ts
async adjust(input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  reason: string;
  metadata: Record<string, unknown>;
})
```

Add database-backed helpers such as:
- `grantCredits(...)`
- `adjustCredits(...)`
- a shared internal insert path that writes a `grant` or `adjustment` row with `balanceAfter`

Make `adjustCredits` reject negative balance outcomes.

- [ ] **Step 4: Run the billing tests to verify they pass**

Run:

```bash
pnpm exec tsx --test src/server/billing/credits.test.ts
```

Expected: PASS including the new adjustment path.

- [ ] **Step 5: Commit**

```bash
git add src/server/billing/credits.ts src/server/billing/credits.test.ts
git commit -m "feat: add ledger grant and adjustment helpers"
```

### Task 4: Implement repository support for invite, referral, and check-in state

**Files:**
- Create: `src/server/repositories/points.ts`
- Create: `src/server/repositories/points.test.ts`

- [ ] **Step 1: Write failing repository tests for one-time referral binding and one-time daily check-in**

Create `src/server/repositories/points.test.ts` with pure helper tests for:
- mapping an invite summary from rows
- choosing no-op when a referral is already qualified
- formatting recent ledger activity

At minimum include:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeReferralStats } from './points';

test('summarizeReferralStats totals invited, qualified, and rewarded points', () => {
  assert.deepEqual(
    summarizeReferralStats([
      { qualifiedAt: '2026-05-30T00:00:00.000Z', rewardAmount: 200 },
      { qualifiedAt: null, rewardAmount: 0 },
    ]),
    { invitedCount: 2, qualifiedCount: 1, rewardedPoints: 200 },
  );
});
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/repositories/points.test.ts
```

Expected: FAIL because `src/server/repositories/points.ts` does not exist.

- [ ] **Step 3: Implement repository helpers**

Create `src/server/repositories/points.ts` with:
- `getOrCreateUserInviteCode(userId: string)`
- `bindReferralForUser(input)`
- `getReferralByReferredUserId(userId: string)`
- `markReferralQualified(input)`
- `createDailyCheckinRecord(input)`
- `getTodayDailyCheckin(userId: string, date: string)`
- `listRecentPointActivity(userId: string, limit: number)`
- `getInviteSummary(userId: string)`
- exported pure helper `summarizeReferralStats(...)`

Use the same `requireDb()` pattern as other repositories and keep SQL shape here instead of inside routes.

- [ ] **Step 4: Run the repository test to verify it passes**

Run:

```bash
pnpm exec tsx --test src/server/repositories/points.test.ts
```

Expected: PASS for referral summary behavior.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/points.ts src/server/repositories/points.test.ts
git commit -m "feat: add points repositories"
```

### Task 5: Bind invite codes during registration

**Files:**
- Modify: `src/server/auth/account-service.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/lib/auth-context.tsx`
- Create: `src/app/api/auth/login/route.test.ts`

- [ ] **Step 1: Write a failing login-route test for invite-code acceptance**

Add to `src/app/api/auth/login/route.test.ts` a case that posts:

```json
{
  "phone": "13800000000",
  "password": "secret123",
  "inviteCode": "INVITE123"
}
```

and expects the route to validate and forward `inviteCode` instead of rejecting it as an unknown or invalid field.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/api/auth/login/route.test.ts
```

Expected: FAIL because the route schema does not accept `inviteCode`.

- [ ] **Step 3: Update registration/login boundary and service**

In `src/app/api/auth/login/route.ts`:
- add optional `inviteCode: z.string().trim().min(1).max(64).optional()`

In `src/server/auth/account-service.ts`:
- extend `registerOrLoginUser(...)` input with `inviteCode?: string | null`
- only when creating a brand-new user, call the new points service to bind the referral
- keep existing login behavior unchanged for existing users

Extend `src/lib/auth-context.tsx` user types if the client login state needs to persist invite-derived point summaries after refresh.

- [ ] **Step 4: Run the route test to verify it passes**

Run:

```bash
pnpm exec tsx --test src/app/api/auth/login/route.test.ts
```

Expected: PASS for invite-code payload acceptance.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/account-service.ts src/app/api/auth/login/route.ts src/app/api/auth/login/route.test.ts src/lib/auth-context.tsx
git commit -m "feat: bind referrals during registration"
```

### Task 6: Qualify referral rewards from paid orders and membership activation

**Files:**
- Modify: `src/server/repositories/admin-mutations.ts`
- Modify: `src/server/auth/account-service.ts`
- Create: `src/server/repositories/admin-mutations.points.test.ts`

- [ ] **Step 1: Write failing tests for single qualification across both conversion paths**

Create `src/server/repositories/admin-mutations.points.test.ts` with cases that assert:
- qualifying from paid order grants `+200`
- a later membership-activation attempt for the same referred user becomes a no-op
- the reverse order also becomes a no-op after the first success

At minimum include a pure or mocked test around a helper such as:

```ts
test('qualifyReferralReward ignores repeated qualification after first success', async () => {
  // arrange first qualification already recorded
  // act with a second source
  // assert no second grant is requested
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/repositories/admin-mutations.points.test.ts
```

Expected: FAIL because no referral-qualification helper exists yet.

- [ ] **Step 3: Implement the authoritative qualification hooks**

Update `src/server/repositories/admin-mutations.ts`:
- locate `updateOrderStatus(...)`
- on transition into `paid`, call the points service qualification method with source `order_paid`

Update `src/server/auth/account-service.ts`:
- keep `activateAccountByAdmin(...)` for account lifecycle
- if this is currently also the only practical operator path to "activate into membership", explicitly document and call the points qualification method here
- otherwise, move the hook to the actual entitlement-grant entry point once identified during implementation

The qualification service must:
- load referral by referred user id
- no-op if already qualified
- grant `+200` via ledger with key `referral-reward:referred-user:<userId>`

- [ ] **Step 4: Run the qualification tests to verify they pass**

Run:

```bash
pnpm exec tsx --test src/server/repositories/admin-mutations.points.test.ts
```

Expected: PASS for single-grant behavior across both conversion paths.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/admin-mutations.ts src/server/auth/account-service.ts src/server/repositories/admin-mutations.points.test.ts
git commit -m "feat: qualify referral rewards from conversion events"
```

### Task 7: Add authenticated user points APIs and payloads

**Files:**
- Modify: `src/app/api/auth/me/route.ts`
- Create: `src/app/api/user/invite/route.ts`
- Create: `src/app/api/user/points/checkin/route.ts`
- Create: `src/app/api/user/points/checkin/route.test.ts`

- [ ] **Step 1: Write a failing daily-checkin route test**

Create `src/app/api/user/points/checkin/route.test.ts` with cases for:
- first check-in returns `ok: true` and `reward` in `1..3`
- second same-day check-in returns a stable already-checked-in response

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/api/user/points/checkin/route.test.ts
```

Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement user-facing points endpoints**

In `src/app/api/auth/me/route.ts`:
- replace hard-coded `points: 0`
- read current balance from the ledger helper
- optionally include invite/check-in summary fields if that keeps client hydration simpler

Create `src/app/api/user/invite/route.ts`:
- require an authenticated session
- return `InviteSummary` plus recent referral stats

Create `src/app/api/user/points/checkin/route.ts`:
- require an authenticated session
- call the points service
- return `reward`, `balanceAfter`, and `alreadyCheckedIn` state

- [ ] **Step 4: Run the route test to verify it passes**

Run:

```bash
pnpm exec tsx --test src/app/api/user/points/checkin/route.test.ts
```

Expected: PASS for first and repeated same-day check-ins.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/me/route.ts src/app/api/user/invite/route.ts src/app/api/user/points/checkin/route.ts src/app/api/user/points/checkin/route.test.ts
git commit -m "feat: add user points APIs"
```

### Task 8: Update the user center to expose invite sharing and daily check-in

**Files:**
- Modify: `src/app/user-center/page.tsx`
- Modify: `src/lib/auth-context.tsx`
- Create: `src/features/account/user-points-panel.tsx`

- [ ] **Step 1: Write a failing component test or extracted pure helper test for user-center points state**

If the repo already avoids heavy component testing here, extract a pure helper in `src/features/account/user-points-panel.tsx`:

```ts
export function getCheckinButtonLabel(input: { alreadyCheckedIn: boolean; pending: boolean }) {
  if (input.pending) return '签到中...';
  return input.alreadyCheckedIn ? '今日已签到' : '立即签到';
}
```

Add a small `node:test` file asserting those labels.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/features/account/user-points-panel.test.tsx
```

Expected: FAIL because the new panel/helper does not exist yet.

- [ ] **Step 3: Implement the user-center UI slice**

Create `src/features/account/user-points-panel.tsx` and move the new points UI there:
- invite code display
- copy registration link button
- invited/qualified/rewarded summary
- daily check-in button
- recent point activity list

Update `src/app/user-center/page.tsx` to render the panel and continue using the existing layout language instead of redesigning the whole page.

- [ ] **Step 4: Run the panel test to verify it passes**

Run:

```bash
pnpm exec tsx --test src/features/account/user-points-panel.test.tsx
```

Expected: PASS for check-in label state logic.

- [ ] **Step 5: Commit**

```bash
git add src/app/user-center/page.tsx src/lib/auth-context.tsx src/features/account/user-points-panel.tsx src/features/account/user-points-panel.test.tsx
git commit -m "feat: add user center points panel"
```

### Task 9: Add admin point-adjustment flows and real balances

**Files:**
- Modify: `src/server/repositories/users.ts`
- Modify: `src/features/admin/admin-users-module.tsx`
- Modify: `src/features/admin/admin-action-controls.tsx`
- Create: `src/app/api/admin/users/[userId]/points/route.ts`
- Create: `src/app/api/admin/users/[userId]/points/route.test.ts`

- [ ] **Step 1: Write a failing admin points-route test**

Create `src/app/api/admin/users/[userId]/points/route.test.ts` that posts:

```json
{
  "amount": -50,
  "reason": "duplicate bonus rollback",
  "note": "support ticket #123"
}
```

and expects:
- admin auth is required
- validation rejects zero amounts
- insufficient balance returns an error for overly negative values

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/users/[userId]/points/route.test.ts
```

Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement admin real-balance reads and adjustment mutation**

Update `src/server/repositories/users.ts`:
- stop using `sum(userEntitlements.remainingQuantity)` as the admin points column
- load ledger-backed point balances instead

Create `src/app/api/admin/users/[userId]/points/route.ts`:
- require admin session
- validate signed integer amount, non-empty reason, optional note
- call the points service adjustment method

Update `src/features/admin/admin-action-controls.tsx`:
- add a point-adjustment dialog or compact form trigger

Update `src/features/admin/admin-users-module.tsx`:
- show the new real point balance and recent activity summary

- [ ] **Step 4: Run the admin route test to verify it passes**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/users/[userId]/points/route.test.ts
```

Expected: PASS for auth, validation, and negative-balance rejection behavior.

- [ ] **Step 5: Run focused lint for admin UI files**

Run:

```bash
pnpm exec eslint src/features/admin/admin-users-module.tsx src/features/admin/admin-action-controls.tsx src/app/api/admin/users/[userId]/points/route.ts
```

Expected: no lint errors in the new admin points flow.

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/users.ts src/features/admin/admin-users-module.tsx src/features/admin/admin-action-controls.tsx src/app/api/admin/users/[userId]/points/route.ts src/app/api/admin/users/[userId]/points/route.test.ts
git commit -m "feat: add admin point adjustments"
```

### Task 10: Full verification and Comet state handoff

**Files:**
- Modify: `openspec/changes/user-points-referral-checkin/tasks.md`
- Create: `docs/superpowers/verification/2026-05-30-user-points-referral-checkin.md`
- Modify: `openspec/changes/user-points-referral-checkin/.comet.yaml`

- [ ] **Step 1: Mark completed OpenSpec tasks**

Update `openspec/changes/user-points-referral-checkin/tasks.md` so completed checklist items match the implemented tasks and no unchecked finished work remains.

- [ ] **Step 2: Run validation and build**

Run:

```bash
pnpm validate
pnpm build
```

Expected: both commands exit `0`. If `DATABASE_URL` blocks DB-dependent checks, record the exact failure in the verification note.

- [ ] **Step 3: Run database verification**

Run:

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: migration generation succeeds; if migration execution is blocked by environment, record the exact blocker.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/points/service.test.ts
pnpm exec tsx --test src/server/billing/credits.test.ts
pnpm exec tsx --test src/server/repositories/points.test.ts
pnpm exec tsx --test src/app/api/user/points/checkin/route.test.ts
pnpm exec tsx --test src/app/api/admin/users/[userId]/points/route.test.ts
```

Expected: PASS for all new points-related coverage.

- [ ] **Step 5: Perform browser verification**

Run the local app and verify:
- user center invite card renders a stable code and link
- daily check-in grants `1-3` exactly once per day
- admin users page shows real points
- admin adjustment updates balance and refuses overly negative subtraction

Save results in `docs/superpowers/verification/2026-05-30-user-points-referral-checkin.md`.

- [ ] **Step 6: Advance Comet state**

Run:

```bash
bash ./.codex/skills/comet/scripts/comet-state.sh set user-points-referral-checkin plan docs/superpowers/plans/2026-05-30-user-points-referral-checkin.md
```

Expected: `.comet.yaml` records the implementation-plan path for build execution.

- [ ] **Step 7: Commit**

```bash
git add openspec/changes/user-points-referral-checkin/tasks.md docs/superpowers/verification/2026-05-30-user-points-referral-checkin.md openspec/changes/user-points-referral-checkin/.comet.yaml
git commit -m "docs: record points growth verification"
```
