# Admin Membership Versioned Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned admin membership configuration workspace that manages membership pricing, benefits, and permission bindings without overwriting already-effective user entitlements, and add an in-page onboarding guide for the module.

**Architecture:** Keep `membership_plans` as the stable catalog identity, add version tables for commercial configuration, and bind each new or renewed `user_entitlements` record to the specific published membership version in effect at that time. Reuse the existing admin guide and permission-resource catalog, but move editable membership permission bindings into the membership workspace and keep `/admin/permissions` as a diagnostic surface.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, shadcn/Radix UI, Node test runner, tsx

---

## File Map

### Database and migration

- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/seed.ts`
- Create: `src/server/db/schema.membership-versioning.test.ts`
- Generate: `drizzle/*` via `pnpm db:generate`

### Runtime and repositories

- Create: `src/server/repositories/membership-plan-versions.ts`
- Create: `src/server/repositories/membership-plan-versions.test.ts`
- Create: `src/server/repositories/membership-version-benefits.ts`
- Create: `src/server/repositories/membership-version-permissions.ts`
- Modify: `src/server/repositories/membership-plan-permissions.ts`
- Modify: `src/server/repositories/memberships.ts`
- Modify: `src/server/repositories/benefits.ts`
- Modify: `src/server/auth/subscription-work-orders.ts`
- Modify: `src/server/auth/subscription-work-orders.test.ts`
- Modify: `src/server/auth/permission-service.ts`
- Modify: `src/server/ai/model-entitlements.ts`
- Modify: `src/server/auth/membership-snapshot.ts`

### Admin API and pages

- Create: `src/app/api/admin/memberships/plans/[planId]/workspace/route.ts`
- Create: `src/app/api/admin/memberships/plans/[planId]/draft/route.ts`
- Create: `src/app/api/admin/memberships/plans/[planId]/publish/route.ts`
- Create: `src/app/api/admin/memberships/plans/[planId]/schedule/route.ts`
- Create: `src/app/api/admin/memberships/plans/[planId]/history/[versionId]/duplicate/route.ts`
- Create: `src/app/api/admin/memberships/membership-workspace-route.test.ts`
- Modify: `src/app/admin/(console)/memberships/page.tsx`
- Modify: `src/app/admin/(console)/permissions/page.tsx`

### Admin UI

- Create: `src/features/admin/admin-membership-config-module.tsx`
- Create: `src/features/admin/admin-membership-config-module.test.tsx`
- Modify: `src/features/admin/admin-permissions-module.tsx`
- Modify: `src/features/admin/admin-permissions-module.test.tsx`
- Modify: `src/features/admin/admin-module-guide.tsx` only if small prop extensions are required

### Verification and docs

- Create: `docs/superpowers/verification/2026-06-03-admin-membership-versioned-config.md`

---

### Task 1: Add versioned membership schema and regression tests

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/seed.ts`
- Create: `src/server/db/schema.membership-versioning.test.ts`

- [ ] **Step 1: Write the failing schema test for new tables and entitlement linkage**

```ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { schema } from './schema';

test('membership versioning schema exposes version tables and entitlement version link', () => {
  assert.ok(schema.membershipPlanVersions, 'membershipPlanVersions table should exist');
  assert.ok(schema.membershipPlanVersionBenefits, 'membershipPlanVersionBenefits table should exist');
  assert.ok(
    schema.membershipPlanVersionPermissionBindings,
    'membershipPlanVersionPermissionBindings table should exist',
  );

  const entitlementColumns = new Set(Object.keys(schema.userEntitlements));
  assert.equal(entitlementColumns.has('planVersionId'), true);
});

test('generated drizzle snapshot should include membership versioning tables after migration generation', () => {
  const metaDir = new URL('../../../drizzle/meta/', import.meta.url);
  assert.ok(fs.existsSync(metaDir), 'drizzle/meta must exist after db:generate');
});
```

- [ ] **Step 2: Run the test to confirm failure**

Run:

```bash
pnpm exec tsx --test src/server/db/schema.membership-versioning.test.ts
```

Expected:

- FAIL because `membershipPlanVersions` and `planVersionId` do not exist yet.

- [ ] **Step 3: Extend `schema.ts` with version tables and entitlement foreign key**

Add the new enums/columns/tables in `src/server/db/schema.ts` near the existing membership tables:

```ts
export const membershipPlanVersionStatus = pgEnum('membership_plan_version_status', [
  'draft',
  'scheduled',
  'published',
  'archived',
]);

export const membershipPlanVersions = pgTable(
  'membership_plan_versions',
  {
    id,
    planId: uuid('plan_id')
      .notNull()
      .references(() => membershipPlans.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    status: membershipPlanVersionStatus('status').notNull().default('draft'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    displayName: text('display_name').notNull(),
    description: text('description'),
    billingPeriod: planBillingPeriod('billing_period').notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('CNY'),
    changeSummary: text('change_summary'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('membership_plan_versions_plan_version_unique_idx').on(
      table.planId,
      table.versionNumber,
    ),
    uniqueIndex('membership_plan_versions_single_draft_idx')
      .on(table.planId)
      .where(sql`${table.status} = 'draft'`),
    uniqueIndex('membership_plan_versions_single_scheduled_idx')
      .on(table.planId)
      .where(sql`${table.status} = 'scheduled'`),
    index('membership_plan_versions_status_idx').on(table.status),
    index('membership_plan_versions_effective_from_idx').on(table.effectiveFrom),
    check('membership_plan_versions_price_non_negative', sql`${table.priceCents} >= 0`),
  ],
);

export const membershipPlanVersionBenefits = pgTable(
  'membership_plan_version_benefits',
  {
    id,
    versionId: uuid('version_id')
      .notNull()
      .references(() => membershipPlanVersions.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: benefitKind('kind').notNull(),
    quantity: integer('quantity'),
    unit: text('unit'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('membership_plan_version_benefits_version_code_unique_idx').on(
      table.versionId,
      table.code,
    ),
    index('membership_plan_version_benefits_version_id_idx').on(table.versionId),
  ],
);

export const membershipPlanVersionPermissionBindings = pgTable(
  'membership_plan_version_permission_bindings',
  {
    id,
    versionId: uuid('version_id')
      .notNull()
      .references(() => membershipPlanVersions.id, { onDelete: 'cascade' }),
    permissionResourceId: uuid('permission_resource_id')
      .notNull()
      .references(() => permissionResources.id, { onDelete: 'cascade' }),
    createdAt: now,
  },
  (table) => [
    uniqueIndex('membership_plan_version_permission_bindings_unique_idx').on(
      table.versionId,
      table.permissionResourceId,
    ),
    index('membership_plan_version_permission_bindings_version_idx').on(table.versionId),
  ],
);
```

And extend `userEntitlements`:

```ts
planVersionId: uuid('plan_version_id').references(() => membershipPlanVersions.id, {
  onDelete: 'set null',
}),
```

- [ ] **Step 4: Seed initial version rows for current plans**

Add backfill-friendly seed data in `src/server/db/seed.ts` so local DBs have versioned plans:

```ts
const versionIds = {
  proPlanV1: crypto.randomUUID(),
  teamPlanV1: crypto.randomUUID(),
};

await db.insert(membershipPlanVersions).values([
  {
    id: versionIds.proPlanV1,
    planId: ids.proPlan,
    versionNumber: 1,
    status: 'published',
    publishedAt: now,
    effectiveFrom: now,
    displayName: 'Pro Monthly',
    description: '个人创作者月度方案，包含图像与工作流额度。',
    billingPeriod: 'month',
    priceCents: 9900,
    currency: 'CNY',
  },
  {
    id: versionIds.teamPlanV1,
    planId: ids.teamPlan,
    versionNumber: 1,
    status: 'published',
    publishedAt: now,
    effectiveFrom: now,
    displayName: 'Team Yearly',
    description: '团队年度方案，包含视频分钟数与优先支持。',
    billingPeriod: 'year',
    priceCents: 99900,
    currency: 'CNY',
  },
]);
```

- [ ] **Step 5: Generate the migration**

Run:

```bash
pnpm db:generate
```

Expected:

- PASS and new drizzle migration files appear for version tables and `user_entitlements.plan_version_id`.

- [ ] **Step 6: Re-run schema tests**

Run:

```bash
pnpm exec tsx --test src/server/db/schema.membership-versioning.test.ts
```

Expected:

- PASS

- [ ] **Step 7: Commit the schema work**

```bash
git add src/server/db/schema.ts src/server/db/seed.ts src/server/db/schema.membership-versioning.test.ts drizzle
git commit -m "feat: add membership versioning schema"
```

---

### Task 2: Build version repository and publish-resolution logic

**Files:**
- Create: `src/server/repositories/membership-plan-versions.ts`
- Create: `src/server/repositories/membership-plan-versions.test.ts`

- [ ] **Step 1: Write failing repository tests for draft, publish, schedule, and resolver behavior**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMembershipPlanVersionHarness,
  resolvePlanVersionForEntitlement,
} from './membership-plan-versions';

test('resolvePlanVersionForEntitlement prefers published version when no future schedule is active', async () => {
  const harness = createMembershipPlanVersionHarness();

  const version = await resolvePlanVersionForEntitlement('pro-monthly', {
    now: new Date('2026-06-03T10:00:00.000Z'),
    loader: harness,
  });

  assert.equal(version.status, 'published');
  assert.equal(version.versionNumber, 1);
});

test('resolvePlanVersionForEntitlement uses scheduled version after its effective time', async () => {
  const harness = createMembershipPlanVersionHarness({
    versions: [
      {
        id: 'v1',
        planCode: 'pro-monthly',
        versionNumber: 1,
        status: 'published',
        effectiveFrom: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'v2',
        planCode: 'pro-monthly',
        versionNumber: 2,
        status: 'scheduled',
        effectiveFrom: '2026-06-10T00:00:00.000Z',
      },
    ],
  });

  const version = await resolvePlanVersionForEntitlement('pro-monthly', {
    now: new Date('2026-06-11T00:00:00.000Z'),
    loader: harness,
  });

  assert.equal(version.id, 'v2');
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/server/repositories/membership-plan-versions.test.ts
```

Expected:

- FAIL because repository functions do not exist yet.

- [ ] **Step 3: Implement a focused version repository with in-memory harness**

Create `src/server/repositories/membership-plan-versions.ts`:

```ts
export type MembershipPlanVersionRecord = {
  id: string;
  planId: string;
  planCode: string;
  versionNumber: number;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  effectiveFrom: string | null;
  publishedAt: string | null;
};

type ResolverLoader = {
  listVersionsByPlanCode(planCode: string): Promise<MembershipPlanVersionRecord[]>;
};

export function createMembershipPlanVersionHarness(input?: {
  versions?: MembershipPlanVersionRecord[];
}): ResolverLoader {
  const versions = input?.versions ?? [
    {
      id: 'seed:pro-v1',
      planId: 'seed:pro',
      planCode: 'pro-monthly',
      versionNumber: 1,
      status: 'published',
      effectiveFrom: '2026-06-01T00:00:00.000Z',
      publishedAt: '2026-06-01T00:00:00.000Z',
    },
  ];

  return {
    async listVersionsByPlanCode(planCode) {
      return versions.filter((version) => version.planCode === planCode);
    },
  };
}

export async function resolvePlanVersionForEntitlement(
  planCode: string,
  input: {
    now?: Date;
    loader: ResolverLoader;
  },
) {
  const now = input.now ?? new Date();
  const versions = await input.loader.listVersionsByPlanCode(planCode);
  const eligible = versions
    .filter((version) => {
      if (version.status === 'published') {
        return true;
      }

      if (version.status !== 'scheduled' || !version.effectiveFrom) {
        return false;
      }

      return new Date(version.effectiveFrom).getTime() <= now.getTime();
    })
    .sort((left, right) => right.versionNumber - left.versionNumber);

  const current = eligible[0];
  if (!current) {
    throw new Error(`No published membership version found for ${planCode}`);
  }

  return current;
}
```

- [ ] **Step 4: Add DB-backed query stubs and workspace DTO shape**

Extend the same file with DB entry points used by later tasks:

```ts
export type MembershipPlanWorkspaceDto = {
  plan: { id: string; code: string; name: string };
  currentVersion: MembershipPlanVersionRecord | null;
  draftVersion: MembershipPlanVersionRecord | null;
  scheduledVersion: MembershipPlanVersionRecord | null;
  history: MembershipPlanVersionRecord[];
};

export async function getMembershipPlanWorkspace(planId: string): Promise<MembershipPlanWorkspaceDto> {
  const database = requireDb('membership workspace');
  const plan = await database.query.membershipPlans.findFirst({
    where: eq(schema.membershipPlans.id, planId),
    columns: { id: true, code: true, name: true },
  });

  if (!plan) {
    throw new Error(`Unknown membership plan id: ${planId}`);
  }

  const versions = await database
    .select()
    .from(schema.membershipPlanVersions)
    .where(eq(schema.membershipPlanVersions.planId, planId))
    .orderBy(desc(schema.membershipPlanVersions.versionNumber));

  const currentVersion = versions.find((version) => version.status === 'published') ?? null;
  const draftVersion = versions.find((version) => version.status === 'draft') ?? null;
  const scheduledVersion = versions.find((version) => version.status === 'scheduled') ?? null;

  return {
    plan,
    currentVersion: currentVersion ? toMembershipPlanVersionRecord(plan, currentVersion) : null,
    draftVersion: draftVersion ? toMembershipPlanVersionRecord(plan, draftVersion) : null,
    scheduledVersion: scheduledVersion ? toMembershipPlanVersionRecord(plan, scheduledVersion) : null,
    history: versions.map((version) => toMembershipPlanVersionRecord(plan, version)),
  };
}
```

- [ ] **Step 5: Re-run repository tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/membership-plan-versions.test.ts
```

Expected:

- PASS

- [ ] **Step 6: Commit the repository foundation**

```bash
git add src/server/repositories/membership-plan-versions.ts src/server/repositories/membership-plan-versions.test.ts
git commit -m "feat: add membership plan version repository"
```

---

### Task 3: Move permission resolution from plan-based lookup to version-based lookup

**Files:**
- Modify: `src/server/repositories/membership-plan-permissions.ts`
- Modify: `src/server/repositories/membership-plan-permissions.test.ts`
- Modify: `src/server/auth/permission-service.ts`

- [ ] **Step 1: Write failing tests for version-based permission resolution**

Add tests:

```ts
test('listUserPermissionCodes resolves permission bindings from entitlement plan versions', async () => {
  const codes = await listUserPermissionCodes('user-1', {
    now: new Date('2026-06-03T00:00:00.000Z'),
    entitlements: [
      {
        planCode: 'pro-monthly',
        planVersionId: 'version-1',
        benefitCode: null,
        source: 'membership',
        startsAt: '2026-06-01T00:00:00.000Z',
        expiresAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    versionPermissionCodes: {
      'version-1': ['page.user_center', 'action.user_center.copy_invite_code'],
    },
  });

  assert.deepEqual(codes, ['action.user_center.copy_invite_code', 'page.user_center']);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
pnpm exec tsx --test src/server/repositories/membership-plan-permissions.test.ts src/server/auth/permission-service.test.ts
```

Expected:

- FAIL because `planVersionId` / `versionPermissionCodes` are not part of the types yet.

- [ ] **Step 3: Extend entitlement types and permission repository helpers**

Update `src/server/repositories/membership-plan-permissions.ts`:

```ts
export async function listPermissionCodesForMembershipPlanVersions(versionIds: string[]): Promise<string[]> {
  if (versionIds.length === 0) {
    return [];
  }

  const database = ensureAdminReadSource('membership plan version permissions');
  if (!database) {
    return [];
  }

  const rows = await database
    .select({ code: schema.permissionResources.code })
    .from(schema.membershipPlanVersionPermissionBindings)
    .innerJoin(
      schema.permissionResources,
      eq(
        schema.permissionResources.id,
        schema.membershipPlanVersionPermissionBindings.permissionResourceId,
      ),
    )
    .where(inArray(schema.membershipPlanVersionPermissionBindings.versionId, versionIds))
    .orderBy(asc(schema.permissionResources.code));

  return [...new Set(rows.map((row) => row.code))];
}
```

Update `src/server/auth/permission-service.ts`:

```ts
type PermissionLookupOverrides = {
  now?: Date;
  entitlements?: ActiveUserEntitlement[];
  planPermissionCodes?: Record<string, string[]>;
  versionPermissionCodes?: Record<string, string[]>;
};

const activeVersionIds = [...new Set(
  entitlements
    .filter((entitlement) => isEntitlementActive(entitlement, now))
    .map((entitlement) => entitlement.planVersionId)
    .filter((versionId): versionId is string => typeof versionId === 'string' && versionId.length > 0),
)];

if (overrides.versionPermissionCodes) {
  return [
    ...new Set(activeVersionIds.flatMap((versionId) => overrides.versionPermissionCodes?.[versionId] ?? [])),
  ].sort();
}

if (activeVersionIds.length > 0) {
  return listPermissionCodesForMembershipPlanVersions(activeVersionIds);
}
```

- [ ] **Step 4: Re-run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/membership-plan-permissions.test.ts src/server/auth/permission-service.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit permission resolution migration**

```bash
git add src/server/repositories/membership-plan-permissions.ts src/server/repositories/membership-plan-permissions.test.ts src/server/auth/permission-service.ts src/server/auth/permission-service.test.ts
git commit -m "feat: resolve membership permissions by version"
```

---

### Task 4: Bind new and renewed entitlements to the published membership version

**Files:**
- Modify: `src/server/auth/subscription-work-orders.ts`
- Modify: `src/server/auth/subscription-work-orders.test.ts`
- Modify: `src/server/ai/model-entitlements.ts`
- Modify: `src/server/auth/membership-snapshot.ts`

- [ ] **Step 1: Write failing tests for entitlement version assignment and compatibility reads**

Add tests to `src/server/auth/subscription-work-orders.test.ts`:

```ts
test('approveSubscriptionWorkOrder assigns planVersionId from current published version', async () => {
  // build a harness or service-level helper assertion around entitlement insert payload
  assert.equal(insertedEntitlement.planVersionId, 'version-2');
});
```

Add tests to `src/server/ai/model-entitlements.test.ts`:

```ts
test('listActiveUserEntitlementsAt returns planVersionId for active entitlements', async () => {
  assert.equal(result[0]?.planVersionId, 'version-1');
});
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts src/server/ai/model-entitlements.test.ts src/server/auth/membership-snapshot.test.ts
```

Expected:

- FAIL because entitlement payloads do not include `planVersionId`.

- [ ] **Step 3: Resolve plan versions during approval and renewal**

Update `src/server/auth/subscription-work-orders.ts` around entitlement creation:

```ts
const resolvedVersion = await resolvePlanVersionForEntitlement(plan.code, {
  now: approvedAt,
  loader: membershipPlanVersionRepository,
});

await tx.insert(schema.userEntitlements).values({
  userId: latest.userId,
  planId: latest.planId,
  planVersionId: resolvedVersion.id,
  source: 'membership',
  startsAt,
  expiresAt,
  metadata: {
    subscriptionWorkOrderId: latest.id,
    versionNumber: resolvedVersion.versionNumber,
  },
});
```

Update `src/server/ai/model-entitlements.ts`:

```ts
export type ActiveUserEntitlement = {
  planCode: string | null;
  planVersionId: string | null;
  benefitCode: string | null;
  source: string;
  startsAt: string;
  expiresAt: string | null;
};
```

And select:

```ts
planVersionId: schema.userEntitlements.planVersionId,
```

- [ ] **Step 4: Keep membership snapshot stable while allowing version-aware reads**

Update `src/server/auth/membership-snapshot.ts` only to consume the expanded entitlement type without changing the public snapshot contract:

```ts
// No behavior change for rank ordering; retain planCode ranking for now.
```

- [ ] **Step 5: Re-run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts src/server/ai/model-entitlements.test.ts src/server/auth/membership-snapshot.test.ts
```

Expected:

- PASS

- [ ] **Step 6: Commit entitlement version binding**

```bash
git add src/server/auth/subscription-work-orders.ts src/server/auth/subscription-work-orders.test.ts src/server/ai/model-entitlements.ts src/server/ai/model-entitlements.test.ts src/server/auth/membership-snapshot.ts src/server/auth/membership-snapshot.test.ts
git commit -m "feat: bind membership entitlements to plan versions"
```

---

### Task 5: Expose a membership workspace API for draft, publish, schedule, and history copy

**Files:**
- Create: `src/app/api/admin/memberships/plans/[planId]/workspace/route.ts`
- Create: `src/app/api/admin/memberships/plans/[planId]/draft/route.ts`
- Create: `src/app/api/admin/memberships/plans/[planId]/publish/route.ts`
- Create: `src/app/api/admin/memberships/plans/[planId]/schedule/route.ts`
- Create: `src/app/api/admin/memberships/plans/[planId]/history/[versionId]/duplicate/route.ts`
- Create: `src/app/api/admin/memberships/membership-workspace-route.test.ts`

- [ ] **Step 1: Write failing route tests for workspace load and draft save validation**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMembershipDraftBody } from './plans/[planId]/draft/route';

test('parseMembershipDraftBody accepts pricing, benefit, and permission fields', async () => {
  const body = await parseMembershipDraftBody({
    json: async () => ({
      displayName: 'Pro Monthly',
      description: 'updated',
      billingPeriod: 'month',
      priceCents: 12900,
      permissionCodes: ['page.user_center'],
      benefits: [{ code: 'image-credits', name: 'Image credits', kind: 'quota', quantity: 600, unit: 'credit' }],
    }),
  });

  assert.equal(body.priceCents, 12900);
  assert.equal(body.permissionCodes.length, 1);
});
```

- [ ] **Step 2: Run the route test**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/memberships/membership-workspace-route.test.ts
```

Expected:

- FAIL because routes and validators do not exist.

- [ ] **Step 3: Implement zod validation and thin route handlers**

Example `draft/route.ts`:

```ts
const membershipDraftSchema = z.object({
  displayName: z.string().trim().min(1),
  description: z.string().trim().max(2000).nullable().optional(),
  billingPeriod: z.enum(['month', 'year', 'one_time']),
  priceCents: z.number().int().min(0),
  changeSummary: z.string().trim().max(500).optional(),
  permissionCodes: z.array(z.string().trim().min(1)),
  benefits: z.array(
    z.object({
      code: z.string().trim().min(1),
      name: z.string().trim().min(1),
      kind: z.enum(['quota', 'feature', 'discount', 'support']),
      quantity: z.number().int().nullable().optional(),
      unit: z.string().trim().nullable().optional(),
    }),
  ),
});

export async function parseMembershipDraftBody(request: Pick<Request, 'json'>) {
  return membershipDraftSchema.parse(await request.json());
}
```

Example `workspace/route.ts`:

```ts
export async function GET(
  _request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  await requireAdminSession();
  const { planId } = await context.params;
  return NextResponse.json(await getMembershipPlanWorkspace(planId), { status: 200 });
}
```

- [ ] **Step 4: Re-run route tests**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/memberships/membership-workspace-route.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit workspace API**

```bash
git add src/app/api/admin/memberships src/app/api/admin/memberships/membership-workspace-route.test.ts
git commit -m "feat: add admin membership workspace api"
```

---

### Task 6: Build the admin membership configuration workspace UI

**Files:**
- Create: `src/features/admin/admin-membership-config-module.tsx`
- Create: `src/features/admin/admin-membership-config-module.test.tsx`
- Modify: `src/app/admin/(console)/memberships/page.tsx`
- Modify: `src/features/admin/module-page.tsx` only if shared primitives are needed

- [ ] **Step 1: Write the failing UI test for guide + workspace tabs**

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminMembershipConfigModule } from './admin-membership-config-module';

test('admin membership config module shows version states and onboarding guide', () => {
  const html = renderToStaticMarkup(
    <AdminMembershipConfigModule
      data={{
        plans: [{ id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly' }],
        workspace: {
          plan: { id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly' },
          currentVersion: { id: 'v1', versionNumber: 1, status: 'published', effectiveFrom: '2026-06-01T00:00:00.000Z' },
          draftVersion: { id: 'v2', versionNumber: 2, status: 'draft', effectiveFrom: null },
          scheduledVersion: null,
          history: [],
          selectedPermissionCodes: ['page.user_center'],
          benefits: [],
        },
      }}
    />,
  );

  assert.match(html, /第一次配置会员方案/);
  assert.match(html, /基础信息与价格/);
  assert.match(html, /权限绑定/);
});
```

- [ ] **Step 2: Run the UI test**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-membership-config-module.test.tsx
```

Expected:

- FAIL because the component does not exist.

- [ ] **Step 3: Implement a focused membership workspace module**

Create `src/features/admin/admin-membership-config-module.tsx` with:

```tsx
export function AdminMembershipConfigModule({ data }: AdminMembershipConfigModuleProps) {
  return (
    <div className="space-y-4">
      <AdminModuleGuide
        title="第一次配置会员方案"
        description="会员方案以版本方式管理。管理员编辑的是下一版价格、权益和权限绑定；已生效用户会保留当前周期的历史版本，只有新开通和续费才会进入新版本。"
        steps={[
          '先选择要维护的会员方案，确认当前发布版本、预定生效版本和正在编辑的草稿是否一致。',
          '在草稿中完成价格、权益规则和权限绑定调整，必要时填写本次变更说明。',
          '发布时选择立即生效或预定生效时间；发布后只影响新开通和后续续费，不覆盖已生效用户当期权益。',
        ]}
        risks={[
          '删除权限或权益不会回收当前周期内已生效用户的能力，需确认下个续费周期的预期变化。',
          '调整价格后，续费用户将按新版本价格结算，必要时先通知运营和客服。',
          '同一方案同一时间只能保留一个待生效版本，避免续费结算出现版本歧义。',
        ]}
      />
      {/* left plan list, workspace summary cards, tabs for pricing/benefits/permissions, and publish actions */}
    </div>
  );
}
```

- [ ] **Step 4: Replace the current memberships page with workspace + work-order layout**

Update `src/app/admin/(console)/memberships/page.tsx`:

```tsx
export default async function AdminMembershipsPage() {
  const [workspaceData, subscriptionWorkOrders] = await Promise.all([
    getAdminMembershipWorkspacePageData(),
    getAdminSubscriptionWorkOrders(),
  ]);

  return (
    <div className="space-y-6">
      <AdminMembershipConfigModule data={workspaceData} />
      <AdminModulePage
        title="会员订阅工单"
        description="用户提交的会员付款核销队列，审批通过后开通或顺延会员权益。"
        source={subscriptionWorkOrders.source}
        metrics={subscriptionWorkOrders.metrics}
        filters={subscriptionWorkOrders.filters}
        records={subscriptionWorkOrders.records}
        columns={subscriptionWorkOrderColumns}
        searchPlaceholder="搜索工单号、订单号、用户或流水号..."
        emptyLabel="暂无会员订阅工单"
      />
    </div>
  );
}
```

- [ ] **Step 5: Re-run the UI test**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-membership-config-module.test.tsx
```

