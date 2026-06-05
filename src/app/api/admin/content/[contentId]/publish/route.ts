import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { updateAdminContentStatus } from '@/server/repositories/content';
import { adminText } from '@/features/admin/admin-i18n';

const paramsSchema = z.object({ contentId: z.uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ contentId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/content/[contentId]/publish',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const content = await updateAdminContentStatus({
          contentId: params.contentId,
          action: 'publish',
        });
        return NextResponse.json({ ok: true, content }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
            error: {
              code: 'validation_error',
              message: adminText.api.contentStatusInvalid,
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
