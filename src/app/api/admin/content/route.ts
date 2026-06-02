import { NextResponse } from 'next/server';
import { z } from 'zod';

import { HOME_CONTENT_SLUGS } from '@/features/public/home-content';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { createAdminContent } from '@/server/repositories/content';

const bodySchema = z.object({
  slug: z.enum(HOME_CONTENT_SLUGS),
  title: z.string().trim().min(1),
  body: z.string().trim().nullable().optional(),
  url: z.string().trim().nullable().optional(),
  metadata: z.unknown(),
});

export async function parseAdminContentBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const { rawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/content',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        parsedBody,
      },
      async () => {
        const content = await createAdminContent({ ...body, actorId: session.user.id });
        return NextResponse.json({ ok: true, content }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Content create request is invalid.',
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
