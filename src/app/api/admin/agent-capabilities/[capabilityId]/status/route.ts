import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { updateAgentCapabilityStatus } from '@/server/repositories/agent-capabilities';

const paramsSchema = z.object({
  capabilityId: z.uuid(),
});

const bodySchema = z.object({
  status: z.enum(['enabled', 'disabled', 'archived']),
});

export async function parseAgentCapabilityStatusBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ capabilityId: string }> },
) {
  try {
    await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const body = await parseAgentCapabilityStatusBody(request);
    const capability = await updateAgentCapabilityStatus({
      capabilityId: params.capabilityId,
      status: body.status,
    });

    return NextResponse.json(
      {
        ok: true,
        capability,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Agent capability status request is invalid.',
            issues: error.issues,
          },
        },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
