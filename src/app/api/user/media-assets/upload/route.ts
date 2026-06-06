import { NextResponse } from 'next/server';

import { requireActiveAccount } from '@/server/auth/guards';
import { resolveCurrentUserMediaPolicy } from '@/server/auth/membership-media-policy';
import { createTencentCosClient } from '@/server/media/cos-client';
import { createUploadUserMediaService } from '@/server/media/upload-user-media';
import { getGeneratedMediaAssetRepository } from '@/server/repositories/generated-media-assets';
import { getUserStorageRepository } from '@/server/repositories/users';

type SessionLike = {
  user: {
    id: string;
  };
};

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function titleFromFilename(filename: string) {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
}

export function createMediaAssetUploadRouteHandlers(dependencies: {
  requireSession: () => Promise<SessionLike>;
  resolveMediaPolicy: (userId: string) => Promise<{
    storageQuotaBytes: number;
    allowUserUpload: boolean;
    allowPublicSharing: boolean;
  }>;
  uploadMedia: (input: {
    userId: string;
    title: string;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
  }) => Promise<{
    asset: Awaited<
      ReturnType<ReturnType<typeof getGeneratedMediaAssetRepository>['createSavedAsset']>
    >;
  }>;
}) {
  return {
    async POST(request: Request) {
      try {
        const session = await dependencies.requireSession();
        const policy = await dependencies.resolveMediaPolicy(session.user.id);
        if (!policy.allowUserUpload) {
          return jsonError(
            'membership_media_upload_forbidden',
            '当前会员权益不支持本地上传资料。',
            403,
          );
        }

        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) {
          return jsonError('invalid_request', '请上传图片、音频或视频文件。', 400);
        }

        const titleValue = formData.get('title');
        const title =
          typeof titleValue === 'string' && titleValue.trim()
            ? titleValue.trim()
            : titleFromFilename(file.name);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await dependencies.uploadMedia({
          userId: session.user.id,
          title,
          filename: file.name,
          mimeType: file.type,
          bytes,
        });

        return NextResponse.json(result);
      } catch (error) {
        return jsonError(
          'media_upload_failed',
          error instanceof Error ? error.message : '媒体上传失败。',
          400,
        );
      }
    },
  };
}

const handlers = createMediaAssetUploadRouteHandlers({
  requireSession: requireActiveAccount,
  resolveMediaPolicy: resolveCurrentUserMediaPolicy,
  uploadMedia: (input) =>
    createUploadUserMediaService({
      mediaAssetRepository: getGeneratedMediaAssetRepository(),
      userStorageRepository: getUserStorageRepository(),
      cosClient: createTencentCosClient(),
    }).uploadForUser(input),
});

export const POST = handlers.POST;
