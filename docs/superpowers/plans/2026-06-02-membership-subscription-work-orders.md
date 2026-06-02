# Membership Subscription Work Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manual payment review loop where users submit membership subscription work orders, admins approve or reject them, and approval atomically marks the order paid and grants or extends membership entitlement.

**Architecture:** Orders remain the payment obligation, `subscription_work_orders` owns manual review state, and `user_entitlements` remains the membership source of truth. User and admin API routes validate transport input, then call focused domain/repository modules that own state transitions and audit writes. Public membership/user-center UI renders derived status only; it never writes membership state locally.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM/PostgreSQL, zod, shadcn/Radix UI primitives, Node test runner via `tsx --test`, `pnpm validate`, `pnpm build`.

---

## File Structure

- Modify `src/server/db/schema.ts`: add subscription work-order enums/table and relations to users/orders/plans/admin users.
- Generate `drizzle/*`: generated migration for the new table/enums.
- Create `src/server/auth/subscription-work-orders.ts`: domain transitions, order creation, approval/rejection/archive, entitlement expiry calculation.
- Create `src/server/auth/subscription-work-orders.test.ts`: domain-level tests for transition rules, expiry calculation, duplicate handling, and idempotency.
- Create `src/server/repositories/subscription-work-orders.ts`: user-facing query/create helpers and admin queue shaping.
- Create `src/server/repositories/subscription-work-orders.test.ts`: repository/query-shaping tests with mocked or harnessed database where local patterns allow.
- Modify `src/server/repositories/admin-mutations.ts`: reuse existing referral qualification from membership approval when needed, or keep approval isolated if `subscription-work-orders.ts` imports `qualifyReferralReward` directly.
- Create `src/app/api/membership/subscription-work-orders/route.ts`: authenticated user create route.
- Create `src/app/api/membership/subscription-work-orders/current/route.ts`: authenticated user current-status route.
- Create `src/app/api/admin/subscription-work-orders/route.ts`: admin queue list route if client fetching is used; otherwise server page can call repository directly.
- Create `src/app/api/admin/subscription-work-orders/[workOrderId]/processing/route.ts`: admin start-processing mutation.
- Create `src/app/api/admin/subscription-work-orders/[workOrderId]/approve/route.ts`: admin approve mutation.
- Create `src/app/api/admin/subscription-work-orders/[workOrderId]/reject/route.ts`: admin reject mutation.
- Create `src/app/api/admin/subscription-work-orders/[workOrderId]/archive/route.ts`: admin archive mutation.
- Modify `src/features/admin/admin-action-controls.tsx`: add `AdminSubscriptionWorkOrderActions`.
- Create `src/server/repositories/admin-subscription-work-orders.ts`: admin queue rows/metrics/filters if separated from user repository.
- Modify `src/app/admin/(console)/memberships/page.tsx`: add a subscription work-order queue below the plan table or as a second section using existing `AdminModulePage` patterns.
- Modify `src/app/membership/page.tsx`: replace local membership mutation with subscription work-order modal/form and current-status display.
- Modify `src/app/user-center/page.tsx`: show current membership application status in overview.
- Modify `src/lib/user-api-client.ts` only if existing helper response typing needs a small extension; otherwise leave unchanged.
- Create `docs/superpowers/verification/2026-06-02-membership-subscription-work-orders-verification.md`: final verification record.

## Boundary Graph

User UI `/membership` -> `POST /api/membership/subscription-work-orders` -> `createSubscriptionWorkOrder` -> repository transaction -> `orders` + `subscription_work_orders`.

Admin UI `/admin/memberships` -> admin mutation route -> `start/approve/reject/archiveSubscriptionWorkOrder` -> repository transaction -> `subscription_work_orders` + `orders` + `order_events` + `user_entitlements` + audit.

User center `/user-center` -> `GET /api/membership/subscription-work-orders/current` -> query helper -> derived status response.

## State Invariants

1. `user_entitlements` is the only durable membership authority.
2. A `pending` or `processing` subscription work order blocks another active work order for the same user and plan.
3. Approval is atomic and idempotent: no repeat request can extend entitlement twice.

---

### Task 1: Schema And Migration

**Files:**
- Modify: `src/server/db/schema.ts`
- Generated: `drizzle/*.sql`
- Generated: `drizzle/meta/*.json`

- [ ] **Step 1: Add schema enums and table**

In `src/server/db/schema.ts`, add enums near the existing work-order enums:

```ts
export const subscriptionWorkOrderStatus = pgEnum('subscription_work_order_status', [
  'pending',
  'processing',
  'closed',
  'archived',
]);

export const subscriptionWorkOrderResult = pgEnum('subscription_work_order_result', [
  'approved',
  'rejected',
]);
```

Add the table after `passwordResetWorkOrders`:

