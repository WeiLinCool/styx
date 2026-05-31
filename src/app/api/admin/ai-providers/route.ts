import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { createAiProvider } from '@/server/repositories/ai-models';

const bodySchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  providerType: z.enum(['openai_compatible', 'development']),
  baseUrl: z.string().trim().min(1).nullable(),
  credentialEnvKey: z.string().trim().min(1).nullable(),
  status: z.enum(['enabled', 'disabled']),
});

export async function parseAiProviderCreateBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await parseAiProviderCreateBody(request);
    const provider = await createAiProvider(body);

    return NextResponse.json({ ok: true, provider }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'AI provider create request is invalid.',
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
