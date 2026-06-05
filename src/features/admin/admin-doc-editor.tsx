'use client';

import { FormEvent, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import { AdminDocBlockEditor } from './admin-doc-block-editor';
import {
  fromDocBlocks,
  toDocBlocks,
  validateAdminEditableBlocks,
} from './admin-doc-blocks';
import type { AdminDocEditorData } from './admin-docs-types';

type EditorState = {
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  coverImage: string;
  status: 'draft' | 'published' | 'archived';
};

function buildInitialState(data: AdminDocEditorData): EditorState {
  return {
    categoryId: data.article.categoryId,
    title: data.article.title,
    slug: data.article.slug,
    summary: data.article.summary,
    coverImage: data.article.coverImage,
    status: data.article.status,
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await adminApiRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string' ? payload.error.message : '文档保存失败。';
    throw new Error(message);
  }

  return payload;
}

export function AdminDocEditor({ data }: { data: AdminDocEditorData }) {
  const router = useRouter();
  const [state, setState] = useState<EditorState>(() => buildInitialState(data));
  const [blocks, setBlocks] = useState(() => fromDocBlocks(data.article.blocks));
  const [message, setMessage] = useState<string | null>(null);
  const [blockErrors, setBlockErrors] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  const categoryOptions = useMemo(
    () =>
      data.categories.map((category) => ({
        value: category.id,
        label: `${category.name} · ${category.audienceScope}`,
      })),
    [data.categories],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const validation = validateAdminEditableBlocks(blocks);
    setBlockErrors(validation.errors);
    if (!validation.ok) {
      setPending(false);
      return;
    }

    try {
      const payload = {
        categoryId: state.categoryId,
        title: state.title,
        slug: state.slug || slugify(state.title),
        summary: state.summary,
        coverImage: state.coverImage || null,
        status: state.status,
        blocks: toDocBlocks(blocks),
      };
      const url = data.article.id
        ? `/api/admin/docs/articles/${data.article.id}`
        : '/api/admin/docs/articles';
      const result = await postJson(url, payload);
      const articleId =
        typeof result?.article?.id === 'string'
          ? result.article.id
          : data.article.id;

      if (articleId) {
        startTransition(() => {
          router.push(`/admin/docs/articles/${articleId}`);
          router.refresh();
        });
      } else {
        startTransition(() => router.refresh());
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文档保存失败。');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>所属分类</Label>
          <Select
            value={state.categoryId}
            onValueChange={(value) => setState((current) => ({ ...current, categoryId: value }))}
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>状态</Label>
          <Select
            value={state.status}
            onValueChange={(value: 'draft' | 'published' | 'archived') =>
              setState((current) => ({ ...current, status: value }))
            }
            disabled={pending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
              <SelectItem value="archived">已下线</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="doc-title">标题</Label>
          <Input
            id="doc-title"
            value={state.title}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                title: event.target.value,
                slug: current.slug || slugify(event.target.value),
              }))
            }
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="doc-slug">Slug</Label>
          <Input
            id="doc-slug"
            value={state.slug}
            onChange={(event) => setState((current) => ({ ...current, slug: event.target.value }))}
            disabled={pending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="doc-summary">摘要</Label>
        <Textarea
          id="doc-summary"
          value={state.summary}
          onChange={(event) => setState((current) => ({ ...current, summary: event.target.value }))}
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="doc-cover-image">封面图 URL</Label>
        <Input
          id="doc-cover-image"
          value={state.coverImage}
          onChange={(event) => setState((current) => ({ ...current, coverImage: event.target.value }))}
          disabled={pending}
        />
      </div>

      <AdminDocBlockEditor blocks={blocks} onChange={setBlocks} errorMessages={blockErrors} />

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-destructive">{message}</div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={pending} asChild>
            <a href="/admin/docs">返回列表</a>
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            保存文档
          </Button>
        </div>
      </div>
    </form>
  );
}
