import { NextResponse } from 'next/server';

import {
  exchangeEnterpriseAuthorizationCode,
  validateTokenRequest,
  type EnterpriseTokenRequest,
  type EnterpriseTokenResponse,
} from '@/server/enterprise/oauth';
import { enterpriseRouteErrorToJsonResponse } from '@/server/enterprise/oauth-route-responses';

export type TokenRouteDeps = {
  validateTokenRequest?: (formDataLike: URLSearchParams) => EnterpriseTokenRequest;
  exchangeEnterpriseAuthorizationCode?: (
    input: EnterpriseTokenRequest,
  ) => Promise<EnterpriseTokenResponse>;
};

export async function parseOAuthTokenRequestBody(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams(await request.text());
  }

  const formData = await request.formData();
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      params.set(key, value);
    }
  }
  return params;
}

export function createTokenRoutePost({
  validateTokenRequest: validateRequest = validateTokenRequest,
  exchangeEnterpriseAuthorizationCode: exchangeCode = exchangeEnterpriseAuthorizationCode,
}: TokenRouteDeps = {}) {
  return async function POST(request: Request) {
    try {
      const body = await parseOAuthTokenRequestBody(request);
      const tokenRequest = validateRequest(body);
      const tokenResponse = await exchangeCode(tokenRequest);
      return NextResponse.json(tokenResponse);
    } catch (error) {
      return enterpriseRouteErrorToJsonResponse(error);
    }
  };
}

export const POST = createTokenRoutePost();
