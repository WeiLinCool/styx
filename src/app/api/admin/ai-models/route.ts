import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { createAiModel } from '@/server/repositories/ai-models';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { adminText } from '@/features/admin/admin-i18n';

const bodySchema = z.object({
  providerId: z.uuid(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  model: z.string().trim().min(1),
  status: z.enum(['enabled', 'disabled']),
  supportsChat: z.boolean(),
  supportsImageGeneration: z.boolean(),
  supportsImageEdit: z.boolean(),
  supportsImageUpscale: z.boolean(),
  supportsVideoGeneration: z.boolean(),
});

export async function parseAiModelCreateBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/ai-models',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const model = await createAiModel(body);

        return NextResponse.json({ ok: true, model }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
            error: {
              code: 'validation_error',
              message: adminText.api.aiModelCreateInvalid,
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
