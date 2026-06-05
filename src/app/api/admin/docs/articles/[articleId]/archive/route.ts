import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { updateDocArticleStatus } from '@/server/repositories/docs';

const paramsSchema = z.object({ articleId: z.uuid() });

export async function POST(
  request: Request,
  context: { params: Promise<{ articleId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/docs/articles/[articleId]/archive',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const article = await updateDocArticleStatus({ articleId: params.articleId, status: 'archived' });
        return NextResponse.json({ ok: true, article }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'Doc archive request is invalid.', issues: error.issues } },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
