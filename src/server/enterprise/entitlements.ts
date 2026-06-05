import {
  listAvailableChatModelsForUser,
  type PublicChatModelDto,
} from '@/server/repositories/ai-models';

export type EnterpriseEntitlementName =
  | 'all'
  | 'models:proxy'
  | 'agents:multi'
  | 'flows:advanced'
  | 'integrations:premium'
  | 'memory:cloud-sync'
  | 'security:audit-log'
  | 'teams:workspace'
  | 'billing:admin';

export type EnterpriseEntitlementsResponse = {
  plan: 'enterprise' | 'enterprise-limited';
  entitlements: EnterpriseEntitlementName[];
};

export type EnterpriseEntitlementDeps = {
  listAvailableChatModelsForUser: (userId: string) => Promise<PublicChatModelDto[]>;
};

const defaultDeps: EnterpriseEntitlementDeps = {
  listAvailableChatModelsForUser,
};

export async function resolveEnterpriseEntitlements(
  userId: string,
  deps: EnterpriseEntitlementDeps = defaultDeps,
): Promise<EnterpriseEntitlementsResponse> {
  const models = await deps.listAvailableChatModelsForUser(userId);
  const entitlements: EnterpriseEntitlementName[] = models.length > 0 ? ['models:proxy'] : [];

  return {
    plan: entitlements.length > 0 ? 'enterprise' : 'enterprise-limited',
    entitlements,
  };
}

export function hasEnterpriseEntitlement(
  entitlements: readonly EnterpriseEntitlementName[],
  required: EnterpriseEntitlementName,
) {
  return entitlements.includes('all') || entitlements.includes(required);
}
