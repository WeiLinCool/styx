# Admin Sync Media Quota Latest Published Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the admin "同步媒体额度" action so it writes quota from the latest published membership version for the user's active plan instead of the user's currently effective entitlement version.

**Architecture:** Keep runtime media policy resolution unchanged and add a dedicated admin resync resolver in the server auth layer. Update the admin route to use that resolver, persist only `storageQuotaBytes`, and emit richer audit metadata. Cover the new semantics with focused server tests and align the admin success copy with the new behavior.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Drizzle ORM, Node test runner, existing server auth and repository modules

---

### Task 1: Add failing tests for admin resync semantics

**Files:**
- Create: `src/server/auth/admin-membership-media-policy.test.ts`
- Modify: `src/server/auth/admin-membership-media-policy.ts`
- Test: `src/server/auth/admin-membership-media-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import type { MembershipPlanVersionRecord } from '@/server/repositories/membership-plan-versions';

import {
  RESTRICTIVE_MEDIA_POLICY,
  resolveAdminResyncMembershipMediaPolicy,
} from './admin-membership-media-policy';

function createEntitlement(
  overrides: Partial<ActiveUserEntitlement> = {},
): ActiveUserEntitlement {
  return {
    id: 'entitlement-1',
    userId: 'user-1',
    scope: 'membership_plan',
    planCode: 'pro-monthly',
    planVersionId: 'version-pro-v1',
    startsAt: '2026-06-01T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
    sourceType: 'order',
    sourceId: 'order-1',
    metadata: {},
    ...overrides,
  };
}

function createVersion(
  overrides: Partial<MembershipPlanVersionRecord> = {},
): MembershipPlanVersionRecord {
  return {
    id: 'version-pro-v2',
    planId: 'plan-pro',
    planCode: 'pro-monthly',
    versionNumber: 2,
    status: 'published',
    label: 'Pro v2',
    description: null,
    effectiveFrom: null,
    publishedAt: '2026-06-09T00:00:00.000Z',
    mediaLibraryPolicy: {
      storageQuotaBytes: 2 * 1024 * 1024 * 1024,
      allowUserUpload: true,
      allowPublicSharing: true,
    },
    benefits: [],
    permissionCodes: [],
    videoGenerationConfig: null,
    createdAt: '2026-06-09T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    ...overrides,
  };
}

test('resolveAdminResyncMembershipMediaPolicy prefers latest published version for active plan code', async () => {
  const policy = await resolveAdminResyncMembershipMediaPolicy('user-1', {
    now: new Date('2026-06-09T00:00:00.000Z'),
    entitlements: [
      createEntitlement({
        planVersionId: 'version-pro-v1',
      }),
    ],
    resolveLatestPublishedVersionByPlanCode: async (planCode) => {
      assert.equal(planCode, 'pro-monthly');
      return createVersion({
        id: 'version-pro-v2',
        versionNumber: 2,
        mediaLibraryPolicy: {
          storageQuotaBytes: 5 * 1024 * 1024 * 1024,
          allowUserUpload: true,
          allowPublicSharing: false,
        },
      });
    },
  });

  assert.deepEqual(policy, {
    storageQuotaBytes: 5 * 1024 * 1024 * 1024,
    allowUserUpload: true,
    allowPublicSharing: false,
  });
});

test('resolveAdminResyncMembershipMediaPolicy returns restrictive defaults when user has no active membership', async () => {
  const policy = await resolveAdminResyncMembershipMediaPolicy('user-1', {
    now: new Date('2026-06-09T00:00:00.000Z'),
    entitlements: [],
    resolveLatestPublishedVersionByPlanCode: async () => {
      throw new Error('should not resolve version without active plan');
    },
  });

  assert.deepEqual(policy, RESTRICTIVE_MEDIA_POLICY);
});

test('resolveAdminResyncMembershipMediaPolicy ignores draft versions and uses latest published version', async () => {
  const calls: string[] = [];

  const policy = await resolveAdminResyncMembershipMediaPolicy('user-1', {
    now: new Date('2026-06-09T00:00:00.000Z'),
    entitlements: [
      createEntitlement({
        planVersionId: 'version-pro-v1',
      }),
    ],
    resolveLatestPublishedVersionByPlanCode: async (planCode) => {
      calls.push(planCode);
      return createVersion({
        id: 'version-pro-v2',
        versionNumber: 2,
        status: 'published',
        mediaLibraryPolicy: {
          storageQuotaBytes: 3 * 1024 * 1024 * 1024,
          allowUserUpload: true,
          allowPublicSharing: true,
        },
      });
    },
  });

  assert.deepEqual(calls, ['pro-monthly']);
  assert.equal(policy.storageQuotaBytes, 3 * 1024 * 1024 * 1024);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/server/auth/admin-membership-media-policy.test.ts`
