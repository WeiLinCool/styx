export function formatBytes(byteSize: number | null | undefined) {
  if (typeof byteSize !== 'number' || !Number.isFinite(byteSize) || byteSize < 0) {
    return '0 B';
  }

  if (byteSize >= 1024 * 1024 * 1024) {
    return `${(byteSize / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (byteSize >= 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }

  return `${Math.round(byteSize)} B`;
}

export function formatStorageUsage(
  storageUsedBytes: number | null | undefined,
  storageQuotaBytes: number | null | undefined,
) {
  const used = typeof storageUsedBytes === 'number' && Number.isFinite(storageUsedBytes) ? Math.max(0, storageUsedBytes) : 0;
  const quota = typeof storageQuotaBytes === 'number' && Number.isFinite(storageQuotaBytes) ? Math.max(0, storageQuotaBytes) : 0;
  const ratio = quota > 0 ? Math.min(used / quota, 1) : 0;

  return {
    used,
    quota,
    ratio,
    usedLabel: formatBytes(used),
    quotaLabel: formatBytes(quota),
    percentLabel: `${Math.round(ratio * 100)}%`,
  };
}