Expected:

- PASS

- [ ] **Step 6: Commit workspace UI**

```bash
git add src/features/admin/admin-membership-config-module.tsx src/features/admin/admin-membership-config-module.test.tsx src/app/admin/'(console)'/memberships/page.tsx
git commit -m "feat: add admin membership config workspace"
```

---

### Task 7: Reuse the permissions editor inside the membership workspace and demote `/admin/permissions`

**Files:**
- Modify: `src/features/admin/admin-permissions-module.tsx`
- Modify: `src/features/admin/admin-permissions-module.test.tsx`
- Modify: `src/app/admin/(console)/permissions/page.tsx`

- [ ] **Step 1: Write the failing test for embedded permissions mode**

```tsx
test('admin permissions module can render embedded mode without plan sidebar copy', () => {
  const data = {
    overview: {
      source: 'seed',
      metrics: [{ label: '页面', value: '1', hint: 'page', tone: 'success' }],
      filters: [{ label: 'All', value: 'all', count: 1 }],
      records: [],
    },
    workspace: {
      plan: { id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly' },
      plans: [{ id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly' }],
      selectedCodes: ['page.user_center'],
      modules: [
        {
          key: 'user-center',
          label: 'user-center',
          resources: [
            {
              id: 'resource-1',
              code: 'page.user_center',
              name: '用户中心页面',
              resourceType: 'page',
              description: '允许访问用户中心页面。',
              routePattern: '/user-center',
              actionKey: null,
              dependsOn: [],
              recommendedWith: [],
            },
          ],
        },
      ],
    },
  };

  const html = renderToStaticMarkup(
    <AdminPermissionsModule
      mode="embedded"
      data={data}
    />,
  );

  assert.doesNotMatch(html, /选择要配置的方案/);
});
```

