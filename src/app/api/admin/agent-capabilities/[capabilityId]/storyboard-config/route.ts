import { NextResponse } from 'next/server';
import { z } from 'zod';

import { adminText } from '@/features/admin/admin-i18n';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireAdmin } from '@/server/auth/guards';
import { runProtectedMutation } from '@/server/api-request-guard';
import { createTencentCosClient } from '@/server/media/cos-client';
import { createUploadAdminStoryboardTemplateService } from '@/server/media/upload-admin-storyboard-template';
import {
  getAgentCapabilityStoryboardConfig,
  StoryboardCapabilityNotFoundError,
  StoryboardCapabilityValidationError,
  updateAgentCapabilityStoryboardConfig,
  type AdminStoryboardCapabilityConfigRecord,
} from '@/server/repositories/agent-capabilities';
import type { StoryboardTemplateAsset } from '@/server/agent/types';

type AdminSessionLike = {
  user: {
    id: string;
  };
};

const paramsSchema = z.object({
  capabilityId: z.uuid(),
});

const formSchema = z.object({
  promptText: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, '请填写完整的分镜提示词。')),
  templateFile: z.instanceof(File).optional().nullable(),
});

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function toPreviewConfig(
  config: AdminStoryboardCapabilityConfigRecord,
  previewUrl: string | null,
) {
  return {
    ...config,
    previewUrl,
  };
}

export async function parseStoryboardConfigFormData(
  request: Pick<Request, 'formData'>,
): Promise<{ promptText: string; templateFile: File | null }> {
  const formData = await request.formData();
  const promptValue = formData.get('promptText');
  const templateValue = formData.get('templateFile');

  const parsed = formSchema.parse({
    promptText: typeof promptValue === 'string' ? promptValue : '',
    templateFile: templateValue instanceof File && templateValue.size > 0 ? templateValue : null,
  });

  return {
    promptText: parsed.promptText,
    templateFile: parsed.templateFile ?? null,
  };
}

function storyboardConfigValidationResponse(message: string) {
  return NextResponse.json(
    {
      error: {
        code: 'validation_error',
        message,
      },
    },
    { status: 400 },
  );
}

export function createStoryboardConfigRouteHandlers(dependencies: {
  requireAdminSession: () => Promise<AdminSessionLike>;
  getConfig: (capabilityId: string) => Promise<AdminStoryboardCapabilityConfigRecord>;
  saveConfig: (input: {
    capabilityId: string;
    promptText: string;
    templateAsset?: StoryboardTemplateAsset;
    updatedByUserId: string;
  }) => Promise<AdminStoryboardCapabilityConfigRecord>;
  uploadTemplate: (input: {
    capabilityId: string;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
  }) => Promise<StoryboardTemplateAsset>;
  deleteObject: (objectKey: string) => Promise<void>;
  createPreviewUrl: (objectKey: string) => Promise<string | null>;
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
        const previewUrl = config.templateAsset
          ? await dependencies.createPreviewUrl(config.templateAsset.objectKey)
          : null;

        return NextResponse.json({
          config: toPreviewConfig(config, previewUrl),
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return storyboardConfigValidationResponse(adminText.api.agentCapabilityStoryboardConfigInvalid);
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
        const parsed = await parseStoryboardConfigFormData(request);
        const existing = await dependencies.getConfig(params.capabilityId);

        if (!existing.templateAsset && !parsed.templateFile) {
          return storyboardConfigValidationResponse('工作流分镜模板未配置，请先上传模板图。');
        }

        const parsedBody = {
          capabilityId: params.capabilityId,
          promptText: parsed.promptText,
          templateFile: parsed.templateFile
            ? {
                name: parsed.templateFile.name,
                type: parsed.templateFile.type,
                size: parsed.templateFile.size,
              }
            : null,
        };

        return runProtectedMutation(
          {
            request,
            routeKind: 'admin-mutation',
            operation:
              'PUT /api/admin/agent-capabilities/[capabilityId]/storyboard-config',
            actorType: 'admin',
            actorId: session.user.id,
            rawBody: JSON.stringify(parsedBody),
            parsedBody,
          },
          async () => {
            let uploadedTemplate: StoryboardTemplateAsset | undefined;

            try {
              if (parsed.templateFile) {
                uploadedTemplate = await dependencies.uploadTemplate({
                  capabilityId: params.capabilityId,
                  filename: parsed.templateFile.name,
                  mimeType: parsed.templateFile.type,
                  bytes: new Uint8Array(await parsed.templateFile.arrayBuffer()),
                });
              }

              const config = await dependencies.saveConfig({
                capabilityId: params.capabilityId,
                promptText: parsed.promptText,
                templateAsset: uploadedTemplate,
                updatedByUserId: session.user.id,
              });

              if (
                uploadedTemplate &&
                existing.templateAsset &&
                existing.templateAsset.objectKey !== uploadedTemplate.objectKey
              ) {
                void dependencies.deleteObject(existing.templateAsset.objectKey).catch(() => undefined);
              }

              const previewUrl = config.templateAsset
                ? await dependencies.createPreviewUrl(config.templateAsset.objectKey)
                : null;

              return NextResponse.json({
                ok: true,
                config: toPreviewConfig(config, previewUrl),
              });
            } catch (error) {
              if (uploadedTemplate) {
                await dependencies.deleteObject(uploadedTemplate.objectKey).catch(() => undefined);
              }
              throw error;
            }
          },
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return storyboardConfigValidationResponse(
            error.issues[0]?.message ?? adminText.api.agentCapabilityStoryboardConfigInvalid,
          );
        }

        if (error instanceof StoryboardCapabilityValidationError) {
          return storyboardConfigValidationResponse(error.message);
        }

        if (error instanceof StoryboardCapabilityNotFoundError) {
          return jsonError('capability_not_found', error.message, 404);
        }

        const response = accountErrorToResponse(error);
        if (response.body.error.code !== 'internal_error') {
          return NextResponse.json(response.body, { status: response.status });
        }

        return jsonError('internal_error', '分镜模板配置保存失败。', 500);
      }
    },
  };
}

const handlers = createStoryboardConfigRouteHandlers({
  requireAdminSession: requireAdmin,
  getConfig: getAgentCapabilityStoryboardConfig,
  saveConfig: updateAgentCapabilityStoryboardConfig,
  uploadTemplate: (input) =>
    createUploadAdminStoryboardTemplateService({
      cosClient: createTencentCosClient(),
    }).uploadTemplate(input),
  deleteObject: (objectKey) => createTencentCosClient().deleteObject(objectKey),
  createPreviewUrl: async (objectKey) => createTencentCosClient().createSignedReadUrl(objectKey, 600),
});

export const GET = handlers.GET;
export const PUT = handlers.PUT;
