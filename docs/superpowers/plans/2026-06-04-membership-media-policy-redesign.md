# Membership Media Policy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-form membership media benefits with a structured media policy that controls quota, upload permission, and public sharing permission end-to-end.

**Architecture:** Add a strongly-typed `mediaLibraryPolicy` to membership plan versions, expose it in the admin membership workspace, apply quota snapshots to users when membership becomes effective, and enforce upload/share behavior from the active policy at runtime. Keep `storageUsedBytes` as durable usage truth while making `storageQuotaBytes` an applied policy snapshot.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, PostgreSQL, Drizzle ORM, existing membership version repository, account/auth services, Tencent COS-backed media library

---

### Task 1: Add Structured Membership Media Policy to Version Storage

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/repositories/membership-plan-versions.ts`
- Modify: `src/app/api/admin/memberships/membership-workspace-route.test.ts`
- Modify: `src/app/api/admin/memberships/plans/[planId]/draft/route.ts`
- Modify: `src/app/api/admin/memberships/plans/[planId]/draft/route.test.ts`

- [ ] **Step 1: Write failing tests for membership version media policy persistence**

Add assertions to `src/app/api/admin/memberships/membership-workspace-route.test.ts` and `src/app/api/admin/memberships/plans/[planId]/draft/route.test.ts` covering:

```ts
assert.deepEqual(body.mediaLibraryPolicy, {
  storageQuotaBytes: 1073741824,
  allowUserUpload: true,
  allowPublicSharing: false,
});
```

and draft parsing:

```ts
assert.deepEqual(parsed.mediaLibraryPolicy, {
  storageQuotaBytes: 2147483648,
  allowUserUpload: true,
  allowPublicSharing: true,
});
```

- [ ] **Step 2: Run the focused admin membership tests and verify they fail**

Run: `pnpm exec tsx --test src/app/api/admin/memberships/membership-workspace-route.test.ts 'src/app/api/admin/memberships/plans/[planId]/draft/route.test.ts'`

Expected: FAIL because membership version records and draft parsing do not yet include `mediaLibraryPolicy`.

- [ ] **Step 3: Extend membership version types and seed records**

Update `src/server/repositories/membership-plan-versions.ts` to add:

```ts
export type MembershipMediaLibraryPolicy = {
  storageQuotaBytes: number;
  allowUserUpload: boolean;
  allowPublicSharing: boolean;
};
```

and include it in:

```ts
export type MembershipPlanVersionRecord = {
  // existing fields...
  mediaLibraryPolicy: MembershipMediaLibraryPolicy;
};
```

Update draft input, cloning helpers, seed plans, and record mapping so every version always carries explicit media policy data.

- [ ] **Step 4: Extend schema persistence**

Update `src/server/db/schema.ts` so membership plan versions have structured media policy columns, for example:

```ts
mediaStorageQuotaBytes: integer('media_storage_quota_bytes').notNull().default(0),
mediaAllowUserUpload: boolean('media_allow_user_upload').notNull().default(false),
mediaAllowPublicSharing: boolean('media_allow_public_sharing').notNull().default(false),
```

Then update repository read/write code to map those columns into `mediaLibraryPolicy`.

- [ ] **Step 5: Update draft route validation**

In `src/app/api/admin/memberships/plans/[planId]/draft/route.ts`, extend the schema:

```ts
mediaLibraryPolicy: z.object({
  storageQuotaBytes: z.number().int().nonnegative(),
  allowUserUpload: z.boolean(),
  allowPublicSharing: z.boolean(),
}),
```

and make `parseMembershipDraftBody` return that object.

- [ ] **Step 6: Re-run the focused tests**

Run: `pnpm exec tsx --test src/app/api/admin/memberships/membership-workspace-route.test.ts 'src/app/api/admin/memberships/plans/[planId]/draft/route.test.ts'`

Expected: PASS with structured media policy persisted and parsed.

- [ ] **Step 7: Commit**

```bash
git add src/server/db/schema.ts src/server/repositories/membership-plan-versions.ts src/app/api/admin/memberships/membership-workspace-route.test.ts src/app/api/admin/memberships/plans/[planId]/draft/route.ts src/app/api/admin/memberships/plans/[planId]/draft/route.test.ts
git commit -m "feat: add structured membership media policy"
```

### Task 2: Replace Free-Form Admin Editing with Media Policy Controls

**Files:**
- Modify: `src/features/admin/admin-membership-config-module.tsx`
- Modify: `src/features/admin/admin-membership-config-module.test.tsx`

- [ ] **Step 1: Write failing UI tests for media policy editing**

Add tests in `src/features/admin/admin-membership-config-module.test.tsx` covering:

```tsx
assert.match(screen.getByLabelText('云资料存储额度').getAttribute('value') ?? '', /1024/);
assert.equal(screen.getByRole('switch', { name: '允许本地上传图片和视频' }).getAttribute('data-state'), 'checked');
assert.equal(screen.getByRole('switch', { name: '允许公开分享' }).getAttribute('data-state'), 'unchecked');
```

and save payload expectations:

```ts
assert.deepEqual(requestBody.mediaLibraryPolicy, {
  storageQuotaBytes: 1073741824,
  allowUserUpload: true,
  allowPublicSharing: false,
});
```

- [ ] **Step 2: Run the admin module tests and verify failure**

Run: `pnpm exec tsx --test src/features/admin/admin-membership-config-module.test.tsx`

Expected: FAIL because the UI still edits only generic `benefits[]`.

- [ ] **Step 3: Add dedicated media policy form state**

Refactor `DraftFormState` in `src/features/admin/admin-membership-config-module.tsx`:

```ts
type DraftFormState = {
  // existing fields...
  mediaLibraryPolicy: {
    storageQuotaGb: string;
    allowUserUpload: boolean;
    allowPublicSharing: boolean;
  };
};
```

Initialize it from `version.mediaLibraryPolicy`.

- [ ] **Step 4: Replace the media-related free-form editing block**

In the “高级权益” tab, add explicit controls for:

- storage quota
- allow upload
- allow sharing

and remove media-policy reliance on free-form benefit rows.

Save payload should convert units to bytes:

```ts
mediaLibraryPolicy: {
  storageQuotaBytes: Math.max(0, Number(formState.mediaLibraryPolicy.storageQuotaGb || 0)) * 1024 * 1024 * 1024,
  allowUserUpload: formState.mediaLibraryPolicy.allowUserUpload,
  allowPublicSharing: formState.mediaLibraryPolicy.allowPublicSharing,
},
```

- [ ] **Step 5: Re-run admin module tests**

Run: `pnpm exec tsx --test src/features/admin/admin-membership-config-module.test.tsx`

Expected: PASS with structured media policy controls and payload wiring.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/admin-membership-config-module.tsx src/features/admin/admin-membership-config-module.test.tsx
git commit -m "feat: add membership media policy editor"
```

