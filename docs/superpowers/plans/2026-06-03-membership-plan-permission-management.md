# Membership Plan Permission Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a membership-plan driven permission system that controls user-facing menus, pages, actions, and APIs through admin-configured plan bindings instead of hardcoded checks.

**Architecture:** Permission resources remain engineering-defined in a typed catalog and are mirrored into the database for admin binding. Runtime access resolves from active user entitlements to membership plans, then to bound permission codes, and all consumers use the same permission service and guard helpers.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, Zod, existing admin console/module patterns, existing auth/entitlement repositories.

---

## File Structure

### New files

- `src/server/auth/permission-catalog.ts`
  Defines the canonical permission-resource catalog for menus, pages, actions, and APIs.
- `src/server/auth/permission-service.ts`
  Resolves effective user permission codes and exposes guard helpers.
- `src/server/auth/permission-service.test.ts`
  Covers runtime permission resolution and fail-closed access helpers.
- `src/server/repositories/permission-resources.ts`
  Syncs and lists permission resources for admin consumption.
- `src/server/repositories/membership-plan-permissions.ts`
  Reads and writes membership-plan permission bindings.
- `src/server/repositories/membership-plan-permissions.test.ts`
  Covers binding persistence and admin workspace data shaping.
- `src/app/api/admin/permissions/resources/route.ts`
  Returns the resource overview payload for the admin console.
- `src/app/api/admin/permissions/plans/[planId]/route.ts`
  Reads and replaces the selected plan's permission bindings.
- `src/app/api/admin/permissions/sync/route.ts`
  Triggers catalog-to-database sync if an explicit route is preferred over lazy sync.
- `src/app/admin/(console)/permissions/page.tsx`
  Admin console route for the permission module.
- `src/features/admin/admin-permissions-module.tsx`
  Client/admin surface for resource overview and plan binding management.
- `src/features/public/permissioned-menu.ts`
  Shared helper for filtering menu items by permission code.
- `src/features/public/permissioned-menu.test.ts`
  Covers menu filtering behavior.
- `src/app/forbidden/page.tsx`
  Unified no-access page for authenticated users lacking permissions.

### Modified files

- `src/server/db/schema.ts`
  Adds permission enums/tables and exports them in `schema`.
- `src/server/db/seed.ts`
  Seeds resource rows and default plan bindings for local verification.
- `src/features/admin/admin-nav.tsx`
  Adds the `/admin/permissions` nav entry.
- `src/features/public/home-data.ts`
  Adds permission codes to user-facing nav/menu entries that should be controlled.
- `src/features/public/home-page.tsx`
  Filters visible navigation entries using resolved permission codes.
- `src/app/home/page.tsx`
  Loads effective permissions server-side and passes them into the client page.
- `src/app/user-center/page.tsx`
  Gates controlled actions/buttons and page-level access using permission codes.
- `src/app/api/user/points/checkin/route.ts`
  Adds API permission guard enforcement.
- `src/app/api/user/media-assets/route.ts`
  Adds API permission guard enforcement if not already controlled elsewhere.
- `src/app/api/auth/me/route.ts`
  Includes effective permission codes in the authenticated user payload if the chosen integration path requires client-side action gating.
- `src/lib/auth-user.ts`
  Extends the auth user shape with `permissionCodes`.
- `src/lib/auth-context.tsx`
  Persists/refreshed permission codes from `/api/auth/me`.
- `src/server/repositories/users.ts`
  Reuses active entitlement data if needed by `/api/auth/me`.
- `src/server/auth/guards.ts`
  Adds or exposes user-permission guard helpers reusable by route handlers/pages.

### Existing files to inspect while implementing

- `src/server/ai/model-entitlements.ts`
- `src/server/repositories/ai-models.ts`
- `src/features/admin/admin-ai-models-module.tsx`
- `src/features/admin/module-page.tsx`
- `src/app/admin/(console)/memberships/page.tsx`
- `src/app/api/admin/content/route.ts`
- `src/app/api/admin/ai-models/route.ts`

