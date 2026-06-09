import { NextResponse } from 'next/server';

import {
  EnterpriseOAuthError,
  resolveEnterpriseBearerToken,
  type ResolvedEnterpriseBearerToken,
} from '@/server/enterprise/oauth';
import { EnterpriseGatewayError } from '@/server/enterprise/gateway';

export function createOAuthErrorJsonResponse(error: EnterpriseOAuthError) {
  const headers =
    error.status === 401
      ? { 'WWW-Authenticate': parseBearerAuthorizationHeader(error) }
      : undefined;

  return NextResponse.json(
    {
      error: error.code,
      error_description: error.message,
    },
    { status: error.status, headers },
  );
}

export function parseBearerAuthorizationHeader(error: EnterpriseOAuthError) {
  return `Bearer error="${escapeAuthHeaderValue(error.code)}", error_description="${escapeAuthHeaderValue(toAsciiHeaderDescription(error))}"`;
}

function escapeAuthHeaderValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function toAsciiHeaderDescription(error: EnterpriseOAuthError) {
  const fallback = `Bearer ${error.code}`;
  const normalized = error.message
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
  return normalized.length > 'Bearer'.length ? normalized : fallback;
}

export function enterpriseRouteErrorToJsonResponse(error: unknown) {
  if (error instanceof EnterpriseOAuthError) {
    return createOAuthErrorJsonResponse(error);
  }

  if (error instanceof EnterpriseGatewayError) {
    return NextResponse.json(
      {
        error: error.code,
        error_description: error.message,
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error: 'server_error',
      error_description: '企业 OAuth 请求失败。',
    },
    { status: 500 },
  );
}

export type ProtectedEnterpriseJsonGetDeps<TBody> = {
  resolveEnterpriseBearerToken?: (
    request: Request,
  ) => Promise<ResolvedEnterpriseBearerToken>;
  handleResolvedBearer: (
    resolved: ResolvedEnterpriseBearerToken,
    request: Request,
  ) => Promise<TBody> | TBody;
};

export function createProtectedEnterpriseJsonGet<TBody>({
  resolveEnterpriseBearerToken: resolveBearer = resolveEnterpriseBearerToken,
  handleResolvedBearer,
}: ProtectedEnterpriseJsonGetDeps<TBody>) {
  return async function GET(request: Request) {
    try {
      const resolved = await resolveBearer(request);
      const body = await handleResolvedBearer(resolved, request);
      return NextResponse.json(body);
    } catch (error) {
      return enterpriseRouteErrorToJsonResponse(error);
    }
  };
}