### Task 3: Apply Quota Snapshot from Effective Membership Policy

**Files:**
- Modify: `src/server/auth/subscription-work-orders.ts`
- Modify: `src/server/auth/subscription-work-orders.test.ts`
- Modify: `src/server/repositories/users.ts`

- [ ] **Step 1: Write failing tests for quota snapshot application**

Extend `src/server/auth/subscription-work-orders.test.ts` with assertions that membership activation applies media quota:

```ts
assert.equal(appliedQuota.storageQuotaBytes, 1073741824);
assert.equal(appliedQuota.storageUsedBytes, 0);
```

or if using repository spies:

```ts
assert.deepEqual(quotaUpdates, [
  {
    userId: 'user-1',
    storageQuotaBytes: 1073741824,
  },
]);
```

- [ ] **Step 2: Run the membership activation tests and verify failure**

Run: `pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts`

Expected: FAIL because activation/approval flow does not yet apply media quota from membership policy.

- [ ] **Step 3: Add quota application at membership effect time**

In `src/server/auth/subscription-work-orders.ts`, after resolving the effective plan version, apply:

```ts
await tx
  .update(schema.users)
  .set({
    storageQuotaBytes: resolvedVersion.mediaLibraryPolicy.storageQuotaBytes,
    updatedAt: approvalTime,
  })
  .where(eq(schema.users.id, workOrder.userId));
```

Do not modify `storageUsedBytes` here.

- [ ] **Step 4: Add a focused user quota update helper if needed**

If the logic becomes repeated, add a helper in `src/server/repositories/users.ts` such as:

```ts
applyMembershipMediaQuota(userId: string, storageQuotaBytes: number): Promise<UserStorageQuotaSnapshot | null>;
```

- [ ] **Step 5: Re-run the membership activation tests**

Run: `pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts`

Expected: PASS with quota snapshot applied on membership effect.

- [ ] **Step 6: Commit**

```bash
git add src/server/auth/subscription-work-orders.ts src/server/auth/subscription-work-orders.test.ts src/server/repositories/users.ts
git commit -m "feat: apply membership media quota on activation"
```

### Task 4: Add Runtime Media Policy Resolution for Current User

**Files:**
- Create: `src/server/auth/membership-media-policy.ts`
- Create: `src/server/auth/membership-media-policy.test.ts`
- Modify: `src/server/repositories/membership-plan-versions.ts`

- [ ] **Step 1: Write failing tests for resolving current media policy**

Create `src/server/auth/membership-media-policy.test.ts` with cases like:

