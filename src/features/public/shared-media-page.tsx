type SharedMediaPageProps = {
  shareId: string;
  payload: {
    asset: {
      id: string;
      title: string;
      kind: 'image' | 'video';
      mimeType: string | null;
      byteSize: number;
      width: number | null;
      height: number | null;
      durationSeconds: number | null;
      shareId: string | null;
      shareStatus: 'active' | 'disabled';
    };
    access: {
      url: string;
      expiresAt: string;
    };
  } | null;
};

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

export function SharedMediaPage({ shareId, payload }: SharedMediaPageProps) {
  if (!payload) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6 py-16">
        <div className="rounded-3xl border border-border bg-card px-8 py-10 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">分享内容不存在或已失效</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            该分享链接可能已被关闭、删除，或分享地址无效。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="rounded-[32px] border border-border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Shared Media</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">{payload.asset.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {payload.asset.kind === 'video' ? '视频' : '图片'} · {formatBytes(payload.asset.byteSize)} · 分享标识 {shareId}
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl bg-secondary/50">
          {payload.asset.kind === 'video' ? (
            <video
              src={payload.access.url}
              controls
              className="max-h-[70vh] w-full bg-black object-contain"
            />
          ) : (
            <img
              src={payload.access.url}
              alt={payload.asset.title}
              className="max-h-[70vh] w-full object-contain"
            />
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            临时访问地址将于 {new Date(payload.access.expiresAt).toLocaleString('zh-CN')} 失效。
          </p>
          <a
            href={payload.access.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/85"
          >
            下载原文件
          </a>
        </div>
      </div>
    </main>
  );
}
