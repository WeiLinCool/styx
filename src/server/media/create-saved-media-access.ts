import type { GeneratedMediaAssetDto } from '@/server/agent/types';

export type SavedMediaAccessDisposition = 'preview' | 'download';

export type SavedMediaAccessResult = {
  assetId: string;
  disposition: SavedMediaAccessDisposition;
  url: string;
  expiresAt: string;
  mimeType: string | null;
};

export function createSavedMediaAccessService(dependencies: {
  signObjectUrl: (input: {
    objectKey: string;
    disposition: SavedMediaAccessDisposition;
    mimeType: string | null;
    title: string;
  }) => Promise<{ url: string; expiresAt: string }>;
}) {
  return {
    async createAccessUrl(input: {
      asset: Pick<GeneratedMediaAssetDto, 'id' | 'objectKey' | 'mimeType' | 'title'>;
      disposition: SavedMediaAccessDisposition;
    }): Promise<SavedMediaAccessResult> {
      const signed = await dependencies.signObjectUrl({
        objectKey: input.asset.objectKey,
        disposition: input.disposition,
        mimeType: input.asset.mimeType,
        title: input.asset.title,
      });

      return {
        assetId: input.asset.id,
        disposition: input.disposition,
        url: signed.url,
        expiresAt: signed.expiresAt,
        mimeType: input.asset.mimeType,
      };
    },
  };
}
