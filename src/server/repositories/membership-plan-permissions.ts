import { asc, eq, inArray } from 'drizzle-orm';

import { db, schema } from '@/server/db';
import { permissionCatalog, type PermissionResourceType } from '@/server/auth/permission-catalog';
import { ensureAdminReadSource } from './admin-shared';

type WorkspacePlan = {
  id: string;
  code: string;
  name: string;
};

type WorkspaceModuleGroup = {
  key: string;
  label: string;
  resources: Array<{
    id: string;
    code: string;
    name: string;
    resourceType: PermissionResourceType;
    description: string;
    routePattern: string | null;
    actionKey: string | null;
    dependsOn: string[];
    recommendedWith: string[];
  }>;
};

export type MembershipPlanPermissionWorkspace = {
  plan: WorkspacePlan;
  plans: WorkspacePlan[];
  selectedCodes: string[];
  modules: WorkspaceModuleGroup[];
};

export const defaultMembershipPlanPermissionCodes: Record<string, string[]> = {
  'pro-monthly': ['page.user_center', 'action.user_center.copy_invite_code'],
  'team-yearly': ['page.user_center'],
};

const seedPlans: WorkspacePlan[] = [
  { id: 'seed:pro-monthly', code: 'pro-monthly', name: 'Pro Monthly' },
  { id: 'seed:team-yearly', code: 'team-yearly', name: 'Team Yearly' },
];

const seedBindings = new Map<string, string[]>(
  Object.entries(defaultMembershipPlanPermissionCodes).map(([planCode, codes]) => [planCode, [...codes]]),
);

