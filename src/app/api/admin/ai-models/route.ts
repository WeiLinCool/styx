import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { createAiModel } from '@/server/repositories/ai-models';

const bodySchema = z.object({
  providerId: z.uuid(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  model: z.string().trim().min(1),
  status: z.enum(['enabled', 'disabled']),
  supportsChat: z.boolean(),
});

export async function parseAiModelCreateBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await parseAiModelCreateBody(request);
    const model = await createAiModel(body);

    return NextResponse.json({ ok: true, model }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'AI model create request is invalid.',
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
