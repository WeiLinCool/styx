import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { requireActiveAccount } from '@/server/auth/guards';
import { getAgentConversationRepository } from '@/server/repositories/agent-conversations';
import {
  createAgentConversationFolderResponse,
  folderRouteErrorToResponse,
  parseCreateAgentConversationFolderBody,
} from './route-helpers';

export async function POST(request: Request) {
  try {
    const session = await requireActiveAccount();
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = parseCreateAgentConversationFolderBody(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'POST /api/agent/conversation-folders',
        actorType: 'user',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const folder = await getAgentConversationRepository().createFolder({
          userId: session.user.id,
          name: body.name,
        });

        return createAgentConversationFolderResponse(folder);
      },
    );
  } catch (error) {
    return folderRouteErrorToResponse(error);
  }
}
