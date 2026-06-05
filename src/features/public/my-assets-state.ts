import type { GeneratedMediaAssetDto } from '@/server/agent/types';

export type MyAssetsFilter = {
  search: string;
  kind: 'all' | 'image' | 'video';
  sourceType: 'all' | 'ai_generated' | 'user_uploaded';
  sort: 'newest' | 'oldest';
};

export function deriveMyAssetsView(
  assets: GeneratedMediaAssetDto[],
  filter: MyAssetsFilter,
): GeneratedMediaAssetDto[] {
  const normalizedSearch = filter.search.trim().toLowerCase();

  return [...assets]
    .filter((asset) => (filter.kind === 'all' ? true : asset.kind === filter.kind))
    .filter((asset) => (filter.sourceType === 'all' ? true : asset.sourceType === filter.sourceType))
    .filter((asset) =>
      normalizedSearch ? asset.title.toLowerCase().includes(normalizedSearch) : true,
    )
    .sort((left, right) =>
      filter.sort === 'oldest'
        ? left.savedAt.localeCompare(right.savedAt)
        : right.savedAt.localeCompare(left.savedAt),
    );
}
