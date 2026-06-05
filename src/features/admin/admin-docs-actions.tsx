'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, FileInput, FolderTree, Loader2, PencilLine, Rocket, SquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import type { AdminDocTableRow } from './admin-docs-types';

async function postJson(url: string, body?: Record<string, unknown>) {
  const response = await adminApiRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string' ? payload.error.message : '文档操作失败。';
    throw new Error(message);
  }

  return payload;
}

export function CreateDocArticleButton() {
  return (
    <Button asChild>
      <Link href="/admin/docs/articles/new">
        <SquarePlus className="h-4 w-4" />
        新建文档
      </Link>
    </Button>
  );
}

export function DocCenterActionButtons() {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button asChild variant="outline">
        <Link href="/admin/docs/categories">
          <FolderTree className="h-4 w-4" />
          维护分类
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/admin/docs/import">
          <FileInput className="h-4 w-4" />
          导入文档
        </Link>
      </Button>
      <CreateDocArticleButton />
    </div>
  );
}

export function AdminDocRowActions({ article }: { article: AdminDocTableRow }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'publish' | 'archive' | null>(null);
  const [, startTransition] = useTransition();

  async function run(action: 'publish' | 'archive') {
    setPendingAction(action);
    setMessage(null);
    try {
      await postJson(`/api/admin/docs/articles/${article.articleId}/${action}`);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文档操作失败。');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center justify-end gap-2">
        <Button asChild size="sm" variant="outline" className="h-8 rounded-md px-2 text-xs">
          <Link href={`/admin/docs/articles/${article.articleId}`}>
            <PencilLine className="h-3.5 w-3.5" />
            编辑
          </Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-md px-2 text-xs"
          disabled={pendingAction !== null || article.status === 'published'}
          onClick={() => run('publish')}
        >
          {pendingAction === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          发布
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-md px-2 text-xs"
          disabled={pendingAction !== null || article.status === 'archived'}
          onClick={() => run('archive')}
        >
          {pendingAction === 'archive' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
          下线
        </Button>
      </div>
      {message ? <p className="max-w-48 text-right text-[11px] text-destructive">{message}</p> : null}
    </div>
  );
}
