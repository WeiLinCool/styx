'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import type { AdminDocCategoryRow } from './admin-docs-types';

type CategoryDraft = {
  name: string;
  slug: string;
  description: string;
  audienceScope: 'user' | 'admin' | 'shared';
  sortOrder: string;
};

function createDraft(category?: AdminDocCategoryRow): CategoryDraft {
  return {
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    description: category?.description ?? '',
    audienceScope: category?.audienceScope ?? 'shared',
    sortOrder: String(category?.sortOrder ?? 0),
  };
}

function groupCategories(categories: AdminDocCategoryRow[]) {
  const parents = categories.filter((category) => !category.parentId);
  return parents.map((parent) => ({
    ...parent,
    children: categories.filter((category) => category.parentId === parent.id),
  }));
}

async function sendJson(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>) {
  const response = await adminApiRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : JSON.stringify({}),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof payload?.error?.message === 'string' ? payload.error.message : '分类维护失败。';
    throw new Error(message);
  }

  return payload;
}

function CategoryForm({
  category,
  parentId,
  title,
  submitLabel,
  canDelete,
  onSaved,
}: {
  category?: AdminDocCategoryRow;
  parentId: string | null;
  title: string;
  submitLabel: string;
  canDelete: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<CategoryDraft>(() => createDraft(category));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);

    try {
      await sendJson(
        category ? `/api/admin/docs/categories/${category.id}` : '/api/admin/docs/categories',
        category ? 'PATCH' : 'POST',
        {
          name: draft.name,
          slug: draft.slug,
          description: draft.description,
          parentId,
          audienceScope: draft.audienceScope,
          sortOrder: Number(draft.sortOrder || 0),
        },
      );
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '分类维护失败。');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!category) {
      return;
    }
    setMessage(null);
    setPending(true);

    try {
      await sendJson(`/api/admin/docs/categories/${category.id}`, 'DELETE');
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '分类删除失败。');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {category ? <div className="text-xs text-muted-foreground">已关联 {category.articleCount} 篇文档</div> : null}
        </div>
        {category ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md px-2 text-xs"
            disabled={pending || !canDelete}
            onClick={handleDelete}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            删除
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>分类名</Label>
          <Input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input
            value={draft.slug}
            onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
            disabled={pending}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_180px_140px]">
        <div className="space-y-2">
          <Label>描述</Label>
          <Textarea
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            disabled={pending}
            className="min-h-20"
          />
        </div>
        <div className="space-y-2">
          <Label>可见范围</Label>
          <select
            value={draft.audienceScope}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                audienceScope: event.target.value as CategoryDraft['audienceScope'],
              }))
            }
            disabled={pending}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs"
          >
            <option value="shared">共享</option>
            <option value="user">用户端</option>
            <option value="admin">管理端</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>排序</Label>
          <Input
            type="number"
            value={draft.sortOrder}
            onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
            disabled={pending}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-destructive">{message}</div>
        <Button type="submit" size="sm" className="h-8 rounded-md px-3 text-xs" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function AdminDocCategoriesManager({ categories }: { categories: AdminDocCategoryRow[] }) {
  const tree = useMemo(() => groupCategories(categories), [categories]);
  const refresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="space-y-4">
      <CategoryForm
        parentId={null}
        title="新增一级分类"
        submitLabel="创建一级分类"
        canDelete={false}
        onSaved={refresh}
      />

      {tree.map((parent) => (
        <section key={parent.id} className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <CategoryForm
            category={parent}
            parentId={null}
            title={parent.name}
            submitLabel="保存一级分类"
            canDelete={parent.articleCount === 0 && parent.children.length === 0}
            onSaved={refresh}
          />
          <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
            <div className="text-sm font-medium text-foreground">二级分类</div>
            {parent.children.map((child) => (
              <CategoryForm
                key={child.id}
                category={child}
                parentId={parent.id}
                title={child.name}
                submitLabel="保存二级分类"
                canDelete={child.articleCount === 0}
                onSaved={refresh}
              />
            ))}
            <CategoryForm
              parentId={parent.id}
              title="新增二级分类"
              submitLabel="创建二级分类"
              canDelete={false}
              onSaved={refresh}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
