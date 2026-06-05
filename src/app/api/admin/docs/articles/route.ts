import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { docBlockSchema } from '@/server/docs/schema';
import { createDocArticle } from '@/server/repositories/docs';

const bodySchema = z.object({
  categoryId: z.uuid(),
  title: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  coverImage: z.string().trim().nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  blocks: z.array(docBlockSchema),
});

export async function parseAdminDocArticleBody(request: Pick<Request, 'json'>) {
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
        operation: 'POST /api/admin/docs/articles',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const article = await createDocArticle({ ...body, actorId: session.user.id });
        return NextResponse.json({ ok: true, article }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'Doc article request is invalid.', issues: error.issues } },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
