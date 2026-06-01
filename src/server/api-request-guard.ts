import { NextResponse } from 'next/server';

import {
  buildRawRequestBodyHash,
  evaluateRequestProtection,
  protectionFailureResponseBody,
  type RouteProtectionKind,
} from './request-security';
import { decryptRequestBody, isEncryptedRequestEnvelope } from '@/lib/request-encryption';
import {
  getRequestIdempotencyStore,
  idempotencyErrorToResponse,
  type IdempotentResponseSummary,
  type RequestIdempotencyActorType,
  type RequestIdempotencyScope,
} from './repositories/request-idempotency';

export type ProtectedRequestContext = {
  request: Request;
  routeKind: RouteProtectionKind;
  operation: string;
  actorType: RequestIdempotencyActorType;
  actorId: string | null;
  rawBody?: string | null;
  parsedBody?: unknown;
};

export async function runProtectedMutation(
  context: ProtectedRequestContext,
  operation: () => Promise<Response>,
) {
  const url = new URL(context.request.url);
  const rawBody = context.rawBody ?? null;
  const protection = evaluateRequestProtection({
    routeKind: context.routeKind,
    method: context.request.method,
    pathname: url.pathname,
    requestUrl: context.request.url,
    headers: context.request.headers,
    rawBody,
    body: context.parsedBody,
  });

  if (!protection.allowed) {
    return NextResponse.json(protectionFailureResponseBody(protection), {
      status: protection.status,
    });
  }

  const idempotencyKey = context.request.headers.get('Idempotency-Key')?.trim();
  if (!idempotencyKey) {
    return NextResponse.json(
      {
        error: {
          code: 'idempotency_key_required',
          message: 'idempotency_key_required',
        },
      },
      { status: 400 },
    );
  }

  try {
    const store = getRequestIdempotencyStore();
    const scope: RequestIdempotencyScope = {
      actorType: context.actorType,
      actorId: context.actorId,
      operation: context.operation,
      key: idempotencyKey,
      bodyHash: protection.bodyHash ?? buildRawRequestBodyHash(rawBody ?? ''),
    };
    const record = await store.begin(scope);
    if (record.status === 'completed' && record.responseSummary) {
      return summaryToResponse(record.responseSummary, true);
    }

    try {
      const response = await operation();
      await store.complete(scope, await responseToSummary(response.clone()));
      return response;
    } catch (error) {
      await store.fail(scope).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const idempotencyResponse = idempotencyErrorToResponse(error);
    if (idempotencyResponse) {
      return NextResponse.json(idempotencyResponse.body, {
        status: idempotencyResponse.status,
      });
    }

    throw error;
  }
}

export async function readJsonBody(request: Request) {
  const rawBody = await request.text();
  const parsedRawBody = rawBody ? JSON.parse(rawBody) : null;
  if (isEncryptedRequestEnvelope(parsedRawBody)) {
    const decrypted = await decryptRequestBody(parsedRawBody);
    return {
      rawBody,
      body: decrypted ? JSON.parse(decrypted) : null,
    };
  }

  return {
    rawBody,
    body: parsedRawBody,
  };
}

async function responseToSummary(response: Response): Promise<IdempotentResponseSummary> {
  const contentType = response.headers.get('content-type') ?? '';
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') {
      headers[key] = value;
    }
  });

  return {
    status: response.status,
    body: contentType.includes('application/json') ? await response.json() : await response.text(),
    headers,
  };
}

function summaryToResponse(summary: IdempotentResponseSummary, replayed: boolean) {
  const headers = new Headers(summary.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (replayed) {
    headers.set('x-idempotency-replayed', 'true');
  }

  return new Response(
    typeof summary.body === 'string' && !headers.get('content-type')?.includes('application/json')
      ? summary.body
      : JSON.stringify(summary.body),
    {
      status: summary.status,
      headers,
    },
  );
}