## Task 1: Add Schema And Seed Support

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/seed.ts`
- Test: `src/server/repositories/membership-plan-permissions.test.ts`

- [ ] **Step 1: Write the failing repository test for plan bindings**

```ts
test('replaceMembershipPlanPermissionBindings stores the selected resource set', async () => {
  const repository = createMembershipPlanPermissionRepositoryHarness();

  await repository.replaceMembershipPlanPermissionBindings({
    planCode: 'pro-monthly',
    permissionCodes: ['page.user_center', 'action.user_center.copy_invite_code'],
  });

  const bindings = await repository.listMembershipPlanPermissionCodes('pro-monthly');

  assert.deepEqual(bindings, [
    'action.user_center.copy_invite_code',
    'page.user_center',
  ]);
});
```

- [ ] **Step 2: Run the targeted test to verify the missing schema/repository path fails**

Run: `pnpm exec tsx --test src/server/repositories/membership-plan-permissions.test.ts`  
Expected: FAIL with module/table/symbol errors for permission binding support.

- [ ] **Step 3: Add the new schema objects**

```ts
export const permissionResourceType = pgEnum('permission_resource_type', [
  'menu',
  'page',
  'action',
  'api',
]);

export const permissionResources = pgTable(
  'permission_resources',
  {
    id,
    code: text('code').notNull(),
    name: text('name').notNull(),
    resourceType: permissionResourceType('resource_type').notNull(),
    module: text('module').notNull(),
    description: text('description'),
    routePattern: text('route_pattern'),
    actionKey: text('action_key'),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('permission_resources_code_unique_idx').on(table.code),
    index('permission_resources_type_idx').on(table.resourceType),
    index('permission_resources_module_idx').on(table.module),
    index('permission_resources_active_idx').on(table.isActive),
  ],
);

