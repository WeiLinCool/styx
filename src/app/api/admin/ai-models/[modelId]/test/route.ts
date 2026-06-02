import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAgentRunService } from '@/server/agent/run-service';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { testAiModelConfiguration } from '@/server/repositories/ai-models';

const paramsSchema = z.object({
  modelId: z.uuid(),
});

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(2_000).optional(),
});

export async function parseAiModelConfigTestBody(request: Pick<Request, 'json'>) {
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
    const body = await parseAiModelConfigTestBody(request);
    const result = await testAiModelConfiguration({
      modelId: params.modelId,
      prompt: body.prompt,
      createAgentRunService,
    });

    return NextResponse.json({ ok: result.ok, result }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'AI model test request is invalid.',
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
