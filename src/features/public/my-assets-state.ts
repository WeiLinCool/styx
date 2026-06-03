import type { GeneratedMediaAssetDto } from '@/server/agent/types';

export type MyAssetsFilter = {
  search: string;
  kind: 'all' | 'image' | 'video';
  sort: 'newest' | 'oldest';
};

export function deriveMyAssetsView(
  assets: GeneratedMediaAssetDto[],
  filter: MyAssetsFilter,
): GeneratedMediaAssetDto[] {
  const normalizedSearch = filter.search.trim().toLowerCase();

  return [...assets]
    .filter((asset) => (filter.kind === 'all' ? true : asset.kind === filter.kind))
    .filter((asset) =>
      normalizedSearch ? asset.title.toLowerCase().includes(normalizedSearch) : true,
    )
    .sort((left, right) =>
      filter.sort === 'oldest'
        ? left.savedAt.localeCompare(right.savedAt)
        : right.savedAt.localeCompare(left.savedAt),
    );
}
