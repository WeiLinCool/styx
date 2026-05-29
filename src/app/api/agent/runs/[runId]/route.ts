import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { getAgentRunRepository } from '@/server/repositories/agent-runs';

type RouteContext = {
  params: Promise<{
    runId: string;
  }>;
};

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function serviceErrorToResponse(error: unknown) {
  const accountResponse = accountErrorToResponse(error);
  if (accountResponse.body.error.code !== 'internal_error') {
    return NextResponse.json(accountResponse.body, { status: accountResponse.status });
  }

  return jsonError('internal_error', 'AI request failed.', 500);
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireActiveAccount();
    const { runId } = await context.params;
    const run = await getAgentRunRepository().getRunForUser(runId, session.user.id);

    if (!run) {
      return jsonError('run_not_found', 'Agent run was not found.', 404);
    }

    return NextResponse.json({ run });
  } catch (error) {
    return serviceErrorToResponse(error);
  }
}
