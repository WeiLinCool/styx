import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import {
  normalizeAiJobReviewAction,
  reviewAiJob,
} from '@/server/repositories/admin-mutations';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';

const paramsSchema = z.object({
  jobId: z.uuid(),
});

const bodySchema = z.object({
  action: z.enum(['review', 'rerun', 'cancel', 'mark_resolved']),
  note: z.string().trim().max(1000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await requireAdmin();
    const params = paramsSchema.parse(await context.params);
    const { rawBody, body: parsedBody } = await readJsonBody(request);
    const body = bodySchema.parse(parsedBody);

    return runProtectedMutation(
      {
        request,
        routeKind: 'admin-mutation',
        operation: 'POST /api/admin/ai-jobs/[jobId]/review',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        parsedBody,
      },
      async () => {
        const job = await reviewAiJob({
          jobId: params.jobId,
          action: normalizeAiJobReviewAction(body.action),
          actorId: session.user.id,
          note: body.note,
        });

        return NextResponse.json({
          ok: true,
          job: {
            id: job.id,
            status: job.status,
            updatedAt: job.updatedAt,
          },
        });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'AI job review request is invalid.',
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
