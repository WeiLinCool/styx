# Media Thumbnail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an automatic thumbnail in the saved media library cards by rendering the media's own preview URL instead of the current icon-only placeholder.

**Architecture:** Keep persistence unchanged. The media library card asks the existing owner access API for a short-lived preview URL when a card becomes visible, renders an image or video preview directly from that signed URL, and falls back to the existing icon placeholder when preview acquisition fails. The preview modal and download/share actions continue to use the current access helpers.

**Tech Stack:** Next.js App Router, React client components, existing user media access APIs, existing `user-api-client` helpers, Vitest/node:test-style repository and feature tests.

---

### Task 1: Add a thumbnail helper for saved media cards

**Files:**
- Create: `src/features/public/media-thumbnail.tsx`
- Modify: `src/features/public/my-assets-page.tsx:1-620`
- Test: `src/features/public/media-thumbnail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';

import { render } from '@testing-library/react';
import { MediaThumbnail } from './media-thumbnail';

test('renders an image thumbnail when preview url is available', () => {
  const { getByAltText } = render(
    <MediaThumbnail kind="image" title="Demo image" previewUrl="https://example.com/image.png" />,
  );

  assert.ok(getByAltText('Demo image'));
});

test('renders a video thumbnail when preview url is available', () => {
  const { container } = render(
    <MediaThumbnail kind="video" title="Demo video" previewUrl="https://example.com/video.mp4" />,
  );

  assert.ok(container.querySelector('video'));
});

test('falls back to the existing placeholder when preview url is missing', () => {
  const { container } = render(
    <MediaThumbnail kind="audio" title="Demo audio" previewUrl={null} />,
  );

  assert.ok(container.textContent?.includes('audio'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/public/media-thumbnail.test.tsx -v`
Expected: FAIL because `MediaThumbnail` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { FileAudio, Image as ImageIcon, Loader2, Video } from 'lucide-react';

type MediaThumbnailProps = {
  kind: 'image' | 'audio' | 'video';
  title: string;
  previewUrl: string | null;
};

export function MediaThumbnail({ kind, title, previewUrl }: MediaThumbnailProps) {
  if (!previewUrl) {
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

  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
      <FileAudio className="h-10 w-10" />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/public/media-thumbnail.test.tsx -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/public/media-thumbnail.tsx src/features/public/media-thumbnail.test.tsx src/features/public/my-assets-page.tsx
git commit -m "feat: add media library thumbnails"
```

### Task 2: Wire the thumbnail into the media card grid

**Files:**
- Modify: `src/features/public/my-assets-page.tsx:1-620`
- Test: `src/features/public/my-assets-page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveMyAssetsView } from './my-assets-state';

test('keeps existing asset ordering logic unchanged', () => {
  const assets = [
    { id: '1', title: 'B', kind: 'image', sourceType: 'ai_generated', savedAt: '2026-06-02T00:00:00.000Z' },
    { id: '2', title: 'A', kind: 'image', sourceType: 'ai_generated', savedAt: '2026-06-03T00:00:00.000Z' },
  ] as const;

  const visible = deriveMyAssetsView(assets as never, {
    search: '',
    kind: 'all',
    sourceType: 'all',
    sort: 'newest',
  });

  assert.equal(visible[0]?.id, '2');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/features/public/my-assets-page.test.tsx -v`
Expected: FAIL if the test file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useEffect, useState } from 'react';
import { getSavedMediaAssetAccess } from './agent-runtime-client';
import { MediaThumbnail } from './media-thumbnail';

function ThumbnailCard({ asset }: { asset: GeneratedMediaAssetDto }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const access = await getSavedMediaAssetAccess(asset.id, 'preview');
        if (!cancelled) {
          setPreviewUrl(access.url);
        }
      } catch {
        if (!cancelled) {
          setPreviewUrl(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  return <MediaThumbnail kind={asset.kind} title={asset.title} previewUrl={previewUrl} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/features/public/my-assets-page.test.tsx -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/public/my-assets-page.tsx src/features/public/my-assets-page.test.tsx src/features/public/media-thumbnail.tsx src/features/public/media-thumbnail.test.tsx
git commit -m "feat: show preview thumbnails in media library"
```

### Task 3: Verify the UI still loads and the preview fallback remains intact

**Files:**
- Modify: `src/features/public/my-assets-page.tsx`
- Test: none new

- [ ] **Step 1: Run targeted validation**

Run: `pnpm validate`
Expected: PASS.

- [ ] **Step 2: Run a production build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Open the media library in the browser and confirm the grid now shows actual thumbnails when preview URLs resolve, while audio assets still use the icon fallback**

Run: `pnpm dev`
Expected: `/my-assets` renders thumbnail previews without breaking preview/download/share/delete actions.

- [ ] **Step 4: Commit**

```bash
git add src/features/public/my-assets-page.tsx
git commit -m "test: verify media thumbnail rendering"
```

### Self-Review

- Spec coverage: the plan keeps storage unchanged, uses the existing access API, renders automatic thumbnails for image/video assets, and preserves fallbacks for non-previewable media.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: `GeneratedMediaAssetDto`, `getSavedMediaAssetAccess`, and `MediaThumbnail` are used consistently across tasks.
- Scope check: this stays within one subsystem, the public saved-media library UI.