export const membershipPlanPermissionBindings = pgTable(
  'membership_plan_permission_bindings',
  {
    id,
    planId: uuid('plan_id')
      .notNull()
      .references(() => membershipPlans.id, { onDelete: 'cascade' }),
    permissionResourceId: uuid('permission_resource_id')
      .notNull()
      .references(() => permissionResources.id, { onDelete: 'cascade' }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    uniqueIndex('membership_plan_permission_bindings_unique_idx').on(
      table.planId,
      table.permissionResourceId,
    ),
    index('membership_plan_permission_bindings_plan_idx').on(table.planId),
    index('membership_plan_permission_bindings_resource_idx').on(table.permissionResourceId),
  ],
);
```

- [ ] **Step 4: Seed a minimal local default dataset**

```ts
const permissionSeed = [
  {
    code: 'page.user_center',
    name: '用户中心页面',
    resourceType: 'page',
    module: 'user-center',
    routePattern: '/user-center',
  },
  {
    code: 'action.user_center.copy_invite_code',
    name: '复制邀请码按钮',
    resourceType: 'action',
    module: 'user-center',
    actionKey: 'copy_invite_code',
  },
];
```

Add insert/upsert logic for:

- `permissionResources`
- default bindings for at least one active membership plan such as `pro-monthly`

- [ ] **Step 5: Re-run the targeted test**

Run: `pnpm exec tsx --test src/server/repositories/membership-plan-permissions.test.ts`  
Expected: still FAIL, but now on missing repository implementation rather than missing schema symbols.

- [ ] **Step 6: Generate the migration**

Run: `pnpm db:generate`  
Expected: new Drizzle migration for `permission_resources` and `membership_plan_permission_bindings`.

- [ ] **Step 7: Commit the schema slice**

```bash
git add src/server/db/schema.ts src/server/db/seed.ts drizzle
git commit -m "feat: add permission resource schema"
```

## Task 2: Build The Permission Catalog And Repository Layer

**Files:**
- Create: `src/server/auth/permission-catalog.ts`
- Create: `src/server/repositories/permission-resources.ts`
- Create: `src/server/repositories/membership-plan-permissions.ts`
- Create: `src/server/repositories/membership-plan-permissions.test.ts`

- [ ] **Step 1: Write failing tests for catalog validation and binding replacement**

```ts
test('permission catalog codes are unique', () => {
  const codes = permissionCatalog.map((item) => item.code);
  assert.equal(new Set(codes).size, codes.length);
});

test('listMembershipPlanPermissionWorkspace returns grouped resources and selected codes', async () => {
  const workspace = await listMembershipPlanPermissionWorkspace('pro-monthly');

  assert.equal(workspace.plan.code, 'pro-monthly');
  assert.ok(workspace.modules.some((module) => module.key === 'user-center'));
  assert.ok(workspace.selectedCodes.includes('page.user_center'));
});
```

- [ ] **Step 2: Run the new tests and capture the initial failure**

Run: `pnpm exec tsx --test src/server/repositories/membership-plan-permissions.test.ts src/server/auth/permission-service.test.ts`  
Expected: FAIL because the catalog and repositories do not exist yet.

- [ ] **Step 3: Create the typed permission catalog**

```ts
export type PermissionResourceDefinition = {
  code: string;
  name: string;
  resourceType: 'menu' | 'page' | 'action' | 'api';
  module: string;
  description: string;
  routePattern?: string;
  actionKey?: string;
  dependsOn?: string[];
  recommendedWith?: string[];
};

export const permissionCatalog = [
  {
    code: 'menu.user_center',
    name: '用户中心菜单',
    resourceType: 'menu',
    module: 'navigation',
    description: '允许显示用户中心入口',
    routePattern: '/user-center',
    dependsOn: ['page.user_center'],
  },
  {
    code: 'page.user_center',
    name: '用户中心页面',
    resourceType: 'page',
    module: 'user-center',
    description: '允许访问用户中心页面',
    routePattern: '/user-center',
  },
  {
    code: 'action.user_center.copy_invite_code',
    name: '复制邀请码按钮',
    resourceType: 'action',
    module: 'user-center',
    description: '允许复制邀请码操作',
    actionKey: 'copy_invite_code',
    dependsOn: ['page.user_center', 'api.user.invites.read'],
  },
];
```

- [ ] **Step 4: Implement the resource sync/list repository**

```ts
export async function syncPermissionResourcesFromCatalog() {
  const database = ensureAdminReadSource('permissions');
  if (!database) {
    return { source: 'seed', count: permissionCatalog.length };
  }

  await database
    .insert(schema.permissionResources)
    .values(
      permissionCatalog.map((resource) => ({
        code: resource.code,
        name: resource.name,
        resourceType: resource.resourceType,
        module: resource.module,
        description: resource.description,
        routePattern: resource.routePattern ?? null,
        actionKey: resource.actionKey ?? null,
        isActive: true,
        metadata: {
          dependsOn: resource.dependsOn ?? [],
          recommendedWith: resource.recommendedWith ?? [],
        },
      })),
    )
    .onConflictDoUpdate({
      target: schema.permissionResources.code,
      set: {
        name: sql`excluded.name`,
        resourceType: sql`excluded.resource_type`,
        module: sql`excluded.module`,
        description: sql`excluded.description`,
        routePattern: sql`excluded.route_pattern`,
        actionKey: sql`excluded.action_key`,
        isActive: true,
        metadata: sql`excluded.metadata`,
        updatedAt: sql`now()`,
      },
    });
}
```

- [ ] **Step 5: Implement the plan-binding repository**

```ts
export async function replaceMembershipPlanPermissionBindings(input: {
  planCode: string;
  permissionCodes: string[];
}) {
  const database = requireAdminMutationDatabase('membership plan permissions');

  return database.transaction(async (tx) => {
    const plan = await tx.query.membershipPlans.findFirst({
      where: eq(schema.membershipPlans.code, input.planCode),
      columns: { id: true, code: true },
    });
    if (!plan) {
      throw new Error(`Unknown membership plan: ${input.planCode}`);
    }

    const resources = await tx
      .select({ id: schema.permissionResources.id, code: schema.permissionResources.code })
      .from(schema.permissionResources)
      .where(inArray(schema.permissionResources.code, input.permissionCodes));

    await tx
      .delete(schema.membershipPlanPermissionBindings)
      .where(eq(schema.membershipPlanPermissionBindings.planId, plan.id));

    if (resources.length > 0) {
      await tx.insert(schema.membershipPlanPermissionBindings).values(
        resources.map((resource) => ({
          planId: plan.id,
          permissionResourceId: resource.id,
        })),
      );
    }
  });
}
```

- [ ] **Step 6: Re-run the repository tests**

Run: `pnpm exec tsx --test src/server/repositories/membership-plan-permissions.test.ts`  
Expected: PASS for unique-code and binding/workspace behavior.

- [ ] **Step 7: Commit the repository slice**

```bash
git add src/server/auth/permission-catalog.ts src/server/repositories/permission-resources.ts src/server/repositories/membership-plan-permissions.ts src/server/repositories/membership-plan-permissions.test.ts
git commit -m "feat: add membership plan permission repositories"
```

## Task 3: Implement Runtime Permission Resolution And Guards

**Files:**
- Create: `src/server/auth/permission-service.ts`
- Create: `src/server/auth/permission-service.test.ts`
- Modify: `src/server/auth/guards.ts`
- Modify: `src/app/api/auth/me/route.ts`
- Modify: `src/lib/auth-user.ts`
- Modify: `src/lib/auth-context.tsx`

- [ ] **Step 1: Write failing permission-service tests**

```ts
test('listUserPermissionCodes resolves codes from active entitlement plans only', async () => {
  const codes = await listUserPermissionCodes('user-1', {
    now: new Date('2026-06-03T00:00:00.000Z'),
  });

  assert.deepEqual(codes, ['menu.user_center', 'page.user_center']);
});

test('requireUserPermission throws on missing permission', async () => {
  await assert.rejects(
    () =>
      requireUserPermission(
        { user: { id: 'user-1' } } as Awaited<ReturnType<typeof resolveAuthenticatedSession>>,
        'api.user.points.checkin',
      ),
    /permission_denied/,
  );
});
```

- [ ] **Step 2: Run the permission-service tests**

Run: `pnpm exec tsx --test src/server/auth/permission-service.test.ts`  
Expected: FAIL because the service and helpers do not exist.

- [ ] **Step 3: Implement the permission service**

```ts
export async function listUserPermissionCodes(
  userId: string,
  options?: { now?: Date },
): Promise<string[]> {
  const entitlements = await listActiveUserEntitlements(userId, options?.now);
  const planCodes = Array.from(
    new Set(entitlements.map((entitlement) => entitlement.planCode).filter(Boolean)),
  ) as string[];

  if (planCodes.length === 0) {
    return [];
  }

  return listPermissionCodesForMembershipPlans(planCodes);
}

export async function hasUserPermission(userId: string, code: string) {
  const codes = await listUserPermissionCodes(userId);
  return codes.includes(code);
}

export async function requireUserPermission(session: { user: { id: string } }, code: string) {
  const allowed = await hasUserPermission(session.user.id, code);
  if (!allowed) {
    const error = new Error(`permission_denied:${code}`);
    error.name = 'PermissionDeniedError';
    throw error;
  }
}
```

- [ ] **Step 4: Expose permission codes through `/api/auth/me` and auth state**

```ts
return jsonOk({
  user: {
    id: session.user.id,
    displayName: session.user.displayName,
    membershipLevel: derivedMembershipLevel,
    userLevel: derivedUserLevel,
    permissionCodes: await listUserPermissionCodes(session.user.id),
  },
});
```

Extend the client-side auth types:

```ts
export type AuthenticatedUser = {
  id: string;
  displayName: string;
  membershipLevel: 'free' | 'monthly' | 'yearly';
  userLevel: UserLevel;
  permissionCodes: string[];
};
```

- [ ] **Step 5: Add a reusable route-helper in guards**

```ts
export async function requireAuthenticatedUserPermission(code: string) {
  const session = await requireAuthenticatedSession();
  await requireUserPermission(session, code);
  return session;
}
```

- [ ] **Step 6: Re-run the runtime tests**

Run: `pnpm exec tsx --test src/server/auth/permission-service.test.ts src/lib/auth-user.test.ts`  
Expected: PASS with the new permission code shape and guard behavior.

- [ ] **Step 7: Commit the runtime slice**

```bash
git add src/server/auth/permission-service.ts src/server/auth/permission-service.test.ts src/server/auth/guards.ts src/app/api/auth/me/route.ts src/lib/auth-user.ts src/lib/auth-context.tsx
git commit -m "feat: add runtime user permission service"
```

## Task 4: Build The Admin Permission Module And APIs

**Files:**
- Create: `src/app/api/admin/permissions/resources/route.ts`
- Create: `src/app/api/admin/permissions/plans/[planId]/route.ts`
- Create: `src/app/admin/(console)/permissions/page.tsx`
- Create: `src/features/admin/admin-permissions-module.tsx`
- Modify: `src/features/admin/admin-nav.tsx`

- [ ] **Step 1: Write the failing admin route and module tests**

```ts
test('admin permissions resources route returns grouped resource metrics', async () => {
  const response = await GET(new Request('http://localhost/api/admin/permissions/resources'));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(body.metrics.some((metric: { label: string }) => metric.label === '页面'));
});
```

```tsx
test('admin permissions module shows selected plan bindings', () => {
  render(
    <AdminPermissionsModule
      data={{
        plans: [{ id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly', bindingCount: 2 }],
        resources: [],
        selectedPlanId: 'plan-1',
        selectedCodes: ['page.user_center'],
      }}
    />,
  );

  assert.ok(screen.getByText('Pro Monthly'));
});
```

- [ ] **Step 2: Run the failing admin tests**

Run: `pnpm exec tsx --test src/features/admin/admin-permissions-module.test.tsx src/app/api/admin/permissions/resources/route.test.ts`  
Expected: FAIL because the routes/page/module do not exist.

- [ ] **Step 3: Add the admin API routes**

```ts
export async function GET() {
  await requireAdmin();
  await syncPermissionResourcesFromCatalog();

  return jsonOk(await getAdminPermissionResourceOverview());
}
```

```ts
const bodySchema = z.object({
  permissionCodes: z.array(z.string().min(1)).max(500),
});

export async function PUT(request: Request, context: { params: Promise<{ planId: string }> }) {
  await requireAdmin();
  const body = bodySchema.parse(await request.json());
  const { planId } = await context.params;

  return jsonOk(
    await replaceMembershipPlanPermissionBindingsByPlanId({
      planId,
      permissionCodes: body.permissionCodes,
    }),
  );
}
```

- [ ] **Step 4: Implement the admin module UI**

```tsx
export function AdminPermissionsModule({ data }: AdminPermissionsModuleProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(data.selectedPlanId);
  const [selectedCodes, setSelectedCodes] = useState<string[]>(data.selectedCodes);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-neutral-200 bg-white p-4">
        {data.plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => {
              setSelectedPlanId(plan.id);
              setSelectedCodes(plan.selectedCodes);
            }}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-neutral-50"
          >
            <span>{plan.name}</span>
            <span className="text-xs text-neutral-500">{plan.bindingCount}</span>
          </button>
        ))}
      </aside>
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <Input placeholder="搜索权限编码或名称" />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Add the admin nav entry**

```ts
{ href: '/admin/permissions', label: '权限', icon: KeyRound },
```

- [ ] **Step 6: Re-run the targeted admin tests**

Run: `pnpm exec tsx --test src/features/admin/admin-permissions-module.test.tsx src/app/api/admin/permissions/resources/route.test.ts`  
Expected: PASS for the module render and resource overview route.

- [ ] **Step 7: Commit the admin module slice**

```bash
git add src/app/api/admin/permissions src/app/admin/'(console)'/permissions/page.tsx src/features/admin/admin-permissions-module.tsx src/features/admin/admin-nav.tsx
git commit -m "feat: add admin permission management module"
```

## Task 5: Integrate Permissioned Menus, Pages, Actions, And APIs

**Files:**
- Create: `src/features/public/permissioned-menu.ts`
- Create: `src/features/public/permissioned-menu.test.ts`
- Create: `src/app/forbidden/page.tsx`
- Modify: `src/features/public/home-data.ts`
- Modify: `src/features/public/home-page.tsx`
- Modify: `src/app/home/page.tsx`
- Modify: `src/app/user-center/page.tsx`
- Modify: `src/app/api/user/points/checkin/route.ts`
- Modify: `src/app/api/user/media-assets/route.ts`

- [ ] **Step 1: Write failing menu/action/API integration tests**

```ts
test('filterMenuItemsByPermissions removes items without permission code access', () => {
  const items = [
    { label: '用户中心', href: '/user-center', permissionCode: 'menu.user_center' },
    { label: '商城', href: '/shop' },
  ];

  assert.deepEqual(filterMenuItemsByPermissions(items, []), [
    { label: '商城', href: '/shop' },
  ]);
});
```

```ts
test('user points checkin route returns permission_denied when missing permission', async () => {
  const response = await POST(
    new Request('http://localhost/api/user/points/checkin', {
      method: 'POST',
      body: JSON.stringify({ verificationToken: 'token' }),
    }),
  );

  assert.equal(response.status, 403);
});
```

- [ ] **Step 2: Run the integration tests**

Run: `pnpm exec tsx --test src/features/public/permissioned-menu.test.ts src/app/api/user/points/checkin/route.test.ts`  
Expected: FAIL because menu filtering and permission guards are not wired yet.

- [ ] **Step 3: Implement the menu filter helper and annotate resources**

```ts
export type PermissionedMenuItem = {
  label: string;
  href: string;
  desc?: string;
  permissionCode?: string;
};

export function filterMenuItemsByPermissions(
  items: PermissionedMenuItem[],
  permissionCodes: string[],
) {
  return items.filter((item) => {
    if (!item.permissionCode) {
      return true;
    }
    return permissionCodes.includes(item.permissionCode);
  });
}
```

Annotate selected nav entries:

```ts
{ href: '/user-center', label: '用户中心', permissionCode: 'menu.user_center' }
```

- [ ] **Step 4: Gate home navigation and protected pages/actions**

```tsx
const links = filterMenuItemsByPermissions(nav.publicNavLinks, permissionCodes);
```

In the server page:

```ts
const permissionCodes = session ? await listUserPermissionCodes(session.user.id) : [];
return <HomePage content={content} permissionCodes={permissionCodes} />;
```

For the user center page:

```ts
if (!user.permissionCodes.includes('page.user_center')) {
  router.replace('/forbidden');
  return null;
}
```

Hide the copy-invite action:

```tsx
const canCopyInviteCode = user.permissionCodes.includes('action.user_center.copy_invite_code');
```

- [ ] **Step 5: Guard the write/read APIs**

```ts
const session = await requireAuthenticatedUserPermission('api.user.points.checkin');
```

```ts
const session = await requireAuthenticatedUserPermission('api.user.media_assets.list');
```

- [ ] **Step 6: Re-run the integration tests**

Run: `pnpm exec tsx --test src/features/public/permissioned-menu.test.ts src/app/api/user/points/checkin/route.test.ts src/app/api/user/media-assets/route.test.ts`  
Expected: PASS with unauthorized requests returning `403 permission_denied` and menu filtering hiding gated entries.

- [ ] **Step 7: Commit the runtime integration slice**

```bash
git add src/features/public/permissioned-menu.ts src/features/public/permissioned-menu.test.ts src/features/public/home-data.ts src/features/public/home-page.tsx src/app/home/page.tsx src/app/user-center/page.tsx src/app/api/user/points/checkin/route.ts src/app/api/user/media-assets/route.ts src/app/forbidden/page.tsx
git commit -m "feat: gate user surfaces with membership plan permissions"
```

## Task 6: Verify End-To-End Behavior And Close Documentation Gaps

**Files:**
- Modify: `docs/superpowers/verification/2026-06-03-membership-plan-permission-management.md` if a new verification note is needed
- Modify: any touched tests if final stabilization is required

- [ ] **Step 1: Run focused test suites**

Run: `pnpm exec tsx --test src/server/auth/permission-service.test.ts src/server/repositories/membership-plan-permissions.test.ts src/features/public/permissioned-menu.test.ts`  
Expected: PASS.

- [ ] **Step 2: Run repository-wide validation**

Run: `pnpm validate`  
Expected: PASS.

- [ ] **Step 3: Run the production build**

Run: `pnpm build`  
Expected: PASS.

- [ ] **Step 4: Run database migration and seed locally if infrastructure is available**

Run: `pnpm db:migrate`  
Expected: PASS with the new permission tables applied.

Run: `pnpm db:seed`  
Expected: PASS with permission resources and default bindings inserted.

- [ ] **Step 5: Browser-verify the admin and user flows**

Verify:

- `/admin/permissions` loads and shows resource metrics and plans.
- Updating a plan's permission bindings persists after refresh.
- A user with the bound plan sees the controlled menu/page/action.
- A user without the bound plan does not see the menu and gets the forbidden page or `403` on direct/API access.

- [ ] **Step 6: Record verification results**

If all commands pass, create/update:

```md
# Membership Plan Permission Management Verification

- `pnpm exec tsx --test ...` ✅
- `pnpm validate` ✅
- `pnpm build` ✅
- `pnpm db:migrate` ✅
- `pnpm db:seed` ✅
- Browser verification for `/admin/permissions`, `/home`, `/user-center` ✅
```

If an environment blocker prevents a command, record the exact blocker instead of claiming coverage.

- [ ] **Step 7: Commit final verification/docs updates**

```bash
git add docs/superpowers/verification
git commit -m "docs: record permission management verification"
```

## Self-Review

Spec coverage check:

- Data model: covered by Task 1.
- Code-owned catalog and sync: covered by Task 2.
- Unified runtime permission service and guards: covered by Task 3.
- Admin overview and plan binding module: covered by Task 4.
- Menu/page/action/API integration: covered by Task 5.
- Migration, validation, and browser checks: covered by Task 6.

Placeholder scan:

- No `TODO`, `TBD`, or deferred implementation placeholders remain.
- Every task includes exact files, concrete code targets, and explicit commands.

Type consistency:

- Runtime permission field name is consistently `permissionCodes`.
- Resource identifier is consistently `code`.
- Binding entry uses `planId`/`planCode` and `permissionResourceId`/`permissionCodes` consistently with the schema and repositories.
