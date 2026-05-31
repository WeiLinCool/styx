import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { testAiProviderConfiguration } from '@/server/repositories/ai-models';

const paramsSchema = z.object({
  providerId: z.uuid(),
});

const bodySchema = z.object({
  modelId: z.uuid(),
  prompt: z.string().trim().min(1).max(2_000).optional(),
});

export async function parseProviderConfigTestBody(request: Pick<Request, 'json'>) {
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
    const body = await parseProviderConfigTestBody(request);
    const result = await testAiProviderConfiguration({
      providerId: params.providerId,
      modelId: body.modelId,
      prompt: body.prompt,
    });

    return NextResponse.json({
      ok: result.ok,
      result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'AI provider test request is invalid.',
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