```ts
export const subscriptionWorkOrders = pgTable(
  'subscription_work_orders',
  {
    id,
    code: text('code').notNull(),
    status: subscriptionWorkOrderStatus('status').notNull().default('pending'),
    result: subscriptionWorkOrderResult('result'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => membershipPlans.id, { onDelete: 'restrict' }),
    submittedPaymentMethod: text('submitted_payment_method').notNull(),
    submittedAmountCents: integer('submitted_amount_cents').notNull(),
    submittedPaidAt: timestamp('submitted_paid_at', { withTimezone: true }).notNull(),
    submittedReference: text('submitted_reference').notNull(),
    submittedNote: text('submitted_note'),
    processorAdminId: uuid('processor_admin_id').references(() => adminUsers.id, {
      onDelete: 'set null',
    }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('subscription_work_orders_code_unique_idx').on(table.code),
    index('subscription_work_orders_user_id_idx').on(table.userId),
    index('subscription_work_orders_order_id_idx').on(table.orderId),
    index('subscription_work_orders_plan_id_idx').on(table.planId),
    index('subscription_work_orders_status_idx').on(table.status),
    check('subscription_work_orders_amount_non_negative', sql`${table.submittedAmountCents} >= 0`),
  ],
);
```

If TypeScript reports `orders`, `membershipPlans`, or `adminUsers` are referenced before declaration, move this table below `orders` and keep enum declarations near the other enums.

- [ ] **Step 2: Generate migration**

Run:

```bash
pnpm db:generate
```

Expected: a new Drizzle migration is generated under `drizzle/`, with new enum creation and `subscription_work_orders` table creation. Do not hand-edit generated metadata.

- [ ] **Step 3: Verify schema compiles**

Run:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: PASS or only unrelated pre-existing errors. If the schema table had to move because of declaration order, rerun after moving it.

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts drizzle
git commit -m "feat: add subscription work order schema"
```

---

### Task 2: Domain Types And Pure Transition Tests

**Files:**
- Create: `src/server/auth/subscription-work-orders.ts`
- Create: `src/server/auth/subscription-work-orders.test.ts`

- [ ] **Step 1: Write failing tests for transition and expiry helpers**

Create `src/server/auth/subscription-work-orders.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addMembershipPeriod,
  assertSubscriptionWorkOrderTransition,
  getEntitlementWindow,
  type SubscriptionWorkOrderStatus,
} from './subscription-work-orders';

test('subscription work order transitions follow queue lifecycle', () => {
  assert.doesNotThrow(() => assertSubscriptionWorkOrderTransition('pending', 'processing'));
  assert.doesNotThrow(() => assertSubscriptionWorkOrderTransition('processing', 'closed'));
  assert.doesNotThrow(() => assertSubscriptionWorkOrderTransition('closed', 'archived'));

  assert.throws(
    () => assertSubscriptionWorkOrderTransition('pending', 'closed'),
    /Invalid subscription work order transition/,
  );
  assert.throws(
    () => assertSubscriptionWorkOrderTransition('closed', 'processing'),
    /Invalid subscription work order transition/,
  );
});

test('membership period helper adds calendar months and years', () => {
  assert.equal(addMembershipPeriod(new Date('2026-01-15T00:00:00.000Z'), 'month').toISOString(), '2026-02-15T00:00:00.000Z');
  assert.equal(addMembershipPeriod(new Date('2026-01-15T00:00:00.000Z'), 'year').toISOString(), '2027-01-15T00:00:00.000Z');
});

test('entitlement window extends from active expiry', () => {
  const approvalTime = new Date('2026-06-02T00:00:00.000Z');
  const currentExpiry = new Date('2026-06-12T00:00:00.000Z');
  const window = getEntitlementWindow({
    approvalTime,
    billingPeriod: 'month',
    currentExpiresAt: currentExpiry,
  });

  assert.equal(window.startsAt.toISOString(), approvalTime.toISOString());
  assert.equal(window.expiresAt.toISOString(), '2026-07-12T00:00:00.000Z');
});

test('entitlement window starts from approval when no active expiry exists', () => {
  const approvalTime = new Date('2026-06-02T00:00:00.000Z');
  const expired = new Date('2026-05-01T00:00:00.000Z');
  const window = getEntitlementWindow({
    approvalTime,
    billingPeriod: 'year',
    currentExpiresAt: expired,
  });

  assert.equal(window.startsAt.toISOString(), approvalTime.toISOString());
  assert.equal(window.expiresAt.toISOString(), '2027-06-02T00:00:00.000Z');
});

