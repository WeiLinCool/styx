import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { updateAiModel } from '@/server/repositories/ai-models';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { adminText } from '@/features/admin/admin-i18n';

const paramsSchema = z.object({
  modelId: z.uuid(),
});

const executionProtocolSchema = z.enum([
  'chat_openai_compatible',
  'image_openai_compatible',
  'video_task_polling',
]);

const bodySchema = z
  .object({
    providerId: z.uuid(),
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    model: z.string().trim().min(1),
    status: z.enum(['enabled', 'disabled']),
    executionProtocol: executionProtocolSchema,
    supportsChat: z.boolean(),
    supportsImageGeneration: z.boolean(),
    supportsImageEdit: z.boolean(),
    supportsImageUpscale: z.boolean(),
    supportsVideoGeneration: z.boolean(),
  })
  .superRefine((body, context) => {
    if (body.supportsChat && body.executionProtocol !== 'chat_openai_compatible') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionProtocol'],
        message: 'Chat-capable models must use a chat execution protocol.',
      });
    }

    if (
      (body.supportsImageGeneration || body.supportsImageEdit || body.supportsImageUpscale) &&
      body.executionProtocol !== 'image_openai_compatible'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionProtocol'],
        message: 'Image-capable models must use an image execution protocol.',
      });
    }

    if (body.supportsVideoGeneration && body.executionProtocol !== 'video_task_polling') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['executionProtocol'],
        message: 'Video-capable models must use a video execution protocol.',
      });
    }
  });

export async function parseAiModelUpdateBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ modelId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/ai-models/[modelId]',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const model = await updateAiModel({
          modelId: params.modelId,
          ...body,
        });

        return NextResponse.json({ ok: true, model }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
            error: {
              code: 'validation_error',
              message: adminText.api.aiModelUpdateInvalid,
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
