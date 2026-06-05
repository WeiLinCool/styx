import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { docBlockSchema } from '@/server/docs/schema';
import { updateDocArticle } from '@/server/repositories/docs';

const paramsSchema = z.object({ articleId: z.uuid() });
const bodySchema = z.object({
  categoryId: z.uuid(),
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  coverImage: z.string().trim().nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  blocks: z.array(docBlockSchema),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ articleId: string }> },
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
        operation: 'POST /api/admin/docs/articles/[articleId]',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const article = await updateDocArticle({
          articleId: params.articleId,
          ...body,
          actorId: session.user.id,
        });
        return NextResponse.json({ ok: true, article }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'Doc article update request is invalid.', issues: error.issues } },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
