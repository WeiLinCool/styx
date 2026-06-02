'use client';

import { FormEvent, ReactNode, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import type { AdminContentRow } from '@/server/repositories/content';

type FormState = {
  slug: string;
  title: string;
  body: string;
  url: string;
  metadata: string;
};

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await adminApiRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : '后台内容操作失败。';
    throw new Error(message);
  }
}

function buildInitialState(content?: AdminContentRow): FormState {
  return {
    slug: content?.slug ?? 'home.hero',
    title: content?.title ?? '',
    body: content?.body ?? '',
    url: content?.mediaReference !== 'none' ? (content?.mediaReference ?? '') : '',
    metadata: JSON.stringify(content?.metadata ?? {}, null, 2),
  };
}

function ContentDialog({
  content,
  trigger,
}: {
  content?: AdminContentRow;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(content));
  const [, startTransition] = useTransition();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      const metadata = JSON.parse(formState.metadata);
      await postJson(content ? `/api/admin/content/${content.id}` : '/api/admin/content', {
        slug: formState.slug,
        title: formState.title,
        body: formState.body || null,
        url: formState.url || null,
        metadata,
      });
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '后台内容操作失败。');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{content ? '编辑首页内容' : '新增首页内容'}</DialogTitle>
          <DialogDescription>
            metadata 使用结构化 JSON，发布前会在服务端校验。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`content-slug-${content?.id ?? 'new'}`}>Slug</Label>
              <Input
                id={`content-slug-${content?.id ?? 'new'}`}
                value={formState.slug}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, slug: event.target.value }))
                }
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`content-title-${content?.id ?? 'new'}`}>标题</Label>
              <Input
                id={`content-title-${content?.id ?? 'new'}`}
                value={formState.title}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, title: event.target.value }))
                }
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`content-url-${content?.id ?? 'new'}`}>媒体引用</Label>
            <Input
              id={`content-url-${content?.id ?? 'new'}`}
              value={formState.url}
              onChange={(event) =>
                setFormState((current) => ({ ...current, url: event.target.value }))
              }
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`content-body-${content?.id ?? 'new'}`}>正文摘要</Label>
            <Textarea
              id={`content-body-${content?.id ?? 'new'}`}
              value={formState.body}
              onChange={(event) =>
                setFormState((current) => ({ ...current, body: event.target.value }))
              }
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`content-metadata-${content?.id ?? 'new'}`}>Metadata JSON</Label>
            <Textarea
              id={`content-metadata-${content?.id ?? 'new'}`}
              className="min-h-64 font-mono text-xs"
              value={formState.metadata}
              onChange={(event) =>
                setFormState((current) => ({ ...current, metadata: event.target.value }))
              }
              disabled={pending}
            />
          </div>
          {message ? <p className="text-sm text-red-700">{message}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存草稿
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateAdminContentDialog() {
  return (
    <ContentDialog
      trigger={
        <Button type="button" className="h-9 rounded-md">
          <Plus className="h-4 w-4" />
          新增内容
        </Button>
      }
    />
  );
}

export function AdminContentActions({ content }: { content: AdminContentRow }) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function runStatusAction(action: 'publish' | 'draft' | 'archive') {
    setPendingAction(action);
    setMessage(null);
    try {
      await postJson(`/api/admin/content/${content.id}/${action}`, {});
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '后台内容操作失败。');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-1.5">
        <ContentDialog
          content={content}
          trigger={
            <Button type="button" size="sm" variant="outline" className="h-7 rounded-md px-2 text-xs">
              编辑
            </Button>
          }
        />
        {content.status === 'published' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-md px-2 text-xs"
            disabled={pendingAction !== null}
            onClick={() => void runStatusAction('draft')}
          >
            {pendingAction === 'draft' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            下线
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-md px-2 text-xs"
            disabled={pendingAction !== null}
            onClick={() => void runStatusAction('publish')}
          >
            {pendingAction === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            发布
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-7 rounded-md px-2 text-xs"
          disabled={pendingAction !== null}
          onClick={() => void runStatusAction('archive')}
        >
          {pendingAction === 'archive' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          归档
        </Button>
      </div>
      {message ? <p className="max-w-64 text-right text-[11px] text-red-700">{message}</p> : null}
    </div>
  );
}
