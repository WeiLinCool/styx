import { NextResponse } from 'next/server';

import { listEnterpriseOpenAiModels } from '@/server/enterprise/gateway';
import { enterpriseRouteErrorToJsonResponse } from '@/server/enterprise/oauth-route-responses';
import { resolveEnterpriseBearerToken } from '@/server/enterprise/oauth';

export type EnterpriseModelsRouteDeps = {
  resolveEnterpriseBearerToken?: typeof resolveEnterpriseBearerToken;
  listEnterpriseOpenAiModels?: typeof listEnterpriseOpenAiModels;
};

export function createEnterpriseModelsRouteGet({
  resolveEnterpriseBearerToken: resolveBearer = resolveEnterpriseBearerToken,
  listEnterpriseOpenAiModels: listModels = listEnterpriseOpenAiModels,
}: EnterpriseModelsRouteDeps = {}) {
  return async function GET(request: Request) {
    try {
      const resolved = await resolveBearer(request);
      return NextResponse.json(await listModels(resolved.user.id));
    } catch (error) {
      return enterpriseRouteErrorToJsonResponse(error);
    }
  };
}

export const GET = createEnterpriseModelsRouteGet();
