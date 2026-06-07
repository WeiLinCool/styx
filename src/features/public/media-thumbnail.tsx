'use client';

import { useEffect, useState } from 'react';
import { FileAudio, Image as ImageIcon, Loader2, Video } from 'lucide-react';

type MediaThumbnailProps = {
  kind: 'image' | 'audio' | 'video';
  title: string;
  previewUrl: string | null;
  loading?: boolean;
};

function Placeholder({ kind }: { kind: MediaThumbnailProps['kind'] }) {
  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
      {kind === 'video' ? (
        <Video className="h-10 w-10" />
      ) : kind === 'audio' ? (
        <FileAudio className="h-10 w-10" />
      ) : (
        <ImageIcon className="h-10 w-10" />
      )}
    </div>
  );
}

export function MediaThumbnail({ kind, title, previewUrl, loading = false }: MediaThumbnailProps) {
  if (loading) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!previewUrl) {
    return <Placeholder kind={kind} />;
  }

  if (kind === 'image') {
    return (
      <img
        src={previewUrl}
        alt={title}
        loading="lazy"
        className="aspect-[4/3] w-full rounded-2xl object-cover"
      />
    );
  }

  if (kind === 'video') {
    return (
      <video
        src={previewUrl}
        muted
        playsInline
        preload="metadata"
        className="aspect-[4/3] w-full rounded-2xl bg-black object-cover"
      />
    );
  }

  return <Placeholder kind={kind} />;
}
