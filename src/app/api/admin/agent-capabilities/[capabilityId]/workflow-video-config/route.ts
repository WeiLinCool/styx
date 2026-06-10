import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import {
  getWorkflowVideoMvpCapabilityConfig,
  saveWorkflowVideoMvpCapabilityConfig,
  StoryboardCapabilityNotFoundError,
  StoryboardCapabilityValidationError,
  type AdminWorkflowVideoCapabilityConfigRecord,
} from '@/server/repositories/agent-capabilities';

type AdminSessionLike = {
  user: {
    id: string;
  };
};

const paramsSchema = z.object({
  capabilityId: z.uuid(),
});

const bodySchema = z.object({
  description: z.string().transform((value) => value.trim()).default(''),
  promptTemplate: z
    .string({ message: 'promptTemplate is required.' })
    .transform((value) => value.trim())
    .pipe(z.string().min(1, 'promptTemplate is required.')),
  storyboardDefaultPrompt: z
    .string()
    .transform((value) => value.trim())
    .default('石头印画风格，将图案转化为石纹肌理效果，保留原始构图，增添天然石纹质感和裂缝光影细节，色调温暖沉稳，边缘自然风化，背景深色石板'),
  defaults: z.object({
    durationSeconds: z.number().int().positive(),
    resolution: z.string().transform((value) => value.trim()).pipe(z.string().min(1)),
  }),
  modelBinding: z
    .object({
      providerCode: z.literal('doubao'),
      model: z.string().transform((value) => value.trim()).pipe(z.string().min(1)),
      executionProtocol: z.literal('video_task_polling'),
    })
    .optional(),
  sceneBackgrounds: z
    .array(
      z.object({
        id: z.string().transform((value) => value.trim()),
        name: z.string().transform((value) => value.trim()),
        enabled: z.boolean(),
        sortOrder: z.number(),
      }),
    )
    .default([]),
});

export function parseWorkflowVideoConfigBody(body: unknown) {
  return bodySchema.parse(body);
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function validationResponse(message: string) {
  return jsonError('validation_error', message, 400);
}

export function createWorkflowVideoConfigRouteHandlers(dependencies: {
  requireAdminSession: () => Promise<AdminSessionLike>;
  getConfig: (capabilityId: string) => Promise<AdminWorkflowVideoCapabilityConfigRecord>;
  readJsonBody?: typeof readJsonBody;
  saveConfig: (input: {
    capabilityId: string;
    adminUserId: string;
    description: string;
    promptTemplate: string;
    storyboardDefaultPrompt: string;
    modelBinding?: {
      providerCode: 'doubao';
      model: string;
      executionProtocol: 'video_task_polling';
    };
    defaults: { durationSeconds: number; resolution: string };
    sceneBackgrounds?: unknown;
  }) => Promise<AdminWorkflowVideoCapabilityConfigRecord>;
}) {
  return {
    async GET(
      _request: Request,
      context: { params: Promise<{ capabilityId: string }> },
    ) {
      try {
        await dependencies.requireAdminSession();
        const params = paramsSchema.parse(await context.params);
        const config = await dependencies.getConfig(params.capabilityId);
        return NextResponse.json({ config });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return validationResponse('工作流视频配置参数无效。');
        }

        if (error instanceof StoryboardCapabilityNotFoundError) {
          return jsonError('capability_not_found', error.message, 404);
        }

        const response = accountErrorToResponse(error);
        return NextResponse.json(response.body, { status: response.status });
      }
    },
    async PUT(
      request: Request,
      context: { params: Promise<{ capabilityId: string }> },
    ) {
      try {
        const session = await dependencies.requireAdminSession();
        const params = paramsSchema.parse(await context.params);
        const {
          rawBody,
          decryptedRawBody,
          body: parsedBody,
        } = await (dependencies.readJsonBody ?? readJsonBody)(request);
        const body = parseWorkflowVideoConfigBody(parsedBody);

        return runProtectedMutation(
          {
            request,
            routeKind: 'admin-mutation',
            operation:
              'PUT /api/admin/agent-capabilities/[capabilityId]/workflow-video-config',
            actorType: 'admin',
            actorId: session.user.id,
            rawBody,
            decryptedRawBody,
            parsedBody: body,
          },
          async () => {
            const config = await dependencies.saveConfig({
              capabilityId: params.capabilityId,
              adminUserId: session.user.id,
              ...body,
            });
            return NextResponse.json({ ok: true, config });
          },
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return validationResponse(error.issues[0]?.message ?? '工作流视频配置参数无效。');
        }

        if (error instanceof StoryboardCapabilityValidationError) {
          return validationResponse(error.message);
        }

        if (error instanceof StoryboardCapabilityNotFoundError) {
          return jsonError('capability_not_found', error.message, 404);
        }

        const response = accountErrorToResponse(error);
        if (response.body.error.code !== 'internal_error') {
          return NextResponse.json(response.body, { status: response.status });
        }

        return jsonError('internal_error', '工作流视频配置保存失败。', 500);
      }
    },
  };
}

const handlers = createWorkflowVideoConfigRouteHandlers({
  requireAdminSession: requireAdmin,
  getConfig: (capabilityId) => getWorkflowVideoMvpCapabilityConfig({ capabilityId }),
  saveConfig: saveWorkflowVideoMvpCapabilityConfig,
});

export const GET = handlers.GET;
export const PUT = handlers.PUT;
