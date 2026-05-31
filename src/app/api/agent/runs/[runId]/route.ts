import { NextResponse } from 'next/server';

import { createDeleteAgentRunResponse, serviceErrorToResponse } from '../route';
import { requireActiveAccount } from '@/server/auth/guards';
import { getAgentRunRepository } from '@/server/repositories/agent-runs';

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireActiveAccount();
    const { runId } = await context.params;
    const detail = await getAgentRunRepository().getRunDetailForUser(runId, session.user.id);

    if (!detail) {
      return NextResponse.json({ error: { code: 'run_not_found', message: 'Agent run was not found.' } }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return serviceErrorToResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requireActiveAccount();
    const { runId } = await context.params;
    const run = await getAgentRunRepository().softDeleteRunForUser(runId, session.user.id);

    return createDeleteAgentRunResponse(run);
  } catch (error) {
    return serviceErrorToResponse(error);
  }
}
