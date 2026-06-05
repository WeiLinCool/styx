import { z } from 'zod';

import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { requireActiveAccount } from '@/server/auth/guards';
import { getAgentConversationRepository } from '@/server/repositories/agent-conversations';
import {
  conversationRouteErrorToResponse,
  createAgentConversationUpdateResponse,
  parseUpdateAgentConversationBody,
} from '../route-helpers';

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

const conversationIdSchema = z.string().uuid('conversationId must be a valid UUID.');

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireActiveAccount();
    const { conversationId } = await context.params;
    const parsedConversationId = conversationIdSchema.parse(conversationId);
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = parseUpdateAgentConversationBody(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'PATCH /api/agent/conversations/[conversationId]',
        actorType: 'user',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const conversation = await getAgentConversationRepository().updateConversation(
          parsedConversationId,
          session.user.id,
          body,
        );

        return createAgentConversationUpdateResponse(conversation);
      },
    );
  } catch (error) {
    return conversationRouteErrorToResponse(error);
  }
}
