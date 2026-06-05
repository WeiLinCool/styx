import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import {
  deleteDocCategory,
  updateDocCategory,
} from '@/server/repositories/docs';

const paramsSchema = z.object({
  categoryId: z.uuid(),
});

const bodySchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  description: z.string().trim().optional(),
  parentId: z.uuid().nullable().optional(),
  audienceScope: z.enum(['user', 'admin', 'shared']).optional(),
  sortOrder: z.number().int().optional(),
});

export function parseAdminDocCategoryMutationBody(body: unknown) {
  return bodySchema.parse(body);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
    const body = parseAdminDocCategoryMutationBody(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'PATCH /api/admin/docs/categories/[categoryId]',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const category = await updateDocCategory({
          categoryId: params.categoryId,
          ...body,
        });
        return NextResponse.json({ ok: true, category }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Doc category update request is invalid.',
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'DELETE /api/admin/docs/categories/[categoryId]',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody: '',
        decryptedRawBody: null,
        parsedBody: null,
      },
      async () => {
        const category = await deleteDocCategory({
          categoryId: params.categoryId,
        });
        return NextResponse.json({ ok: true, category }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Doc category delete request is invalid.',
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