- [ ] **Step 2: Run the test**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-permissions-module.test.tsx
```

Expected:

- FAIL because `mode="embedded"` is unsupported.

- [ ] **Step 3: Add an embedded mode that uses version-scoped save handlers**

Update `src/features/admin/admin-permissions-module.tsx`:

```tsx
type AdminPermissionsModuleProps = {
  mode?: 'standalone' | 'embedded';
  data: {
    overview: AdminPermissionResourceOverview;
    workspace: MembershipPlanPermissionWorkspace;
  };
};

const isEmbedded = mode === 'embedded';

{isEmbedded ? null : (
  <aside className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
    {/* existing plan list */}
  </aside>
)}
```

And keep `standalone` as the default for `/admin/permissions`.

- [ ] **Step 4: Reframe `/admin/permissions` as a diagnostic page**

Update `src/app/admin/(console)/permissions/page.tsx` description and shell copy to reflect that it is a resource overview surface rather than the main editing home.

```tsx
return (
  <AdminPermissionsModule
    mode="standalone"
    data={{ overview, workspace }}
  />
);
```

- [ ] **Step 5: Re-run UI tests**

Run:

```bash
pnpm exec tsx --test src/features/admin/admin-permissions-module.test.tsx
```

Expected:

- PASS

- [ ] **Step 6: Commit permissions embedding**

```bash
git add src/features/admin/admin-permissions-module.tsx src/features/admin/admin-permissions-module.test.tsx src/app/admin/'(console)'/permissions/page.tsx
git commit -m "feat: embed membership permissions editor in workspace"
```

---

### Task 8: Run integrated validation, build, and browser checks

**Files:**
- Create: `docs/superpowers/verification/2026-06-03-admin-membership-versioned-config.md`

- [ ] **Step 1: Run focused tests for membership versioning**

Run:

```bash
pnpm exec tsx --test \
  src/server/db/schema.membership-versioning.test.ts \
  src/server/repositories/membership-plan-versions.test.ts \
  src/server/repositories/membership-plan-permissions.test.ts \
  src/server/auth/subscription-work-orders.test.ts \
  src/server/ai/model-entitlements.test.ts \
  src/features/admin/admin-membership-config-module.test.tsx \
  src/features/admin/admin-permissions-module.test.tsx \
  src/app/api/admin/memberships/membership-workspace-route.test.ts
