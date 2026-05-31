import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { updateAiProviderStatus } from '@/server/repositories/ai-models';

const paramsSchema = z.object({
  providerId: z.uuid(),
});

const bodySchema = z.object({
  status: z.enum(['enabled', 'disabled']),
});

export async function parseAiProviderStatusBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ providerId: string }> },
) {
  try {
    await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const body = await parseAiProviderStatusBody(request);
    const provider = await updateAiProviderStatus({
      providerId: params.providerId,
      status: body.status,
    });

    return NextResponse.json({ ok: true, provider }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'AI provider status request is invalid.',
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