Expected: FAIL with module-not-found or missing export errors for `admin-membership-media-policy`

- [ ] **Step 3: Write minimal implementation**

```typescript
import {
  listActiveUserEntitlementsAt,
  type ActiveUserEntitlement,
} from '@/server/ai/model-entitlements';
import {
  listVersionsByPlanCode,
  type MembershipMediaLibraryPolicy,
  type MembershipPlanVersionRecord,
} from '@/server/repositories/membership-plan-versions';

export type AdminResyncedMembershipMediaPolicy = MembershipMediaLibraryPolicy;

export const RESTRICTIVE_MEDIA_POLICY: AdminResyncedMembershipMediaPolicy = {
  storageQuotaBytes: 0,
  allowUserUpload: false,
  allowPublicSharing: false,
};

function isEntitlementActive(entitlement: ActiveUserEntitlement, now: Date) {
  const nowTime = now.getTime();
  return (
    new Date(entitlement.startsAt).getTime() <= nowTime &&
    (!entitlement.expiresAt || new Date(entitlement.expiresAt).getTime() > nowTime)
  );
}

function chooseActivePlanCode(
  entitlements: ActiveUserEntitlement[],
  now: Date,
) {
  return entitlements
    .filter((entitlement) => isEntitlementActive(entitlement, now))
    .filter(
      (entitlement): entitlement is ActiveUserEntitlement & { planCode: string } =>
        typeof entitlement.planCode === 'string' && entitlement.planCode.length > 0,
    )
    .sort((left, right) => {
      const leftExpiry = left.expiresAt
        ? new Date(left.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      const rightExpiry = right.expiresAt
        ? new Date(right.expiresAt).getTime()
        : Number.POSITIVE_INFINITY;
      return rightExpiry - leftExpiry;
    })[0]?.planCode ?? null;
}

async function resolveLatestPublishedVersionByPlanCode(planCode: string) {
  const versions = await listVersionsByPlanCode(planCode);
  return versions
    .filter((version) => version.status === 'published')
    .sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null;
}

export async function resolveAdminResyncMembershipMediaPolicy(
  userId: string,
  input: {
    now?: Date;
    entitlements?: ActiveUserEntitlement[];
    getEntitlements?: (userId: string, now: Date) => Promise<ActiveUserEntitlement[]>;
    resolveLatestPublishedVersionByPlanCode?: (
      planCode: string,
    ) => Promise<MembershipPlanVersionRecord | null>;
  } = {},
): Promise<AdminResyncedMembershipMediaPolicy> {
  const now = input.now ?? new Date();
  const entitlements =
    input.entitlements ??
    (await (input.getEntitlements ?? listActiveUserEntitlementsAt)(userId, now));

  const planCode = chooseActivePlanCode(entitlements, now);
  if (!planCode) {
    return RESTRICTIVE_MEDIA_POLICY;
  }

  const version = await (input.resolveLatestPublishedVersionByPlanCode ??
    resolveLatestPublishedVersionByPlanCode)(planCode);

  if (!version) {
    throw new Error(`No published membership version found for ${planCode}`);
  }

  return version.mediaLibraryPolicy;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test src/server/auth/admin-membership-media-policy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/admin-membership-media-policy.ts src/server/auth/admin-membership-media-policy.test.ts
git commit -m "test(auth): cover latest-published admin media quota policy"
```

### Task 2: Switch admin route to the new resolver and enrich audit metadata

**Files:**
- Modify: `src/app/api/admin/users/[userId]/membership-media-policy/route.ts`
- Modify: `src/server/auth/admin-membership-media-policy.ts`
- Test: `src/server/auth/admin-membership-media-policy.test.ts`

- [ ] **Step 1: Extend the test with source-version metadata support**

