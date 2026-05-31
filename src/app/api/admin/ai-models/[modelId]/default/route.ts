import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { setDefaultAiChatModel } from '@/server/repositories/ai-models';

const paramsSchema = z.object({
  modelId: z.uuid(),
});

export async function parseAiModelDefaultParams(
  params: Promise<{ modelId: string }>,
) {
  return paramsSchema.parse(await params);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ modelId: string }> },
) {
  try {
    await requireAdmin();
    const params = await parseAiModelDefaultParams(context.params);
    const model = await setDefaultAiChatModel({
      modelId: params.modelId,
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
            message: 'AI model default request is invalid.',
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
