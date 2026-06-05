import { requireActiveAccount } from '@/server/auth/guards';
import { getAgentConversationRepository } from '@/server/repositories/agent-conversations';
import {
  conversationRouteErrorToResponse,
  createAgentConversationListResponse,
} from './route-helpers';

export async function GET() {
  try {
    const session = await requireActiveAccount();
    const list = await getAgentConversationRepository().listForUser(session.user.id);

    return createAgentConversationListResponse(list);
  } catch (error) {
    return conversationRouteErrorToResponse(error);
  }
}
