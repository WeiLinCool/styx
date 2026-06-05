'use client';

import Link from 'next/link';

import type { GeneratedMediaAssetDto } from '@/server/agent/types';

function formatBytes(byteSize: number) {
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (byteSize >= 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }
  return `${byteSize} B`;
}

function formatKind(kind: GeneratedMediaAssetDto['kind']) {
  return kind === 'video' ? '视频' : '图片';
}

export function UserMediaModule({
  assets,
}: {
  assets: GeneratedMediaAssetDto[];
}) {
  const recentAssets = assets.slice(0, 3);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">我的资料</h2>
          <p className="text-xs text-muted-foreground">已保存到云端的图片与视频，可在独立页面统一管理。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs text-secondary-foreground">
            {assets.length} 个文件
          </span>
          <Link
            href="/my-assets"
            className="rounded-full border border-border px-3 py-1 text-xs text-foreground transition-colors hover:bg-secondary/70"
          >
            查看全部
          </Link>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          还没有已保存的资料。先去 AI 生图或 AI 视频生成结果里点击“保存到我的媒体”。
        </div>
      ) : (
        <div className="space-y-3">
          {recentAssets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{asset.title}</span>
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
                    {formatKind(asset.kind)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {(asset.sourceModel ?? (asset.sourceType === 'user_uploaded' ? '本地上传' : '未标记来源'))} · {formatBytes(asset.byteSize)}
                  {asset.conversationId ? ` · 会话 ${asset.conversationId.slice(0, 8)}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/my-assets" className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary/70">
                  管理资料
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
