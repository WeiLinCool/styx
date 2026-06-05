import { NextResponse } from 'next/server';

import {
  EnterpriseOAuthError,
  resolveEnterpriseBearerToken,
  type ResolvedEnterpriseBearerToken,
} from '@/server/enterprise/oauth';

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
  return `Bearer error="${escapeAuthHeaderValue(error.code)}", error_description="${escapeAuthHeaderValue(error.message)}"`;
}

function escapeAuthHeaderValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function enterpriseRouteErrorToJsonResponse(error: unknown) {
  if (error instanceof EnterpriseOAuthError) {
    return createOAuthErrorJsonResponse(error);
  }

  return NextResponse.json(
    {
      error: 'server_error',
      error_description: 'Enterprise OAuth request failed.',
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
