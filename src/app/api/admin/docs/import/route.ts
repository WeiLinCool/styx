import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { importMarkdownToDocBlocks } from '@/server/docs/markdown-import';
import {
  createDocArticle,
  createDocImportJob,
  markDocImportJobImported,
} from '@/server/repositories/docs';

const bodySchema = z.object({
  categoryId: z.uuid(),
  sourceFilename: z.string().trim().min(1),
  markdown: z.string().min(1),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'imported-doc';
}

export async function parseAdminDocImportBody(request: Pick<Request, 'json'>) {
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
        operation: 'POST /api/admin/docs/import',
        actorType: 'admin',
        actorId: session.user.id,
        rawBody,
        decryptedRawBody,
        parsedBody,
      },
      async () => {
        const preview = importMarkdownToDocBlocks(body.markdown);
        const checksum = createHash('sha256').update(body.markdown).digest('hex');
        const job = await createDocImportJob({
          sourceFilename: body.sourceFilename,
          sourceChecksum: checksum,
          importStatus: 'parsed',
          previewSnapshot: preview,
          createdBy: session.user.id,
        });
        const article = await createDocArticle({
          categoryId: body.categoryId,
          title: preview.title,
          slug: slugify(preview.title),
          summary: preview.summary,
          blocks: preview.blocks,
          status: 'draft',
          actorId: session.user.id,
        });
        await markDocImportJobImported({
          jobId: job.id,
          createdArticleId: article.id,
        });
        return NextResponse.json({ ok: true, preview, article, job }, { status: 200 });
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'validation_error', message: 'Doc import request is invalid.', issues: error.issues } },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
