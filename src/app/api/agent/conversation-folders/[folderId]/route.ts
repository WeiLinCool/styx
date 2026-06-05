import { z } from 'zod';

import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { requireActiveAccount } from '@/server/auth/guards';
import { getAgentConversationRepository } from '@/server/repositories/agent-conversations';
import {
  createAgentConversationFolderResponse,
  folderRouteErrorToResponse,
  parseUpdateAgentConversationFolderBody,
} from '../route-helpers';

type RouteContext = {
  params: Promise<{
    folderId: string;
  }>;
};

const folderIdSchema = z.string().uuid('folderId must be a valid UUID.');

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireActiveAccount();
    const { folderId } = await context.params;
    const parsedFolderId = folderIdSchema.parse(folderId);
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = parseUpdateAgentConversationFolderBody(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'PATCH /api/agent/conversation-folders/[folderId]',
        actorType: 'user',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const folder = await getAgentConversationRepository().updateFolder(
          parsedFolderId,
          session.user.id,
          body,
        );

        return createAgentConversationFolderResponse(folder);
      },
    );
  } catch (error) {
    return folderRouteErrorToResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireActiveAccount();
    const { folderId } = await context.params;
    const parsedFolderId = folderIdSchema.parse(folderId);

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'DELETE /api/agent/conversation-folders/[folderId]',
        actorType: 'user',
        actorId: session.user.id,
        rawBody: '',
        parsedBody: null,
      },
      async () => {
        const folder = await getAgentConversationRepository().deleteFolder(
          parsedFolderId,
          session.user.id,
        );

        return createAgentConversationFolderResponse(folder);
      },
    );
  } catch (error) {
    return folderRouteErrorToResponse(error);
  }
}