```ts
test('resolveCurrentUserMediaPolicy returns structured policy from active membership version', async () => {
  const policy = await resolveCurrentUserMediaPolicy('user-1', {
    entitlements: [/* active membership entitlement with planVersionId */],
    versionLoader: async () => versionRecordWithPolicy,
  });

  assert.deepEqual(policy, {
    storageQuotaBytes: 1073741824,
    allowUserUpload: true,
    allowPublicSharing: false,
  });
});

test('resolveCurrentUserMediaPolicy returns restrictive defaults for free users', async () => {
  assert.deepEqual(policy, {
    storageQuotaBytes: 0,
    allowUserUpload: false,
    allowPublicSharing: false,
  });
});
```

- [ ] **Step 2: Run the new policy tests and verify failure**

Run: `pnpm exec tsx --test src/server/auth/membership-media-policy.test.ts`

Expected: FAIL because no runtime resolver exists yet.

- [ ] **Step 3: Implement current-user media policy resolution**

Create `src/server/auth/membership-media-policy.ts` with a focused API:

```ts
export type ResolvedMembershipMediaPolicy = {
  storageQuotaBytes: number;
  allowUserUpload: boolean;
  allowPublicSharing: boolean;
};

export async function resolveCurrentUserMediaPolicy(userId: string): Promise<ResolvedMembershipMediaPolicy> {
  // inspect active membership entitlement
  // load effective plan version
  // return structured policy or restrictive default
}
```

Keep this separate from UI code and from user-row quota logic.

- [ ] **Step 4: Re-run the policy tests**

Run: `pnpm exec tsx --test src/server/auth/membership-media-policy.test.ts`

Expected: PASS with deterministic policy resolution.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/membership-media-policy.ts src/server/auth/membership-media-policy.test.ts src/server/repositories/membership-plan-versions.ts
git commit -m "feat: resolve current membership media policy"
```

### Task 5: Enforce Upload Permission from Membership Media Policy

**Files:**
- Modify: `src/app/api/user/media-assets/upload/route.ts`
- Modify: `src/app/api/user/media-assets/upload/route.test.ts`
- Modify: `src/server/media/upload-user-media.ts`

- [ ] **Step 1: Write failing route tests for upload denial**

Add tests to `src/app/api/user/media-assets/upload/route.test.ts`:

```ts
test('POST /api/user/media-assets/upload rejects users without upload permission', async () => {
  const response = await handlers.POST(requestWithFile);
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, 'membership_media_upload_forbidden');
});
```

- [ ] **Step 2: Run the upload route tests and verify failure**

Run: `pnpm exec tsx --test src/app/api/user/media-assets/upload/route.test.ts src/server/media/upload-user-media.test.ts`

Expected: FAIL because upload route does not yet consult membership media policy.

- [ ] **Step 3: Enforce policy before upload service**

In `src/app/api/user/media-assets/upload/route.ts`:

```ts
const policy = await resolveCurrentUserMediaPolicy(session.user.id);
if (!policy.allowUserUpload) {
  return jsonError('membership_media_upload_forbidden', '当前会员权益不支持本地上传资料。', 403);
}
```

Keep quota enforcement in the upload service; do not duplicate size/quota logic in the route.

- [ ] **Step 4: Re-run the upload tests**

Run: `pnpm exec tsx --test src/app/api/user/media-assets/upload/route.test.ts src/server/media/upload-user-media.test.ts`

Expected: PASS with upload forbidden when policy disallows it.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/user/media-assets/upload/route.ts src/app/api/user/media-assets/upload/route.test.ts src/server/media/upload-user-media.ts
git commit -m "feat: enforce membership upload permission"
```

### Task 6: Enforce Public Share Permission from Membership Media Policy

**Files:**
- Modify: `src/app/api/user/media-assets/[assetId]/share/route.ts`
- Modify: `src/app/api/user/media-assets/[assetId]/share/route.test.ts`
- Modify: `src/features/public/my-assets-page.tsx`

- [ ] **Step 1: Write failing share-route tests for permission denial**

Add route tests:

```ts
test('POST /api/user/media-assets/[assetId]/share rejects users without public share permission', async () => {
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error.code, 'membership_media_share_forbidden');
});
```

- [ ] **Step 2: Run the share-route tests and verify failure**

Run: `pnpm exec tsx --test 'src/app/api/user/media-assets/[assetId]/share/route.test.ts'`

Expected: FAIL because share route does not yet consult membership media policy.

- [ ] **Step 3: Enforce policy in share route**

In `src/app/api/user/media-assets/[assetId]/share/route.ts`:

