import { randomUUID } from 'node:crypto';

type PublicShareAsset = {
  id: string;
  title: string;
  kind: 'image' | 'audio' | 'video';
  mimeType: string | null;
  objectKey: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  shareId: string | null;
  shareStatus: 'disabled' | 'active';
};

export function createPublicMediaShareService(dependencies: {
  createShareId?: () => string;
  buildShareUrl: (shareId: string) => string;
  signObjectUrl?: (input: {
    objectKey: string;
  }) => Promise<{ url: string; expiresAt: string }>;
}) {
  return {
    createShareMetadata() {
      const shareId = dependencies.createShareId?.() ?? randomUUID();
      return {
        shareId,
        url: dependencies.buildShareUrl(shareId),
        sharedAt: new Date().toISOString(),
      };
    },
    async createPublicPayload(input: { asset: PublicShareAsset }) {
      if (!dependencies.signObjectUrl) {
        throw new Error('signObjectUrl is required to create a public media payload.');
      }
      const signed = await dependencies.signObjectUrl({
        objectKey: input.asset.objectKey,
      });

      return {
        asset: {
          id: input.asset.id,
          title: input.asset.title,
          kind: input.asset.kind,
          mimeType: input.asset.mimeType,
          byteSize: input.asset.byteSize,
          width: input.asset.width,
          height: input.asset.height,
          durationSeconds: input.asset.durationSeconds,
          shareId: input.asset.shareId,
          shareStatus: input.asset.shareStatus,
        },
        access: signed,
      };
    },
  };
}
