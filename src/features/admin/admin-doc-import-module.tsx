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
import type {
  AdminDocCategoryRow,
  AdminDocImportPreview,
} from './admin-docs-types';

type ImportState = {
  categoryId: string;
  sourceFilename: string;
  markdown: string;
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
      typeof payload?.error?.message === 'string' ? payload.error.message : 'Markdown 导入失败。';
    throw new Error(message);
  }

  return payload;
}

export function AdminDocImportModule({
  categories,
}: {
  categories: AdminDocCategoryRow[];
}) {
  const router = useRouter();
  const [state, setState] = useState<ImportState>({
    categoryId: categories[0]?.id ?? '',
    sourceFilename: 'guide.md',
    markdown: '# 操作指南\n\n> Q: 如何开始？\n> A: 先完成账号绑定。\n',
  });
  const [preview, setPreview] = useState<AdminDocImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: `${category.name} · ${category.audienceScope}`,
      })),
    [categories],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      const payload = await postJson('/api/admin/docs/import', state);
      setPreview(payload?.preview ?? null);
      const articleId = typeof payload?.article?.id === 'string' ? payload.article.id : null;
      if (articleId) {
        startTransition(() => router.push(`/admin/docs/articles/${articleId}`));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Markdown 导入失败。');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>导入分类</Label>
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
            <Label htmlFor="source-filename">文件名</Label>
            <Input
              id="source-filename"
              value={state.sourceFilename}
              onChange={(event) =>
                setState((current) => ({ ...current, sourceFilename: event.target.value }))
              }
              disabled={pending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="markdown-source">Markdown 内容</Label>
          <Textarea
            id="markdown-source"
            value={state.markdown}
            onChange={(event) => setState((current) => ({ ...current, markdown: event.target.value }))}
            disabled={pending}
            className="min-h-[28rem] font-mono text-xs"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-destructive">{message}</div>
          <Button type="submit" disabled={pending || !state.categoryId}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            导入为草稿
          </Button>
        </div>
      </form>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-foreground">导入预览</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            预览显示导入后的标题、摘要和块结构。保存后会直接生成草稿文章。
          </p>
        </div>
        {preview ? (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-foreground">{preview.title}</div>
              <div className="text-xs text-muted-foreground">{preview.summary || '无摘要'}</div>
            </div>
            <Textarea
              readOnly
              value={JSON.stringify(preview.blocks, null, 2)}
              className="min-h-[24rem] font-mono text-xs"
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            提交导入后会显示解析预览。
          </div>
        )}
      </section>
    </div>
  );
}
