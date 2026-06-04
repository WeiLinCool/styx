'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Image as ImageIcon, Loader2, MessageSquarePlus, Search, Trash2, Video } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api-response';
import { userApiRequest } from '@/lib/user-api-client';
import type { GeneratedMediaAssetDto } from '@/server/agent/types';

import { getSavedMediaAssetAccess, listSavedMediaAssets } from './agent-runtime-client';
import { deriveMyAssetsView } from './my-assets-state';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';

type AssetKindFilter = 'all' | 'image' | 'video';
type AssetSort = 'newest' | 'oldest';

function formatBytes(byteSize: number) {
  if (byteSize >= 1024 * 1024 * 1024) {
    return `${(byteSize / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (byteSize >= 1024 * 1024) {
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (byteSize >= 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }
  return `${byteSize} B`;
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function kindLabel(kind: GeneratedMediaAssetDto['kind']) {
  return kind === 'video' ? '视频' : '图片';
}

function AssetPlaceholder({ kind }: { kind: GeneratedMediaAssetDto['kind'] }) {
  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
      {kind === 'video' ? <Video className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
    </div>
  );
}

export function MyAssetsPageClient() {
  const router = useRouter();
  const { isLoggedIn, user } = useAuth();
  const [assets, setAssets] = useState<GeneratedMediaAssetDto[]>([]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<AssetKindFilter>('all');
  const [sort, setSort] = useState<AssetSort>('newest');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<GeneratedMediaAssetDto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/home');
    }
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (!isLoggedIn || !user || requiresActivation(user)) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);

    void (async () => {
      try {
        const nextAssets = await listSavedMediaAssets();
        if (!cancelled) {
          setAssets(nextAssets);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '资料加载失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user]);

  const visibleAssets = useMemo(
    () =>
      deriveMyAssetsView(assets, {
        search,
        kind,
        sort,
      }),
    [assets, kind, search, sort],
  );

  const handleDeleteAsset = async (asset: GeneratedMediaAssetDto) => {
    if (deletingAssetId) {
      return;
    }

    if (!window.confirm(`确认删除“${asset.title}”吗？删除后将从资料库移除。`)) {
      return;
    }

    setDeletingAssetId(asset.id);
    setActionMessage(null);
    try {
      const response = await userApiRequest(`/api/user/media-assets/${asset.id}`, {
        method: 'DELETE',
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        setActionMessage(
          typeof payload?.error?.message === 'string' ? payload.error.message : '删除资料失败。',
        );
        return;
      }

      setAssets((current) => current.filter((item) => item.id !== asset.id));
      if (previewAsset?.id === asset.id) {
        setPreviewAsset(null);
        setPreviewUrl(null);
        setPreviewError(null);
      }
      setActionMessage('资料已删除。');
    } finally {
      setDeletingAssetId(null);
    }
  };

  const handleRequestAccess = async (
    asset: GeneratedMediaAssetDto,
    disposition: 'preview' | 'download',
  ) => {
    return getSavedMediaAssetAccess(asset.id, disposition);
  };

  const handlePreviewAsset = async (asset: GeneratedMediaAssetDto) => {
    setPreviewAsset(asset);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const access = await handleRequestAccess(asset, 'preview');
      setPreviewUrl(access.url);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : '预览加载失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadAsset = async (asset: GeneratedMediaAssetDto) => {
    setActionMessage(null);
    try {
      const access = await handleRequestAccess(asset, 'download');
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '下载资料失败');
    }
  };

  if (!isLoggedIn || !user) {
    return null;
  }

  if (requiresActivation(user)) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
            <button onClick={() => router.back()} className="mr-3 rounded-full p-1.5 hover:bg-secondary">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </button>
            <h1 className="text-base font-semibold text-foreground">我的资料</h1>
          </div>
        </div>
        <ProtectedAccountPanel accountState={user.accountState} title="激活账号后进入我的资料" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/home" className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft size={16} />
              <span className="text-xs">返回</span>
            </Link>
            <div>
              <h1 className="text-base font-semibold">我的资料</h1>
              <p className="text-[11px] text-muted-foreground">管理你已保存到云端的图片与视频</p>
            </div>
          </div>
          <div className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
            {assets.length} 个文件
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <section className="mb-5 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索资料标题"
                className="w-full rounded-2xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors focus:border-ring"
              />
            </label>

            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as AssetKindFilter)}
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
            >
              <option value="all">全部类型</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as AssetSort)}
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
            >
              <option value="newest">最新优先</option>
              <option value="oldest">最早优先</option>
            </select>
          </div>
        </section>

        {actionMessage ? (
          <div className="mb-4 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            {actionMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-border bg-card">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载资料...
            </div>
          </div>
        ) : errorMessage ? (
          <div className="rounded-3xl border border-border bg-card px-5 py-8 text-center">
            <p className="text-sm text-foreground">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              重新加载
            </button>
          </div>
        ) : visibleAssets.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-5 py-14 text-center">
            <h2 className="text-base font-semibold text-foreground">
              {assets.length === 0 ? '还没有已保存的资料' : '没有符合条件的资料'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {assets.length === 0
                ? '先去 AI 生图或 AI 视频中把满意的结果保存到云端。'
                : '试试调整搜索词、类型筛选或排序方式。'}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link href="/image-gen" className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/85">
                去 AI 生图
              </Link>
              <Link href="/video-gen" className="rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary">
                去 AI 视频
              </Link>
            </div>
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleAssets.map((asset) => (
              <article
                key={asset.id}
                className="overflow-hidden rounded-3xl border border-border bg-card p-4 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => void handlePreviewAsset(asset)}
                  className="block w-full text-left"
                >
                  <AssetPlaceholder kind={asset.kind} />
                </button>

                <div className="mt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="line-clamp-1 text-sm font-semibold text-foreground">{asset.title}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {kindLabel(asset.kind)} · {formatBytes(asset.byteSize)}
                      </p>
                    </div>
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] text-muted-foreground">
                      {kindLabel(asset.kind)}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
                    保存于 {formatSavedAt(asset.savedAt)}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePreviewAsset(asset)}
                      className="rounded-2xl border border-border px-3 py-2 text-xs text-foreground transition-colors hover:bg-secondary"
                    >
                      预览
                    </button>
                    <Link
                      href={`/chat?assetId=${asset.id}`}
                      className="flex items-center justify-center gap-1 rounded-2xl border border-border px-3 py-2 text-xs text-foreground transition-colors hover:bg-secondary"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      继续对话
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDownloadAsset(asset)}
                      className="flex items-center justify-center gap-1 rounded-2xl border border-border px-3 py-2 text-xs text-foreground transition-colors hover:bg-secondary"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载
                    </button>
                    <button
                      type="button"
                      disabled={deletingAssetId === asset.id}
                      onClick={() => void handleDeleteAsset(asset)}
                      className="flex items-center justify-center gap-1 rounded-2xl border border-red-200 px-3 py-2 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingAssetId === asset.id ? '删除中' : '删除'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>

      <Dialog
        open={Boolean(previewAsset)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewAsset(null);
            setPreviewUrl(null);
            setPreviewError(null);
            setPreviewLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl rounded-3xl border-border bg-popover p-0" showCloseButton={false}>
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="text-base text-foreground">{previewAsset?.title ?? '资料预览'}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {previewAsset ? `${kindLabel(previewAsset.kind)} · ${formatBytes(previewAsset.byteSize)}` : '加载中'}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5">
            {previewLoading ? (
              <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在加载预览...
              </div>
            ) : previewError ? (
              <div className="flex min-h-[240px] items-center justify-center text-sm text-foreground">
                {previewError}
              </div>
            ) : previewAsset && previewUrl ? (
              previewAsset.kind === 'video' ? (
                <video src={previewUrl} controls className="max-h-[70vh] w-full rounded-2xl bg-black" />
              ) : (
                <img src={previewUrl} alt={previewAsset.title} className="max-h-[70vh] w-full rounded-2xl object-contain" />
              )
            ) : null}
          </div>

          {previewAsset ? (
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <Link
                href={`/chat?assetId=${previewAsset.id}`}
                className="rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
              >
                继续对话
              </Link>
              <button
                type="button"
                onClick={() => void handleDownloadAsset(previewAsset)}
                className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/85"
              >
                下载
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
