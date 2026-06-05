import { NextResponse } from 'next/server';

import { serviceErrorToResponse } from '../../route';
import { createAgentRunService } from '@/server/agent/run-service';
import { createDeterministicPiRuntime } from '@/server/agent/pi-runtime';
import { requireActiveAccount } from '@/server/auth/guards';
import { runProtectedMutation } from '@/server/api-request-guard';
import { getAgentRunRepository } from '@/server/repositories/agent-runs';

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

export function createSyncAgentRunResponse(run: Awaited<ReturnType<ReturnType<typeof createService>['syncVideoAgentRunForUser']>>) {
  return NextResponse.json({ run });
}

function createService() {
  return createAgentRunService({
    repository: getAgentRunRepository(),
    runtime: createDeterministicPiRuntime(),
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireActiveAccount();
    const { runId } = await context.params;

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'POST /api/agent/runs/[runId]/sync',
        actorType: 'user',
        actorId: session.user.id,
        rawBody: '',
        parsedBody: null,
      },
      async () => {
        const run = await createService().syncVideoAgentRunForUser(session.user.id, runId);
        return createSyncAgentRunResponse(run);
      },
    );
  } catch (error) {
    return serviceErrorToResponse(error);
  }
}