```typescript
test('resolveAdminResyncMembershipMediaPolicy returns source version metadata for admin audit usage', async () => {
  const version = createVersion({
    id: 'version-pro-v3',
    versionNumber: 3,
  });

  const result = await resolveAdminResyncMembershipMediaPolicy('user-1', {
    now: new Date('2026-06-09T00:00:00.000Z'),
    entitlements: [createEntitlement()],
    resolveLatestPublishedVersionByPlanCode: async () => version,
  });

  assert.deepEqual(result, {
    policy: version.mediaLibraryPolicy,
    sourcePlanCode: 'pro-monthly',
    sourceVersionId: 'version-pro-v3',
    sourceVersionNumber: 3,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/server/auth/admin-membership-media-policy.test.ts`
Expected: FAIL because the resolver currently returns only policy fields

- [ ] **Step 3: Update resolver and route implementation**

```typescript
export type AdminMembershipMediaPolicyResolution = {
  policy: MembershipMediaLibraryPolicy;
  sourcePlanCode: string | null;
  sourceVersionId: string | null;
  sourceVersionNumber: number | null;
};

export async function resolveAdminResyncMembershipMediaPolicy(
  userId: string,
  input: {
    now?: Date;
    entitlements?: ActiveUserEntitlement[];
    getEntitlements?: (userId: string, now: Date) => Promise<ActiveUserEntitlement[]>;
    resolveLatestPublishedVersionByPlanCode?: (
      planCode: string,
    ) => Promise<MembershipPlanVersionRecord | null>;
  } = {},
): Promise<AdminMembershipMediaPolicyResolution> {
  const now = input.now ?? new Date();
  const entitlements =
    input.entitlements ??
    (await (input.getEntitlements ?? listActiveUserEntitlementsAt)(userId, now));

  const planCode = chooseActivePlanCode(entitlements, now);
  if (!planCode) {
    return {
      policy: RESTRICTIVE_MEDIA_POLICY,
      sourcePlanCode: null,
      sourceVersionId: null,
      sourceVersionNumber: null,
    };
  }

  const version = await (input.resolveLatestPublishedVersionByPlanCode ??
    resolveLatestPublishedVersionByPlanCode)(planCode);

  if (!version) {
    throw new Error(`No published membership version found for ${planCode}`);
  }

  return {
    policy: version.mediaLibraryPolicy,
    sourcePlanCode: planCode,
    sourceVersionId: version.id,
    sourceVersionNumber: version.versionNumber,
  };
}
```

```typescript
const resolution = await resolveAdminResyncMembershipMediaPolicy(params.userId);
const quota = await applyMembershipMediaQuota(
  params.userId,
  resolution.policy.storageQuotaBytes,
);

await recordAuditEvent({
  actorId: session.user.id,
  targetId: params.userId,
  type: 'user.membership_media_quota_resynced',
  entityType: 'user',
  entityId: params.userId,
  metadata: {
    sourcePlanCode: resolution.sourcePlanCode,
    sourceVersionId: resolution.sourceVersionId,
    sourceVersionNumber: resolution.sourceVersionNumber,
    storageQuotaBytes: resolution.policy.storageQuotaBytes,
    allowUserUpload: resolution.policy.allowUserUpload,
    allowPublicSharing: resolution.policy.allowPublicSharing,
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test src/server/auth/admin-membership-media-policy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/admin-membership-media-policy.ts src/app/api/admin/users/[userId]/membership-media-policy/route.ts src/server/auth/admin-membership-media-policy.test.ts
git commit -m "feat(admin): sync media quota from latest published version"
```

### Task 3: Update admin success copy and run focused verification

**Files:**
- Modify: `src/features/admin/admin-action-controls.tsx`
- Test: `src/server/auth/admin-membership-media-policy.test.ts`

- [ ] **Step 1: Update admin success copy**

```tsx
{
  label: '同步媒体额度',
  url: `/api/admin/users/${userId}/membership-media-policy`,
  body: {},
  successMessage: '媒体额度已按会员方案最新发布版本同步。',
},
```

- [ ] **Step 2: Run focused tests**

Run: `pnpm exec tsx --test src/server/auth/admin-membership-media-policy.test.ts`
Expected: PASS

- [ ] **Step 3: Run broader validation**

Run: `pnpm validate`
Expected: PASS, or record the exact blocker/failure layer

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/admin-action-controls.tsx
git commit -m "copy(admin): align media quota sync success message"
```
