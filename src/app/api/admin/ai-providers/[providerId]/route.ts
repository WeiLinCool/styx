import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { updateAiProvider } from '@/server/repositories/ai-models';

const paramsSchema = z.object({
  providerId: z.uuid(),
});

const bodySchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  providerType: z.enum(['openai_compatible', 'development']),
  baseUrl: z.string().trim().min(1).nullable(),
  credentialEnvKey: z.string().trim().min(1).nullable(),
  status: z.enum(['enabled', 'disabled']),
});

export async function parseAiProviderUpdateBody(request: Pick<Request, 'json'>) {
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
    const body = await parseAiProviderUpdateBody(request);
    const provider = await updateAiProvider({
      providerId: params.providerId,
      ...body,
    });

    return NextResponse.json({ ok: true, provider }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'AI provider update request is invalid.',
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