function groupResources() {
  const grouped = new Map<string, WorkspaceModuleGroup>();

  for (const resource of permissionCatalog) {
    const key = resource.module;
    const existing = grouped.get(key) ?? {
      key,
      label: key,
      resources: [],
    };

    existing.resources.push({
      id: `seed:${resource.code}`,
      code: resource.code,
      name: resource.name,
      resourceType: resource.resourceType,
      description: resource.description,
      routePattern: resource.routePattern ?? null,
      actionKey: resource.actionKey ?? null,
      dependsOn: resource.dependsOn ?? [],
      recommendedWith: resource.recommendedWith ?? [],
    });

    grouped.set(key, existing);
  }

  return [...grouped.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function createMembershipPlanPermissionRepositoryHarness(initial = seedBindings) {
  const bindings = new Map<string, string[]>(
    [...initial.entries()].map(([planCode, codes]) => [planCode, [...codes].sort()]),
  );

  return {
    async replaceMembershipPlanPermissionBindings(input: {
      planCode: string;
      permissionCodes: string[];
    }) {
      bindings.set(input.planCode, [...new Set(input.permissionCodes)].sort());
    },
    async listMembershipPlanPermissionCodes(planCode: string) {
      return [...(bindings.get(planCode) ?? [])].sort();
    },
  };
}

function requireDb(operation: string) {
  if (!db || !process.env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is required for ${operation}.`);
  }

  return db;
}

export async function listMembershipPlanPermissionCodes(planCode: string): Promise<string[]> {
  const database = ensureAdminReadSource('membership plan permissions');
  if (!database) {
    return [...(seedBindings.get(planCode) ?? [])].sort();
  }

  const rows = await database
    .select({ code: schema.permissionResources.code })
    .from(schema.membershipPlanPermissionBindings)
    .innerJoin(
      schema.membershipPlans,
      eq(schema.membershipPlans.id, schema.membershipPlanPermissionBindings.planId),
    )
    .innerJoin(
      schema.permissionResources,
      eq(
        schema.permissionResources.id,
        schema.membershipPlanPermissionBindings.permissionResourceId,
      ),
    )
    .where(eq(schema.membershipPlans.code, planCode))
    .orderBy(asc(schema.permissionResources.code));

  return rows.map((row) => row.code);
}

export async function listPermissionCodesForMembershipPlans(planCodes: string[]): Promise<string[]> {
  if (planCodes.length === 0) {
    return [];
  }

  const database = ensureAdminReadSource('membership plan permissions');
  if (!database) {
    return [...new Set(planCodes.flatMap((planCode) => seedBindings.get(planCode) ?? []))].sort();
  }

  const rows = await database
    .select({ code: schema.permissionResources.code })
    .from(schema.membershipPlanPermissionBindings)
    .innerJoin(
      schema.membershipPlans,
      eq(schema.membershipPlans.id, schema.membershipPlanPermissionBindings.planId),
    )
    .innerJoin(
      schema.permissionResources,
      eq(
        schema.permissionResources.id,
        schema.membershipPlanPermissionBindings.permissionResourceId,
      ),
    )
    .where(inArray(schema.membershipPlans.code, planCodes))
    .orderBy(asc(schema.permissionResources.code));

  return [...new Set(rows.map((row) => row.code))];
}

export async function replaceMembershipPlanPermissionBindings(input: {
  planCode: string;
  permissionCodes: string[];
}) {
  const database = requireDb('membership plan permission mutations');

  return database.transaction(async (tx) => {
    const plan = await tx.query.membershipPlans.findFirst({
      where: eq(schema.membershipPlans.code, input.planCode),
      columns: { id: true, code: true },
    });

    if (!plan) {
      throw new Error(`Unknown membership plan: ${input.planCode}`);
    }

    const uniqueCodes = [...new Set(input.permissionCodes)].sort();
    const resources =
      uniqueCodes.length === 0
        ? []
        : await tx
            .select({
              id: schema.permissionResources.id,
              code: schema.permissionResources.code,
            })
            .from(schema.permissionResources)
            .where(inArray(schema.permissionResources.code, uniqueCodes));

    if (resources.length !== uniqueCodes.length) {
      const known = new Set(resources.map((resource) => resource.code));
      const missing = uniqueCodes.filter((code) => !known.has(code));
      throw new Error(`Unknown permission codes: ${missing.join(', ')}`);
    }

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

    return {
      planCode: plan.code,
      permissionCodes: uniqueCodes,
    };
  });
}

export async function replaceMembershipPlanPermissionBindingsByPlanId(input: {
  planId: string;
  permissionCodes: string[];
}) {
  const database = requireDb('membership plan permission mutations');
  const plan = await database.query.membershipPlans.findFirst({
    where: eq(schema.membershipPlans.id, input.planId),
    columns: { code: true },
  });

  if (!plan) {
    throw new Error(`Unknown membership plan id: ${input.planId}`);
  }

  return replaceMembershipPlanPermissionBindings({
    planCode: plan.code,
    permissionCodes: input.permissionCodes,
  });
}

export async function listMembershipPlanPermissionWorkspace(
  planCode: string,
): Promise<MembershipPlanPermissionWorkspace> {
  const database = ensureAdminReadSource('membership plan permissions');
  if (!database) {
    const plan = seedPlans.find((item) => item.code === planCode) ?? seedPlans[0]!;
    return {
      plan,
      plans: seedPlans,
      selectedCodes: [...(seedBindings.get(plan.code) ?? [])].sort(),
      modules: groupResources(),
    };
  }

  const plans = await database
    .select({
      id: schema.membershipPlans.id,
      code: schema.membershipPlans.code,
      name: schema.membershipPlans.name,
    })
    .from(schema.membershipPlans)
    .orderBy(asc(schema.membershipPlans.sortOrder), asc(schema.membershipPlans.code));

  const selectedPlan = plans.find((item) => item.code === planCode) ?? plans[0];
  if (!selectedPlan) {
    throw new Error('No membership plans are available for permission binding.');
  }

  const resources = await database
    .select()
    .from(schema.permissionResources)
    .orderBy(asc(schema.permissionResources.module), asc(schema.permissionResources.code));

  const selectedCodes = await listMembershipPlanPermissionCodes(selectedPlan.code);
  const grouped = new Map<string, WorkspaceModuleGroup>();

  for (const resource of resources) {
    const key = resource.module;
    const existing = grouped.get(key) ?? { key, label: key, resources: [] };

    existing.resources.push({
      id: resource.id,
      code: resource.code,
      name: resource.name,
      resourceType: resource.resourceType,
      description: resource.description ?? '',
      routePattern: resource.routePattern,
      actionKey: resource.actionKey,
      dependsOn: Array.isArray(resource.metadata.dependsOn)
        ? resource.metadata.dependsOn.filter((value): value is string => typeof value === 'string')
        : [],
      recommendedWith: Array.isArray(resource.metadata.recommendedWith)
        ? resource.metadata.recommendedWith.filter((value): value is string => typeof value === 'string')
        : [],
    });

    grouped.set(key, existing);
  }

  return {
    plan: selectedPlan,
    plans,
    selectedCodes,
    modules: [...grouped.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

export async function listMembershipPlanPermissionWorkspaceByPlanId(
  planId: string,
): Promise<MembershipPlanPermissionWorkspace> {
  const database = ensureAdminReadSource('membership plan permissions');
  if (!database) {
    const plan = seedPlans.find((item) => item.id === planId) ?? seedPlans[0]!;
    return listMembershipPlanPermissionWorkspace(plan.code);
  }

  const plan = await database.query.membershipPlans.findFirst({
    where: eq(schema.membershipPlans.id, planId),
    columns: { code: true },
  });

  if (!plan) {
    throw new Error(`Unknown membership plan id: ${planId}`);
  }

  return listMembershipPlanPermissionWorkspace(plan.code);
}
