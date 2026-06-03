import { asc, eq, sql } from 'drizzle-orm';

import { db, schema } from '@/server/db';
import {
  permissionCatalog,
  type PermissionResourceDefinition,
} from '@/server/auth/permission-catalog';
import {
  type AdminFilter,
  type AdminMetric,
  type AdminModuleData,
  ensureAdminReadSource,
} from './admin-shared';

export type PermissionResourceRecord = {
  id: string;
  code: string;
  name: string;
  resourceType: PermissionResourceDefinition['resourceType'];
  module: string;
  description: string;
  routePattern: string | null;
  actionKey: string | null;
  isActive: boolean;
  dependsOn: string[];
  recommendedWith: string[];
};

export type AdminPermissionResourceOverview = AdminModuleData<PermissionResourceRecord>;

function toRecord(
  resource: PermissionResourceDefinition,
  id = `seed:${resource.code}`,
): PermissionResourceRecord {
  return {
    id,
    code: resource.code,
    name: resource.name,
    resourceType: resource.resourceType,
    module: resource.module,
    description: resource.description,
    routePattern: resource.routePattern ?? null,
    actionKey: resource.actionKey ?? null,
    isActive: true,
    dependsOn: resource.dependsOn ?? [],
    recommendedWith: resource.recommendedWith ?? [],
  };
}

function buildOverview(records: PermissionResourceRecord[]): AdminPermissionResourceOverview {
  const counts = {
    menu: records.filter((record) => record.resourceType === 'menu').length,
    page: records.filter((record) => record.resourceType === 'page').length,
    action: records.filter((record) => record.resourceType === 'action').length,
    api: records.filter((record) => record.resourceType === 'api').length,
  };

  const metrics: AdminMetric[] = [
    { label: '菜单', value: String(counts.menu), hint: 'menu', tone: 'info' },
    { label: '页面', value: String(counts.page), hint: 'page', tone: 'success' },
    { label: '按钮', value: String(counts.action), hint: 'action', tone: 'default' },
    { label: '接口', value: String(counts.api), hint: 'api', tone: 'warning' },
  ];

  const filters: AdminFilter[] = [
    { label: 'All', value: 'all', count: records.length },
    { label: 'Menu', value: 'menu', count: counts.menu },
    { label: 'Page', value: 'page', count: counts.page },
    { label: 'Action', value: 'action', count: counts.action },
    { label: 'API', value: 'api', count: counts.api },
  ];

  return {
    source: 'seed',
    metrics,
    filters,
    records,
  };
}

export async function syncPermissionResourcesFromCatalog() {
  if (!db || !process.env.DATABASE_URL) {
    return { source: 'seed' as const, count: permissionCatalog.length };
  }

  await db
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

  return { source: 'database' as const, count: permissionCatalog.length };
}

export async function getAdminPermissionResourceOverview(): Promise<AdminPermissionResourceOverview> {
  const database = ensureAdminReadSource('permissions');
  if (!database) {
    return buildOverview(permissionCatalog.map((resource) => toRecord(resource)));
  }

  const rows = await database
    .select()
    .from(schema.permissionResources)
    .orderBy(asc(schema.permissionResources.module), asc(schema.permissionResources.code));

  return {
    source: 'database',
    ...buildOverview(
      rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        resourceType: row.resourceType,
        module: row.module,
        description: row.description ?? '',
        routePattern: row.routePattern,
        actionKey: row.actionKey,
        isActive: row.isActive,
        dependsOn: Array.isArray(row.metadata.dependsOn)
          ? row.metadata.dependsOn.filter((value): value is string => typeof value === 'string')
          : [],
        recommendedWith: Array.isArray(row.metadata.recommendedWith)
          ? row.metadata.recommendedWith.filter((value): value is string => typeof value === 'string')
          : [],
      })),
    ).records,
    metrics: buildOverview(
      rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        resourceType: row.resourceType,
        module: row.module,
        description: row.description ?? '',
        routePattern: row.routePattern,
        actionKey: row.actionKey,
        isActive: row.isActive,
        dependsOn: Array.isArray(row.metadata.dependsOn)
          ? row.metadata.dependsOn.filter((value): value is string => typeof value === 'string')
          : [],
        recommendedWith: Array.isArray(row.metadata.recommendedWith)
          ? row.metadata.recommendedWith.filter((value): value is string => typeof value === 'string')
          : [],
      })),
    ).metrics,
    filters: buildOverview(
      rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        resourceType: row.resourceType,
        module: row.module,
        description: row.description ?? '',
        routePattern: row.routePattern,
        actionKey: row.actionKey,
        isActive: row.isActive,
        dependsOn: Array.isArray(row.metadata.dependsOn)
          ? row.metadata.dependsOn.filter((value): value is string => typeof value === 'string')
          : [],
        recommendedWith: Array.isArray(row.metadata.recommendedWith)
          ? row.metadata.recommendedWith.filter((value): value is string => typeof value === 'string')
          : [],
      })),
    ).filters,
  };
}

export async function listPermissionResourcesByCodes(codes: string[]) {
  if (codes.length === 0) {
    return [];
  }

  if (!db || !process.env.DATABASE_URL) {
    return permissionCatalog
      .filter((resource) => codes.includes(resource.code))
      .map((resource) => toRecord(resource));
  }

  const rows = await db.query.permissionResources.findMany({
    where: (table, { inArray }) => inArray(table.code, codes),
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    resourceType: row.resourceType,
    module: row.module,
    description: row.description ?? '',
    routePattern: row.routePattern,
    actionKey: row.actionKey,
    isActive: row.isActive,
    dependsOn: Array.isArray(row.metadata.dependsOn)
      ? row.metadata.dependsOn.filter((value): value is string => typeof value === 'string')
      : [],
    recommendedWith: Array.isArray(row.metadata.recommendedWith)
      ? row.metadata.recommendedWith.filter((value): value is string => typeof value === 'string')
      : [],
  }));
}

export async function findPermissionResourceByCode(code: string) {
  if (!db || !process.env.DATABASE_URL) {
    const record = permissionCatalog.find((resource) => resource.code === code);
    return record ? toRecord(record) : null;
  }

  const row = await db.query.permissionResources.findFirst({
    where: eq(schema.permissionResources.code, code),
  });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    resourceType: row.resourceType,
    module: row.module,
    description: row.description ?? '',
    routePattern: row.routePattern,
    actionKey: row.actionKey,
    isActive: row.isActive,
    dependsOn: Array.isArray(row.metadata.dependsOn)
      ? row.metadata.dependsOn.filter((value): value is string => typeof value === 'string')
      : [],
    recommendedWith: Array.isArray(row.metadata.recommendedWith)
      ? row.metadata.recommendedWith.filter((value): value is string => typeof value === 'string')
      : [],
  };
}