```ts
const policy = await resolveCurrentUserMediaPolicy(session.user.id);
if (!policy.allowPublicSharing) {
  return jsonError('membership_media_share_forbidden', '当前会员权益不支持公开分享。', 403);
}
```

- [ ] **Step 4: Reflect share capability in My Media UI**

Update `src/features/public/my-assets-page.tsx` so the share action hides or disables when the resolved capability payload says sharing is unavailable. UI is secondary; server route remains authoritative.

- [ ] **Step 5: Re-run the share tests**

Run: `pnpm exec tsx --test 'src/app/api/user/media-assets/[assetId]/share/route.test.ts'`

Expected: PASS with forbidden share attempts rejected.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/user/media-assets/[assetId]/share/route.ts src/app/api/user/media-assets/[assetId]/share/route.test.ts src/features/public/my-assets-page.tsx
git commit -m "feat: enforce membership public sharing permission"
```

### Task 7: Add Admin User Action to Resync Applied Media Quota

**Files:**
- Create: `src/app/api/admin/users/[userId]/membership-media-policy/route.ts`
- Create: `src/app/api/admin/users/[userId]/membership-media-policy/route.test.ts`
- Modify: `src/server/repositories/users.ts`
- Modify: `src/features/admin/admin-users-module.tsx`

- [ ] **Step 1: Write failing tests for admin resync action**

Create `src/app/api/admin/users/[userId]/membership-media-policy/route.test.ts`:

```ts
test('POST /api/admin/users/[userId]/membership-media-policy reapplies storage quota from current membership policy', async () => {
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.quota.storageQuotaBytes, 1073741824);
});
```

- [ ] **Step 2: Run the admin resync tests and verify failure**

Run: `pnpm exec tsx --test 'src/app/api/admin/users/[userId]/membership-media-policy/route.test.ts'`

Expected: FAIL because the resync route does not exist yet.

- [ ] **Step 3: Implement resync route and repository helper**

Add a route that:

1. requires admin
2. resolves current membership media policy for the target user
3. updates `users.storageQuotaBytes`
4. returns the new quota snapshot
5. records an audit event

- [ ] **Step 4: Add admin UI trigger**

In `src/features/admin/admin-users-module.tsx`, add an action such as “同步媒体额度” that calls the new route for the selected user.

- [ ] **Step 5: Re-run the resync tests**

Run: `pnpm exec tsx --test 'src/app/api/admin/users/[userId]/membership-media-policy/route.test.ts'`

Expected: PASS with quota resync supported.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/users/[userId]/membership-media-policy/route.ts src/app/api/admin/users/[userId]/membership-media-policy/route.test.ts src/server/repositories/users.ts src/features/admin/admin-users-module.tsx
git commit -m "feat: add admin media policy resync for users"
```

### Task 8: Final Verification and Migration

**Files:**
- Modify: `drizzle/*` (generated)
- Create: `docs/superpowers/verification/2026-06-04-membership-media-policy-redesign.md`

- [ ] **Step 1: Generate Drizzle migration**

Run: `pnpm db:generate`

Expected: migration files are generated for membership version media-policy columns.

- [ ] **Step 2: Apply migration locally**

Run: `pnpm db:migrate`

Expected: database applies the media-policy schema changes successfully.

- [ ] **Step 3: Run focused automated tests**

Run:

```bash
pnpm exec tsx --test \
  src/app/api/admin/memberships/membership-workspace-route.test.ts \
  'src/app/api/admin/memberships/plans/[planId]/draft/route.test.ts' \
  src/features/admin/admin-membership-config-module.test.tsx \
  src/server/auth/subscription-work-orders.test.ts \
  src/server/auth/membership-media-policy.test.ts \
  src/app/api/user/media-assets/upload/route.test.ts \
  'src/app/api/user/media-assets/[assetId]/share/route.test.ts'
```

Expected: PASS with structured policy persistence and runtime enforcement covered.

- [ ] **Step 4: Run static validation**

Run: `pnpm validate`

Expected: PASS.

- [ ] **Step 5: Run build verification**

Run: `pnpm build`

Expected: PASS with admin and user routes/pages wired correctly.

- [ ] **Step 6: Browser verification**

Run: `pnpm dev`

Verify:

- admin can edit media policy in membership workspace
- publishing/saving preserves policy values
- user on disallowed policy cannot upload local media
- user on disallowed policy cannot enable share
- user on larger quota can upload after admin resync or new activation

- [ ] **Step 7: Record verification**

Create `docs/superpowers/verification/2026-06-04-membership-media-policy-redesign.md` summarizing commands run, results, and any environment blockers.

- [ ] **Step 8: Commit**

```bash
git add drizzle docs/superpowers/verification/2026-06-04-membership-media-policy-redesign.md
git commit -m "chore: verify membership media policy redesign"
```
