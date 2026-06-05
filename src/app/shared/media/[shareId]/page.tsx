import { SharedMediaPage } from '@/features/public/shared-media-page';

async function loadSharedMedia(shareId: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/public/media-share/${shareId}`, {
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) {
    return null;
  }

  return response.json();
}

export default async function SharedMediaEntryPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const payload = await loadSharedMedia(shareId);

  return <SharedMediaPage shareId={shareId} payload={payload} />;
}
