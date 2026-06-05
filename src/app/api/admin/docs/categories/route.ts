import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { createDocCategory } from '@/server/repositories/docs';

const bodySchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  description: z.string().trim().optional(),
  parentId: z.uuid().nullable().optional(),
  audienceScope: z.enum(['user', 'admin', 'shared']).optional(),
  sortOrder: z.number().int().optional(),
});

export async function parseAdminDocCategoryBody(request: Pick<Request, 'json'>) {
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
        operation: 'POST /api/admin/docs/categories',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const category = await createDocCategory(body);
        return NextResponse.json({ ok: true, category }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'Doc category request is invalid.', issues: error.issues } },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
