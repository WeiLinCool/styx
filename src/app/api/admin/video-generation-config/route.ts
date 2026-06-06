import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import {
  listAdminVideoStylePresets,
  upsertVideoStylePresets,
  type VideoStylePreset,
  type VideoStylePresetInput,
} from '@/server/repositories/video-generation-config';

type AdminSessionLike = {
  user: {
    id: string;
  };
};

const stylePresetSchema = z.object({
  id: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
});

const bodySchema = z.object({
  styles: z.array(stylePresetSchema),
});

export async function parseAdminVideoGenerationConfigBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return bodySchema.parse(body);
}

function jsonValidationError(error: z.ZodError) {
  return NextResponse.json(
    {
      error: {
        code: 'validation_error',
        message: '视频风格配置无效。',
        issues: error.issues,
      },
    },
    { status: 400 },
  );
}

export function createAdminVideoGenerationConfigRouteHandlers(dependencies: {
  requireAdminSession: () => Promise<AdminSessionLike>;
  listStyles: () => Promise<VideoStylePreset[]>;
  upsertStyles: (inputs: VideoStylePresetInput[]) => Promise<VideoStylePreset[]>;
}) {
  return {
    async GET() {
      try {
        await dependencies.requireAdminSession();
        const styles = await dependencies.listStyles();

        return NextResponse.json({ styles });
      } catch (error) {
        const response = accountErrorToResponse(error);
        return NextResponse.json(response.body, { status: response.status });
      }
    },
    async PUT(request: Request) {
      try {
        const session = await dependencies.requireAdminSession();
        const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
        const body = bodySchema.parse(parsedBody);

        return runProtectedMutation(
          {
            request,
            routeKind: 'admin-mutation',
            operation: 'PUT /api/admin/video-generation-config',
            actorType: 'admin',
            actorId: session.user.id,
            rawBody,
            decryptedRawBody,
            parsedBody,
          },
          async () => {
            const styles = await dependencies.upsertStyles(body.styles);

            return NextResponse.json({
              ok: true,
              styles,
              semantics: 'upsert_only',
            });
          },
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return jsonValidationError(error);
        }

        const response = accountErrorToResponse(error);
        return NextResponse.json(response.body, { status: response.status });
      }
    },
  };
}

const handlers = createAdminVideoGenerationConfigRouteHandlers({
  requireAdminSession: requireAdmin,
  listStyles: listAdminVideoStylePresets,
  upsertStyles: upsertVideoStylePresets,
});

export const GET = handlers.GET;
export const PUT = handlers.PUT;
