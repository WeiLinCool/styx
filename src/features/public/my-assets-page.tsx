'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Download, Edit3, Link2, Loader2, MessageSquarePlus, Search, Trash2, Upload, X } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api-response';
import { userApiRequest } from '@/lib/user-api-client';
import type { GeneratedMediaAssetDto } from '@/server/agent/types';

import {
  disableMediaShare,
  enableMediaShare,
  getSavedMediaAssetAccess,
  listSavedMediaAssets,
  renameSavedMediaAsset,
  uploadUserMedia,
} from './agent-runtime-client';
import { MediaThumbnail } from './media-thumbnail';
import { deriveMyAssetsView } from './my-assets-state';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';

type AssetKindFilter = 'all' | 'image' | 'audio' | 'video';
type AssetSourceFilter = 'all' | 'ai_generated' | 'user_uploaded';
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
  return kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '图片';
}

function useVisiblePreviewUrl(assetId: string, enabled: boolean) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!enabled) {
      setPreviewUrl(null);
      setLoading(false);
      return;
    }

    const cached = cacheRef.current.get(assetId);
    if (cached) {
      setPreviewUrl(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const access = await getSavedMediaAssetAccess(assetId, 'preview');
        if (cancelled) {
          return;
        }
        cacheRef.current.set(assetId, access.url);
        setPreviewUrl(access.url);
      } catch {
        if (!cancelled) {
          setPreviewUrl(null);
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
  }, [assetId, enabled]);

  return { previewUrl, loading };
}

export function MyAssetsPageClient() {
  const router = useRouter();
  const { isLoggedIn, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<GeneratedMediaAssetDto[]>([]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<AssetKindFilter>('all');
  const [sourceType, setSourceType] = useState<AssetSourceFilter>('all');
  const [sort, setSort] = useState<AssetSort>('newest');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [sharingAssetId, setSharingAssetId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<GeneratedMediaAssetDto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
  const [isEditingPreviewTitle, setIsEditingPreviewTitle] = useState(false);
  const [previewTitleDraft, setPreviewTitleDraft] = useState('');

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
        sourceType,
        sort,
      }),
    [assets, kind, search, sort, sourceType],
  );
  const visibleAssetIds = useMemo(() => new Set(visibleAssets.map((asset) => asset.id)), [visibleAssets]);

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

  const handleStartRenamePreviewAsset = () => {
    if (!previewAsset) {
      return;
    }

    setPreviewTitleDraft(previewAsset.title);
    setIsEditingPreviewTitle(true);
    setActionMessage(null);
  };

  const handleCancelRenamePreviewAsset = () => {
    setIsEditingPreviewTitle(false);
    setPreviewTitleDraft(previewAsset?.title ?? '');
  };

  const handleRenamePreviewAsset = async () => {
    if (!previewAsset || renamingAssetId) {
      return;
    }

    const nextTitle = previewTitleDraft.trim();
    if (!nextTitle) {
      setActionMessage('标题不能为空。');
      return;
    }

    if (nextTitle.length > 100) {
      setActionMessage('标题最多100个字符。');
      return;
    }

    if (nextTitle === previewAsset.title) {
      setIsEditingPreviewTitle(false);
      return;
    }

    setRenamingAssetId(previewAsset.id);
    setActionMessage(null);
    try {
      const updated = await renameSavedMediaAsset(previewAsset.id, nextTitle);
      setAssets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setPreviewAsset(updated);
      setPreviewTitleDraft(updated.title);
      setIsEditingPreviewTitle(false);
      setActionMessage('资料名称已更新。');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '资料重命名失败');
    } finally {
      setRenamingAssetId(null);
    }
  };

  const handleUploadFile = async (file: File) => {
    setUploading(true);
    setActionMessage(null);
    try {
      const asset = await uploadUserMedia({ file });
      setAssets((current) => [asset, ...current]);
      setActionMessage('资料已上传。');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '资料上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleToggleShare = async (asset: GeneratedMediaAssetDto) => {
    setSharingAssetId(asset.id);
    setActionMessage(null);
    try {
      if (asset.shareStatus === 'active') {
        const updated = await disableMediaShare(asset.id);
        setAssets((current) => current.map((item) => (item.id === asset.id ? updated : item)));
        setActionMessage('已关闭分享。');
        return;
      }

      const result = await enableMediaShare(asset.id);
      setAssets((current) =>
        current.map((item) => (item.id === asset.id ? result.asset : item)),
      );
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.share.url);
        setActionMessage('分享链接已复制。');
      } else {
        setActionMessage(`分享已开启：${result.share.url}`);
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : '分享设置失败');
    } finally {
      setSharingAssetId(null);
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
              <p className="text-[11px] text-muted-foreground">管理你已保存到云端的图片、音频与视频</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/mp4,audio/x-wav,video/mp4"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleUploadFile(file);
                }
                event.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? '上传中' : '上传资料'}
            </button>
            <div className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
              {assets.length} 个文件
            </div>
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
              <option value="audio">音频</option>
              <option value="video">视频</option>
            </select>

            <select
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value as AssetSourceFilter)}
              className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none"
            >
              <option value="all">全部来源</option>
              <option value="ai_generated">AI生成</option>
              <option value="user_uploaded">本地上传</option>
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
                <MediaCardThumbnail asset={asset} isVisible={visibleAssetIds.has(asset.id)} onPreview={() => void handlePreviewAsset(asset)} />

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
                      disabled={sharingAssetId === asset.id}
                      onClick={() => void handleToggleShare(asset)}
                      className="flex items-center justify-center gap-1 rounded-2xl border border-border px-3 py-2 text-xs text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      {asset.shareStatus === 'active' ? '关闭分享' : '开启分享'}
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
            setRenamingAssetId(null);
            setIsEditingPreviewTitle(false);
            setPreviewTitleDraft('');
          }
        }}
      >
        <DialogContent className="max-w-4xl rounded-3xl border-border bg-popover p-0" showCloseButton={false}>
          <DialogHeader className="border-b border-border px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                {isEditingPreviewTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={previewTitleDraft}
                      onChange={(event) => setPreviewTitleDraft(event.target.value)}
                      maxLength={100}
                      className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={renamingAssetId === previewAsset?.id}
                      onClick={() => void handleRenamePreviewAsset()}
                      className="rounded-full border border-border p-2 text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="保存标题"
                    >
                      {renamingAssetId === previewAsset?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      disabled={renamingAssetId === previewAsset?.id}
                      onClick={handleCancelRenamePreviewAsset}
                      className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="取消重命名"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <DialogTitle className="line-clamp-1 text-base text-foreground">
                      {previewAsset?.title ?? '资料预览'}
                    </DialogTitle>
                    {previewAsset ? (
                      <button
                        type="button"
                        onClick={handleStartRenamePreviewAsset}
                        className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        aria-label="重命名资料"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
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
              ) : previewAsset.kind === 'audio' ? (
                <div className="flex min-h-[220px] items-center rounded-2xl bg-secondary px-6">
                  <audio src={previewUrl} controls className="w-full" />
                </div>
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

function MediaCardThumbnail({
  asset,
  isVisible,
  onPreview,
}: {
  asset: GeneratedMediaAssetDto;
  isVisible: boolean;
  onPreview: () => void;
}) {
  const { previewUrl, loading } = useVisiblePreviewUrl(asset.id, isVisible);

  return (
    <button type="button" onClick={onPreview} className="block w-full text-left">
      <MediaThumbnail kind={asset.kind} title={asset.title} previewUrl={previewUrl} loading={loading} />
    </button>
  );
}