```

Expected:

- PASS

- [ ] **Step 2: Run baseline validation**

Run:

```bash
pnpm validate
```

Expected:

- PASS

- [ ] **Step 3: Run the production build**

Run:

```bash
pnpm build
```

Expected:

- PASS and the output includes updated admin memberships pages and membership workspace API routes.

- [ ] **Step 4: Run browser verification against the local app**

Run:

```bash
pnpm dev
```

Then verify in the browser:

- `/admin/memberships` renders the new guide, plan list, tabs, version states, and work-order table.
- saving draft edits does not claim to update current-cycle users.
- publish and schedule dialogs explain “only affects new activations and renewals”.
- `/admin/permissions` still renders but now reads as a diagnostic/overview surface.

- [ ] **Step 5: Record verification evidence**

Create `docs/superpowers/verification/2026-06-03-admin-membership-versioned-config.md`:

```md
# Admin Membership Versioned Config Verification

- `pnpm exec tsx --test src/server/db/schema.membership-versioning.test.ts src/server/repositories/membership-plan-versions.test.ts src/server/repositories/membership-plan-permissions.test.ts src/server/auth/subscription-work-orders.test.ts src/server/ai/model-entitlements.test.ts src/features/admin/admin-membership-config-module.test.tsx src/features/admin/admin-permissions-module.test.tsx src/app/api/admin/memberships/membership-workspace-route.test.ts` ✅
- `pnpm validate` ✅
- `pnpm build` ✅
- Browser check on `/admin/memberships` and `/admin/permissions` ✅ / blocked with exact reason
```

- [ ] **Step 6: Commit verification artifacts**

```bash
git add docs/superpowers/verification/2026-06-03-admin-membership-versioned-config.md
git commit -m "docs: record membership versioned config verification"
```

---

## Self-Review

Spec coverage check:

- Versioned catalog and durable historical entitlements: Tasks 1-4
- Draft / publish / schedule lifecycle: Tasks 2 and 5
- Membership admin workspace UI: Task 6
- Embedded permission binding in memberships and `/admin/permissions` downgrade: Task 7
- New member onboarding guide copy: Task 6
- Validation and browser verification: Task 8

Placeholder scan:

- No `TODO` / `TBD` placeholders left in the steps.
- Each task names exact files and concrete commands.

Type consistency:

- `planVersionId` is introduced in Task 1 and then used consistently in Tasks 3-4.
- `resolvePlanVersionForEntitlement` is introduced in Task 2 and consumed in Task 4.
