import { NextResponse } from 'next/server';

import {
  EnterpriseGatewayError,
  createEnterpriseChatCompletion,
  parseOpenAiChatCompletionBody,
  requireEnterpriseModelProxy,
  streamEnterpriseChatCompletion,
} from '@/server/enterprise/gateway';
import { resolveEnterpriseBearerToken } from '@/server/enterprise/oauth';
import { enterpriseRouteErrorToJsonResponse } from '@/server/enterprise/oauth-route-responses';

export type EnterpriseChatCompletionsRouteDeps = {
  resolveEnterpriseBearerToken?: typeof resolveEnterpriseBearerToken;
  requireEnterpriseModelProxy?: typeof requireEnterpriseModelProxy;
  createEnterpriseChatCompletion?: typeof createEnterpriseChatCompletion;
  streamEnterpriseChatCompletion?: typeof streamEnterpriseChatCompletion;
};

export function createEnterpriseChatCompletionsRoutePost({
  resolveEnterpriseBearerToken: resolveBearer = resolveEnterpriseBearerToken,
  requireEnterpriseModelProxy: requireModelProxy = requireEnterpriseModelProxy,
  createEnterpriseChatCompletion: createCompletion = createEnterpriseChatCompletion,
  streamEnterpriseChatCompletion: streamCompletion = streamEnterpriseChatCompletion,
}: EnterpriseChatCompletionsRouteDeps = {}) {
  return async function POST(request: Request) {
    try {
      const resolved = await resolveBearer(request);
      await requireModelProxy(resolved.user.id);
      const parsedBody = parseOpenAiChatCompletionBody(await readJsonBody(request));

      if (parsedBody.stream) {
        const stream = await streamCompletion({
          userId: resolved.user.id,
          request: parsedBody,
        });

        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
        });
      }

      return NextResponse.json(
        await createCompletion({
          userId: resolved.user.id,
          request: parsedBody,
        }),
      );
    } catch (error) {
      return enterpriseRouteErrorToJsonResponse(error);
    }
  };
}

export const POST = createEnterpriseChatCompletionsRoutePost();

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new EnterpriseGatewayError('invalid_request', 'Request body must be valid JSON.', 400);
  }
}