test('unsupported one-time membership period is rejected', () => {
  assert.throws(
    () => addMembershipPeriod(new Date('2026-06-02T00:00:00.000Z'), 'one_time'),
    /Unsupported membership billing period/,
  );
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts
```

Expected: FAIL because `subscription-work-orders.ts` does not exist.

- [ ] **Step 3: Implement pure helpers**

Create `src/server/auth/subscription-work-orders.ts`:

```ts
import { AccountDomainError } from './account-types';

export type SubscriptionWorkOrderStatus = 'pending' | 'processing' | 'closed' | 'archived';
export type SubscriptionWorkOrderResult = 'approved' | 'rejected';
export type MembershipBillingPeriod = 'month' | 'year' | 'one_time';

export function assertSubscriptionWorkOrderTransition(
  currentStatus: SubscriptionWorkOrderStatus,
  nextStatus: SubscriptionWorkOrderStatus,
) {
  const allowed: Record<SubscriptionWorkOrderStatus, SubscriptionWorkOrderStatus[]> = {
    pending: ['processing'],
    processing: ['closed'],
    closed: ['archived'],
    archived: [],
  };

  if (!allowed[currentStatus].includes(nextStatus)) {
    throw new AccountDomainError(
      'invalid_subscription_work_order_transition',
      `Invalid subscription work order transition: ${currentStatus} -> ${nextStatus}.`,
      409,
    );
  }
}

export function addMembershipPeriod(base: Date, billingPeriod: MembershipBillingPeriod) {
  const next = new Date(base);
  if (billingPeriod === 'month') {
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }
  if (billingPeriod === 'year') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next;
  }

  throw new AccountDomainError(
    'unsupported_membership_billing_period',
    `Unsupported membership billing period: ${billingPeriod}.`,
    400,
  );
}

export function getEntitlementWindow(input: {
  approvalTime: Date;
  billingPeriod: MembershipBillingPeriod;
  currentExpiresAt?: Date | null;
}) {
  const base =
    input.currentExpiresAt && input.currentExpiresAt.getTime() > input.approvalTime.getTime()
      ? input.currentExpiresAt
      : input.approvalTime;

  return {
    startsAt: input.approvalTime,
    expiresAt: addMembershipPeriod(base, input.billingPeriod),
  };
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/subscription-work-orders.ts src/server/auth/subscription-work-orders.test.ts
git commit -m "test: cover subscription work order transitions"
```

---

### Task 3: Repository And Domain Mutations

**Files:**
- Modify: `src/server/auth/subscription-work-orders.ts`
- Create: `src/server/repositories/subscription-work-orders.ts`
- Create: `src/server/repositories/subscription-work-orders.test.ts`

- [ ] **Step 1: Write focused tests for duplicate active work order and approval idempotency**

Create `src/server/repositories/subscription-work-orders.test.ts` with dependency-injected harness tests for the behavior that must not depend on a live database:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseActiveSubscriptionWorkOrder,
  shouldTreatApprovalAsIdempotent,
} from './subscription-work-orders';

test('chooseActiveSubscriptionWorkOrder returns pending or processing work order for same user and plan', () => {
  const rows = [
    { id: 'closed-1', userId: 'user-1', planId: 'plan-1', status: 'closed' as const, createdAt: new Date('2026-06-01T00:00:00.000Z') },
    { id: 'pending-1', userId: 'user-1', planId: 'plan-1', status: 'pending' as const, createdAt: new Date('2026-06-02T00:00:00.000Z') },
  ];

  assert.equal(chooseActiveSubscriptionWorkOrder(rows, 'user-1', 'plan-1')?.id, 'pending-1');
  assert.equal(chooseActiveSubscriptionWorkOrder(rows, 'user-2', 'plan-1'), null);
});

test('approval idempotency recognizes already approved closed work order', () => {
  assert.equal(shouldTreatApprovalAsIdempotent({ status: 'closed', result: 'approved' }), true);
  assert.equal(shouldTreatApprovalAsIdempotent({ status: 'closed', result: 'rejected' }), false);
  assert.equal(shouldTreatApprovalAsIdempotent({ status: 'processing', result: null }), false);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm exec tsx --test src/server/repositories/subscription-work-orders.test.ts
```

Expected: FAIL because repository helper file does not exist.

- [ ] **Step 3: Implement repository helpers and database-backed functions**

Create `src/server/repositories/subscription-work-orders.ts` with:

```ts
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { AccountDomainError } from '@/server/auth/account-types';
import {
  type SubscriptionWorkOrderResult,
  type SubscriptionWorkOrderStatus,
} from '@/server/auth/subscription-work-orders';
import { db, schema } from '@/server/db';

export type SubscriptionWorkOrderLite = {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionWorkOrderStatus;
  createdAt: Date;
};

export function chooseActiveSubscriptionWorkOrder<T extends SubscriptionWorkOrderLite>(
  rows: T[],
  userId: string,
  planId: string,
) {
  return rows
    .filter((row) => row.userId === userId && row.planId === planId)
    .filter((row) => row.status === 'pending' || row.status === 'processing')
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

export function shouldTreatApprovalAsIdempotent(input: {
  status: SubscriptionWorkOrderStatus;
  result: SubscriptionWorkOrderResult | null;
}) {
  return input.status === 'closed' && input.result === 'approved';
}

export function requireSubscriptionDb() {
  if (!db) {
    throw new AccountDomainError('database_unavailable', 'Database connection is unavailable.', 503);
  }
  return db;
}

export async function getActiveSubscriptionWorkOrder(input: {
  userId: string;
  planId: string;
}) {
  const database = requireSubscriptionDb();
  const [row] = await database
    .select()
    .from(schema.subscriptionWorkOrders)
    .where(
      and(
        eq(schema.subscriptionWorkOrders.userId, input.userId),
        eq(schema.subscriptionWorkOrders.planId, input.planId),
        inArray(schema.subscriptionWorkOrders.status, ['pending', 'processing']),
      ),
    )
    .orderBy(desc(schema.subscriptionWorkOrders.createdAt))
    .limit(1);

  return row ?? null;
}
```

Then add database-backed functions needed by domain code:

```ts
export async function getMembershipPlanForSubscription(planIdOrCode: string) {
  const database = requireSubscriptionDb();
  const [plan] = await database
    .select()
    .from(schema.membershipPlans)
    .where(
      sql`${schema.membershipPlans.id}::text = ${planIdOrCode} or ${schema.membershipPlans.code} = ${planIdOrCode}`,
    )
    .limit(1);

  return plan ?? null;
}
```

During implementation, prefer a direct `eq(schema.membershipPlans.code, code)` lookup if the UI submits plan code. Keep the route contract consistent with that decision.

- [ ] **Step 4: Extend domain module with create/start/approve/reject/archive functions**

In `src/server/auth/subscription-work-orders.ts`, import `db`, `schema`, `recordAuditEvent`, `qualifyReferralReward`, and repository helpers. Add functions:

```ts
export async function createSubscriptionWorkOrder(input: {
  userId: string;
  planCode: string;
  submittedPaymentMethod: string;
  submittedAmountCents: number;
  submittedPaidAt: Date;
  submittedReference: string;
  submittedNote?: string | null;
}) {
  // Implementation must:
  // 1. Load active membership plan by code.
  // 2. Reject inactive, free, or one_time plans.
  // 3. Return existing active work order for same user and plan.
  // 4. Insert pending order with locked price.
  // 5. Insert pending subscription work order linked to that order.
  // 6. Insert order event type 'created'.
  // 7. Return work order + order + plan summary.
}

export async function startSubscriptionWorkOrderProcessing(input: {
  workOrderId: string;
  actorId: string;
}) {
  // pending -> processing, set processorAdminId and processedAt.
}

export async function approveSubscriptionWorkOrder(input: {
  workOrderId: string;
  actorId: string;
  decisionNote?: string | null;
}) {
  // If already closed/approved, return current state without extending again.
  // Otherwise require processing and run one transaction:
  // order paid, order event, entitlement create/extend, work order closed/approved, referral qualification, audit.
}

export async function rejectSubscriptionWorkOrder(input: {
  workOrderId: string;
  actorId: string;
  decisionNote?: string | null;
}) {
  // processing -> closed/rejected, cancel pending order, order event, audit.
}

export async function archiveSubscriptionWorkOrder(input: {
  workOrderId: string;
  actorId: string;
}) {
  // closed -> archived, audit.
}
```

The exact code should follow the existing `activation-work-orders.ts` transition style and `admin-mutations.ts` order event/audit style. Use a single database transaction for approve/reject if Drizzle transaction is available in the current `db` client; otherwise keep writes ordered and guarded by status predicates and document residual partial-failure risk in verification.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts src/server/repositories/subscription-work-orders.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/auth/subscription-work-orders.ts src/server/repositories/subscription-work-orders.ts src/server/repositories/subscription-work-orders.test.ts
git commit -m "feat: add subscription work order domain"
```

---

### Task 4: User API Routes

**Files:**
- Create: `src/app/api/membership/subscription-work-orders/route.ts`
- Create: `src/app/api/membership/subscription-work-orders/current/route.ts`
- Modify: `src/server/repositories/subscription-work-orders.ts`

- [ ] **Step 1: Add current summary query**

In `src/server/repositories/subscription-work-orders.ts`, add a `getCurrentSubscriptionWorkOrderSummary(userId: string)` function that joins `subscription_work_orders`, `orders`, and `membership_plans`, ordered by newest created date, returning:

```ts
export type UserSubscriptionWorkOrderSummary = {
  id: string;
  code: string;
  status: SubscriptionWorkOrderStatus;
  result: SubscriptionWorkOrderResult | null;
  planName: string;
  planCode: string;
  orderNumber: string;
  orderStatus: string;
  orderTotalCents: number;
  submittedAmountCents: number;
  submittedPaymentMethod: string;
  submittedPaidAt: string;
  submittedReference: string;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Create user POST route**

Create `src/app/api/membership/subscription-work-orders/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { createSubscriptionWorkOrder } from '@/server/auth/subscription-work-orders';
import { requireUserSession } from '@/server/auth/guards';

const bodySchema = z.object({
  planCode: z.enum(['pro-monthly', 'team-yearly', 'monthly', 'yearly']),
  paymentMethod: z.string().trim().min(1).max(80),
  amountCents: z.number().int().min(0).max(10_000_000),
  paidAt: z.iso.datetime(),
  reference: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await requireUserSession();
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'POST /api/membership/subscription-work-orders',
        actorType: 'user',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const result = await createSubscriptionWorkOrder({
          userId: session.user.id,
          planCode: body.planCode,
          submittedPaymentMethod: body.paymentMethod,
          submittedAmountCents: body.amountCents,
          submittedPaidAt: new Date(body.paidAt),
          submittedReference: body.reference,
          submittedNote: body.note ?? null,
        });

        return NextResponse.json({ ok: true, subscriptionWorkOrder: result });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Subscription work order request is invalid.',
            issues: error.issues,
          },
        },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
```

If `requireUserSession` does not exist, use the existing user auth guard used by `/api/user/*` routes. Do not invent a second auth check.

- [ ] **Step 3: Create current GET route**

Create `src/app/api/membership/subscription-work-orders/current/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireUserSession } from '@/server/auth/guards';
import { getCurrentSubscriptionWorkOrderSummary } from '@/server/repositories/subscription-work-orders';

export async function GET() {
  try {
    const session = await requireUserSession();
    const subscriptionWorkOrder = await getCurrentSubscriptionWorkOrderSummary(session.user.id);

    return NextResponse.json({
      ok: true,
      subscriptionWorkOrder,
    });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
```

- [ ] **Step 4: Run route type check**

Run:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: PASS. If the plan-code enum does not match seeded DB codes, inspect `src/server/db/seed.ts` and update the accepted codes and UI mapping consistently.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/membership/subscription-work-orders src/server/repositories/subscription-work-orders.ts
git commit -m "feat: add membership subscription user APIs"
```

---

### Task 5: Admin Queue APIs And Actions

**Files:**
- Create: `src/server/repositories/admin-subscription-work-orders.ts`
- Create: `src/app/api/admin/subscription-work-orders/route.ts`
- Create: `src/app/api/admin/subscription-work-orders/[workOrderId]/processing/route.ts`
- Create: `src/app/api/admin/subscription-work-orders/[workOrderId]/approve/route.ts`
- Create: `src/app/api/admin/subscription-work-orders/[workOrderId]/reject/route.ts`
- Create: `src/app/api/admin/subscription-work-orders/[workOrderId]/archive/route.ts`
- Modify: `src/features/admin/admin-action-controls.tsx`

- [ ] **Step 1: Add admin queue repository**

Create `src/server/repositories/admin-subscription-work-orders.ts` using `admin-activation-work-orders.ts` as the structural reference. Export:

```ts
export type AdminSubscriptionWorkOrderQueueStatus = 'pending' | 'processing' | 'closed' | 'archived';

export type AdminSubscriptionWorkOrderRow = {
  id: string;
  code: string;
  queueStatus: AdminSubscriptionWorkOrderQueueStatus;
  result: 'approved' | 'rejected' | null;
  user: string;
  plan: string;
  orderNumber: string;
  orderStatus: string;
  orderTotal: string;
  submittedAmount: string;
  amountMismatch: boolean;
  paymentMethod: string;
  submittedPaidAt: string;
  reference: string;
  note: string;
  decisionNote: string;
  updatedAt: string;
};

export async function getAdminSubscriptionWorkOrders(status?: AdminSubscriptionWorkOrderQueueStatus) {
  // Return AdminModuleData<AdminSubscriptionWorkOrderRow>.
}
```

Metrics should include active queue count, pending count, processing count, and closed count. Use `formatCurrency` and `formatIso` from `admin-shared.ts`.

- [ ] **Step 2: Add admin action component**

In `src/features/admin/admin-action-controls.tsx`, add:

```tsx
export function AdminSubscriptionWorkOrderActions({
  workOrderId,
  queueStatus,
}: {
  workOrderId: string;
  queueStatus: 'pending' | 'processing' | 'closed' | 'archived';
}) {
  const actions =
    queueStatus === 'pending'
      ? [
          {
            label: '开始核销',
            url: `/api/admin/subscription-work-orders/${workOrderId}/processing`,
            body: {},
            successMessage: '会员订阅工单已进入处理中。',
          },
        ]
      : queueStatus === 'processing'
        ? [
            {
              label: '通过并开通',
              url: `/api/admin/subscription-work-orders/${workOrderId}/approve`,
              body: { decisionNote: '付款信息核销通过。' },
              successMessage: '会员订阅工单已通过，会员权益已开通或顺延。',
            },
            {
              label: '拒绝并取消订单',
              url: `/api/admin/subscription-work-orders/${workOrderId}/reject`,
              body: { decisionNote: '付款信息未通过核销。' },
              successMessage: '会员订阅工单已拒绝，订单已取消。',
              variant: 'destructive' as const,
            },
          ]
        : queueStatus === 'closed'
          ? [
              {
                label: '归档',
                url: `/api/admin/subscription-work-orders/${workOrderId}/archive`,
                body: {},
                successMessage: '会员订阅工单已归档。',
              },
            ]
          : [];

  return actions.length > 0 ? <ActionButtons actions={actions} /> : null;
}
```

- [ ] **Step 3: Add admin mutation routes**

Each route should mirror existing activation/password-reset admin routes:

```ts
const paramsSchema = z.object({ workOrderId: z.uuid() });
```

For `processing`, call `startSubscriptionWorkOrderProcessing`.

For `approve`, validate:

```ts
const bodySchema = z.object({
  decisionNote: z.string().trim().max(1000).optional(),
});
```

Then call `approveSubscriptionWorkOrder`.

For `reject`, use the same body schema and call `rejectSubscriptionWorkOrder`.

For `archive`, call `archiveSubscriptionWorkOrder`.

All admin mutation routes must use:

- `requireAdmin()`
- `readJsonBody(request)`
- `runProtectedMutation({ routeKind: 'admin-mutation', actorType: 'admin', ... })`
- `accountErrorToResponse(error)`

- [ ] **Step 4: Add optional admin list route**

If the admin page fetches on the server, skip this route. If client actions need a list API, create `src/app/api/admin/subscription-work-orders/route.ts`:

```ts
export async function GET(request: Request) {
  const session = await requireAdmin();
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const data = await getAdminSubscriptionWorkOrders(
    status === 'pending' || status === 'processing' || status === 'closed' || status === 'archived'
      ? status
      : undefined,
  );
  return NextResponse.json({ ok: true, data, actorId: session.user.id });
}
```

- [ ] **Step 5: Run type check**

Run:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/admin-subscription-work-orders.ts src/app/api/admin/subscription-work-orders src/features/admin/admin-action-controls.tsx
git commit -m "feat: add admin subscription work order APIs"
```

---

### Task 6: Admin Membership Queue UI

**Files:**
- Modify: `src/app/admin/(console)/memberships/page.tsx`
- Modify: `src/features/admin/module-page.tsx` only if it needs a reusable second-table wrapper; keep changes minimal.

- [ ] **Step 1: Add queue data to memberships page**

In `src/app/admin/(console)/memberships/page.tsx`, import:

```ts
import { AdminSubscriptionWorkOrderActions } from '@/features/admin/admin-action-controls';
import {
  getAdminSubscriptionWorkOrders,
  type AdminSubscriptionWorkOrderRow,
} from '@/server/repositories/admin-subscription-work-orders';
```

Add columns:

```tsx
const subscriptionWorkOrderColumns: AdminColumn<AdminSubscriptionWorkOrderRow>[] = [
  {
    key: 'workOrder',
    label: '工单 / 订单',
    render: (record) => (
      <div>
        <div className="font-medium text-neutral-950">{record.code}</div>
        <div className="text-xs text-neutral-500">{record.orderNumber}</div>
      </div>
    ),
  },
  {
    key: 'status',
    label: '状态',
    render: (record) => <StatusBadge value={record.result ?? record.queueStatus} />,
  },
  {
    key: 'userPlan',
    label: '用户 / 方案',
    render: (record) => (
      <div>
        <div className="text-sm text-neutral-900">{record.user}</div>
        <div className="text-xs text-neutral-500">{record.plan}</div>
      </div>
    ),
  },
  {
    key: 'payment',
    label: '付款信息',
    render: (record) => (
      <div>
        <div className={record.amountMismatch ? 'font-medium text-red-700' : 'font-medium text-neutral-950'}>
          {record.submittedAmount} / 应收 {record.orderTotal}
        </div>
        <div className="text-xs text-neutral-500">{record.paymentMethod} · {record.reference}</div>
      </div>
    ),
  },
  {
    key: 'note',
    label: '备注',
    render: (record) => (
      <div className="max-w-xs text-xs text-neutral-600">
        {record.note}
        {record.decisionNote !== '未填写' ? <div className="mt-1 text-neutral-500">{record.decisionNote}</div> : null}
      </div>
    ),
  },
  {
    key: 'actions',
    label: '操作',
    className: 'text-right',
    render: (record) => (
      <AdminSubscriptionWorkOrderActions
        workOrderId={record.id}
        queueStatus={record.queueStatus}
      />
    ),
  },
];
```

- [ ] **Step 2: Render a second queue**

In `AdminMembershipsPage`, fetch both:

```ts
const [plans, subscriptionWorkOrders] = await Promise.all([
  getAdminMemberships(),
  getAdminSubscriptionWorkOrders(),
]);
```

Render the existing `AdminModulePage` for plans, then a second `AdminModulePage` titled `会员订阅工单` with `subscriptionWorkOrders` data. Wrap both in a fragment or `div className="space-y-6"`.

- [ ] **Step 3: Run lint/type check for admin UI**

Run:

```bash
pnpm exec eslint src/app/admin/'(console)'/memberships/page.tsx src/features/admin/admin-action-controls.tsx src/server/repositories/admin-subscription-work-orders.ts
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/'(console)'/memberships/page.tsx src/features/admin/module-page.tsx
git commit -m "feat: show subscription work orders in admin memberships"
```

---

### Task 7: Public Membership Application UI

**Files:**
- Modify: `src/app/membership/page.tsx`

- [ ] **Step 1: Replace local membership mutation with API-backed state**

In `src/app/membership/page.tsx`, remove the code that computes `expiry` and calls:

```ts
updateUser({ membershipLevel: level, membershipExpiry: expiry });
```

Add state:

```ts
type SubscriptionWorkOrderSummary = {
  id: string;
  code: string;
  status: 'pending' | 'processing' | 'closed' | 'archived';
  result: 'approved' | 'rejected' | null;
  planName: string;
  planCode: string;
  orderNumber: string;
  orderStatus: string;
  orderTotalCents: number;
  submittedAmountCents: number;
  submittedPaymentMethod: string;
  submittedPaidAt: string;
  submittedReference: string;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

const [subscriptionWorkOrder, setSubscriptionWorkOrder] = useState<SubscriptionWorkOrderSummary | null>(null);
const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
const [paymentMethod, setPaymentMethod] = useState('');
const [paidAmount, setPaidAmount] = useState('');
const [paidAt, setPaidAt] = useState('');
const [paymentReference, setPaymentReference] = useState('');
const [paymentNote, setPaymentNote] = useState('');
const [submitPending, setSubmitPending] = useState(false);
const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);
```

Use `userApiRequest` and `readJsonResponse` like `user-center/page.tsx`.

- [ ] **Step 2: Load current work order**

Add an effect:

```ts
useEffect(() => {
  if (!isLoggedIn || !user || requiresActivation(user)) {
    return;
  }

  let cancelled = false;
  void (async () => {
    const response = await userApiRequest('/api/membership/subscription-work-orders/current', {
      cache: 'no-store',
    });
    const payload = await readJsonResponse(response);
    if (!cancelled && response.ok) {
      setSubscriptionWorkOrder(payload.subscriptionWorkOrder ?? null);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [isLoggedIn, user]);
```

- [ ] **Step 3: Add application form handler**

Implement:

```ts
const planCodeByUiId: Record<string, string | null> = {
  free: null,
  monthly: 'pro-monthly',
  yearly: 'team-yearly',
};

const handleSubscribe = (planId: string) => {
  if (!isLoggedIn) {
    openLoginModal();
    return;
  }
  if (!user || requiresActivation(user)) return;
  const planCode = planCodeByUiId[planId];
  if (!planCode) return;
  setSelectedPlanCode(planCode);
  setSubscriptionMessage(null);
};

const handleSubmitSubscriptionWorkOrder = async (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (!selectedPlanCode) return;
  setSubmitPending(true);
  setSubscriptionMessage(null);
  try {
    const response = await userApiRequest('/api/membership/subscription-work-orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        planCode: selectedPlanCode,
        paymentMethod,
        amountCents: Math.round(Number(paidAmount) * 100),
        paidAt: new Date(paidAt).toISOString(),
        reference: paymentReference,
        note: paymentNote,
      }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      setSubscriptionMessage(typeof payload?.error?.message === 'string' ? payload.error.message : '订阅工单提交失败，请重试。');
      return;
    }
    setSubscriptionWorkOrder(payload.subscriptionWorkOrder);
    setSelectedPlanCode(null);
    setPaymentMethod('');
    setPaidAmount('');
    setPaidAt('');
    setPaymentReference('');
    setPaymentNote('');
    setSubscriptionMessage('订阅工单已提交，请等待客服核销。');
  } finally {
    setSubmitPending(false);
  }
};
```

Guard `new Date(paidAt)` so an empty value does not submit; the form should require the field.

- [ ] **Step 4: Render status and form**

Add a compact status panel below the current member card:

```tsx
{subscriptionWorkOrder ? (
  <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
    <div className="rounded-xl border border-black/[0.06] bg-white p-4 text-sm shadow-sm">
      <div className="font-semibold text-[#1d1d1f]">订阅工单 {subscriptionWorkOrder.code}</div>
      <div className="mt-1 text-[#555555]">
        {subscriptionWorkOrder.planName} · {subscriptionWorkOrder.orderNumber} · {subscriptionWorkOrder.result ?? subscriptionWorkOrder.status}
      </div>
    </div>
  </div>
) : null}
```

Render a modal-like inline panel when `selectedPlanCode` is set. Keep it unframed enough to match the page style, but include labeled inputs for payment method, amount, paid time, reference, and note.

- [ ] **Step 5: Run UI lint/type check**

Run:

```bash
pnpm exec eslint src/app/membership/page.tsx
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/membership/page.tsx
git commit -m "feat: submit membership subscription work orders"
```

---

### Task 8: User Center Status UI

**Files:**
- Modify: `src/app/user-center/page.tsx`

- [ ] **Step 1: Add current subscription status state**

In `src/app/user-center/page.tsx`, add the same `SubscriptionWorkOrderSummary` type from Task 7 or extract a shared type only if duplication becomes confusing.

Add:

```ts
const [subscriptionWorkOrder, setSubscriptionWorkOrder] = useState<SubscriptionWorkOrderSummary | null>(null);
```

In the existing entry refresh effect or a new effect, fetch:

```ts
const response = await userApiRequest('/api/membership/subscription-work-orders/current', {
  cache: 'no-store',
});
const payload = await readJsonResponse(response);
if (response.ok) {
  setSubscriptionWorkOrder(payload.subscriptionWorkOrder ?? null);
}
```

- [ ] **Step 2: Render overview card**

In the overview tab content, add a small status section near the membership card:

```tsx
{subscriptionWorkOrder ? (
  <div className="mt-4 rounded-xl border border-black/[0.06] bg-white p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-[#1d1d1f]">会员订阅工单</p>
        <p className="mt-1 text-xs text-[#555555]">
          {subscriptionWorkOrder.planName} · {subscriptionWorkOrder.orderNumber}
        </p>
      </div>
      <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-xs text-[#1d1d1f]">
        {subscriptionWorkOrder.result ?? subscriptionWorkOrder.status}
      </span>
    </div>
  </div>
) : null}
```

- [ ] **Step 3: Run lint/type check**

Run:

```bash
pnpm exec eslint src/app/user-center/page.tsx
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/user-center/page.tsx
git commit -m "feat: show subscription work order status in user center"
```

---

### Task 9: Full Verification And Fixes

**Files:**
- Create: `docs/superpowers/verification/2026-06-02-membership-subscription-work-orders-verification.md`
- Modify: files from prior tasks only if verification finds defects.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts src/server/repositories/subscription-work-orders.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run validation**

Run:

```bash
pnpm validate
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: PASS and includes new API routes in build output.

- [ ] **Step 4: Run database migration if configured**

Run:

```bash
pnpm db:migrate
```

Expected: PASS when `DATABASE_URL` is available. If missing or database is unavailable, record the exact error in the verification note and do not imply migration was applied.

- [ ] **Step 5: Browser verification**

Start dev server:

```bash
pnpm dev
```

Open:

- `http://localhost:3000/membership`
- `http://localhost:3000/user-center`
- `http://localhost:3000/admin/memberships`

Verify:

- Membership page no longer locally grants membership.
- Paid plan opens subscription work-order form.
- Current work-order status renders when API returns data.
- Admin membership page renders plan table and subscription work-order queue.
- Admin action buttons are visible for the correct statuses.

If authenticated browser coverage is blocked by credentials or missing DB state, record the blocker exactly.

- [ ] **Step 6: Write verification report**

Create `docs/superpowers/verification/2026-06-02-membership-subscription-work-orders-verification.md`:

```md
# Membership Subscription Work Orders Verification

Date: 2026-06-02

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts src/server/repositories/subscription-work-orders.test.ts` |  |  |
| `pnpm validate` |  |  |
| `pnpm build` |  |  |
| `pnpm db:migrate` |  |  |

## Browser Checks

- `/membership`:
- `/user-center`:
- `/admin/memberships`:

## Invariant Checks

- Entitlement remains the membership source of truth:
- Duplicate active work order guard:
- Approval idempotency:
- Rejection cancels pending order:

## Residual Risk

-
```

- [ ] **Step 7: Commit verification**

```bash
git add docs/superpowers/verification/2026-06-02-membership-subscription-work-orders-verification.md
git commit -m "chore: verify membership subscription work orders"
```

---

## Self-Review

Spec coverage:

- User chooses plan and submits work order: Task 4, Task 7.
- Pending order created with locked price: Task 3, Task 4.
- Admin queue and transitions: Task 5, Task 6.
- Approval marks order paid and creates/extends entitlement: Task 3.
- Rejection cancels pending order: Task 3, Task 5.
- No refund/upload/payment gateway scope: no implementation task includes those features.
- Verification: Task 9.

No placeholders remain as implementation gaps for the approved scope. The only conditional decisions are explicitly bounded: route auth guard reuse, table declaration order, and whether the admin list route is necessary based on server-rendered admin page structure.
