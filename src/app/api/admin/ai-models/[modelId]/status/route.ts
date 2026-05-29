import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { updateAiModelStatus } from '@/server/repositories/ai-models';

const paramsSchema = z.object({
  modelId: z.uuid(),
});

const bodySchema = z.object({
  status: z.enum(['enabled', 'disabled']),
});

export async function parseAiModelStatusBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ modelId: string }> },
) {
  try {
    await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const body = await parseAiModelStatusBody(request);
    const model = await updateAiModelStatus({
      modelId: params.modelId,
      status: body.status,
    });

    return NextResponse.json(
      {
        ok: true,
        model,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'AI model status request is invalid.',
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
