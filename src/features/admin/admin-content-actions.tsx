'use client';

import { FormEvent, ReactNode, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  contentSlugOptions,
  getContentSchema,
  getDefaultContentBody,
  getDefaultContentMetadata,
  getDefaultContentTitle,
  type ContentField,
} from '@/features/admin/admin-content-schema';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import type { AdminContentRow } from '@/server/repositories/content';

type MetadataValue = Record<string, unknown>;

type FormState = {
  slug: string;
  title: string;
  body: string;
  url: string;
  metadata: MetadataValue;
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
  const slug = content?.slug ?? 'home.hero';
  return {
    slug,
    title: content?.title ?? getDefaultContentTitle(slug),
    body: content?.body ?? getDefaultContentBody(slug),
    url: content?.mediaReference !== 'none' ? (content?.mediaReference ?? '') : '',
    metadata: content?.metadata ?? getDefaultContentMetadata(slug),
  };
}

function pathParts(path: string) {
  return path ? path.split('.') : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readValue(source: unknown, path: string): unknown {
  if (!path) {
    return source;
  }

  let current = source;
  for (const part of pathParts(path)) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function writeValue(source: unknown, path: string, value: unknown): unknown {
  if (!path) {
    return value;
  }

  const clone = isRecord(source) ? { ...source } : {};
  let current: Record<string, unknown> = clone;
  const parts = pathParts(path);

  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    current[part] = isRecord(next) ? { ...next } : {};
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
  return clone;
}

function readString(source: unknown, path: string) {
  const value = readValue(source, path);
  return typeof value === 'string' ? value : '';
}

function defaultListItem(fields: ContentField[]) {
  if (fields.length === 1 && fields[0].path === '') {
    return '';
  }

  return fields.reduce<Record<string, unknown>>((item, field) => {
    item[field.path] =
      field.kind === 'object'
        ? defaultListItem(field.fields)
        : field.kind === 'list'
          ? []
          : field.kind === 'color'
            ? '#000000'
            : '';
    return item;
  }, {});
}

function FieldHelp({ children }: { children?: string }) {
  if (!children) {
    return null;
  }

  return <p className="text-xs leading-5 text-muted-foreground">{children}</p>;
}

function VisualField({
  field,
  value,
  onChange,
}: {
  field: ContentField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === 'object') {
    return (
      <fieldset className="rounded-lg border border-border bg-card p-3">
        <legend className="px-1 text-sm font-medium text-foreground">{field.label}</legend>
        <FieldHelp>{field.help}</FieldHelp>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {field.fields.map((child) => (
            <VisualField
              key={child.path}
              field={child}
              value={readValue(value, child.path)}
              onChange={(nextValue) => onChange(writeValue(value, child.path, nextValue))}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.kind === 'list') {
    const items = Array.isArray(value) ? value : [];
    const canRemove = items.length > (field.minItems ?? 0);
    const canAdd = typeof field.maxItems !== 'number' || items.length < field.maxItems;

    return (
      <fieldset className="rounded-lg border border-border bg-card p-3">
        <legend className="px-1 text-sm font-medium text-foreground">{field.label}</legend>
        <FieldHelp>{field.help}</FieldHelp>
        <div className="mt-3 space-y-3">
          {items.map((item, index) => (
            <div key={index} className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {field.itemLabel} {index + 1}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-md px-2 text-xs"
                  disabled={!canRemove}
                  onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {field.fields.map((child) => (
                  <VisualField
                    key={child.path}
                    field={child}
                    value={readValue(item, child.path)}
                    onChange={(nextValue) =>
                      onChange(
                        items.map((currentItem, itemIndex) =>
                          itemIndex === index ? writeValue(currentItem, child.path, nextValue) : currentItem,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-md text-xs"
            disabled={!canAdd}
            onClick={() => onChange([...items, defaultListItem(field.fields)])}
          >
            <Plus className="h-3.5 w-3.5" />
            添加{field.itemLabel}
          </Button>
        </div>
      </fieldset>
    );
  }

  const id = `content-field-${field.path || field.label}`;
  const stringValue = typeof value === 'string' ? value : '';

  if (field.kind === 'textarea') {
    return (
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={id}>{field.label}</Label>
        <Textarea id={id} value={stringValue} onChange={(event) => onChange(event.target.value)} />
        <FieldHelp>{field.help}</FieldHelp>
      </div>
    );
  }

  if (field.kind === 'select') {
    return (
      <div className="space-y-2">
        <Label>{field.label}</Label>
        <Select value={stringValue} onValueChange={onChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldHelp>{field.help}</FieldHelp>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{field.label}</Label>
      <Input
        id={id}
        type={field.kind === 'color' ? 'color' : 'text'}
        value={stringValue}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldHelp>{field.help}</FieldHelp>
    </div>
  );
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
  const [showJson, setShowJson] = useState(false);
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(content));
  const [, startTransition] = useTransition();
  const schema = useMemo(() => getContentSchema(formState.slug), [formState.slug]);
  const metadataJson = useMemo(() => JSON.stringify(formState.metadata, null, 2), [formState.metadata]);

  function updateSlug(slug: string) {
    setFormState((current) => ({
      ...current,
      slug,
      title:
        !content && current.title === getDefaultContentTitle(current.slug)
          ? getDefaultContentTitle(slug)
          : current.title,
      body:
        !content && current.body === getDefaultContentBody(current.slug)
          ? getDefaultContentBody(slug)
          : current.body,
      metadata: getDefaultContentMetadata(slug),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      await postJson(content ? `/api/admin/content/${content.id}` : '/api/admin/content', {
        slug: formState.slug,
        title: formState.title,
        body: formState.body || null,
        url: formState.url || null,
        metadata: formState.metadata,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{content ? '编辑首页内容' : '新增首页内容'}</DialogTitle>
          <DialogDescription>
            选择内容区块后填写结构化表单，系统会按前台 schema 生成 metadata。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>内容区块</Label>
              <Select value={formState.slug} onValueChange={updateSlug} disabled={pending}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contentSlugOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-muted-foreground">{schema.description}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`content-title-${content?.id ?? 'new'}`}>后台标题</Label>
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
              placeholder="可选：/images/example.png"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`content-body-${content?.id ?? 'new'}`}>后台摘要</Label>
            <Textarea
              id={`content-body-${content?.id ?? 'new'}`}
              value={formState.body}
              onChange={(event) =>
                setFormState((current) => ({ ...current, body: event.target.value }))
              }
              disabled={pending}
            />
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-3">
              <p className="text-sm font-medium text-foreground">{schema.label}字段</p>
              <p className="mt-1 text-xs text-muted-foreground">
                这里填写的内容会生成 metadata，并由用户端 /home 动态渲染。
              </p>
            </div>
            <div className="space-y-3">
              {schema.fields.map((field) => (
                <VisualField
                  key={field.path}
                  field={field}
                  value={readValue(formState.metadata, field.path)}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      metadata: writeValue(current.metadata, field.path, value) as MetadataValue,
                    }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-foreground"
              onClick={() => setShowJson((current) => !current)}
            >
              高级 JSON 预览
              {showJson ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showJson ? (
              <pre className="max-h-72 overflow-auto border-t border-border bg-secondary/50 p-3 text-xs leading-5 text-muted-foreground">
                {metadataJson}
              </pre>
            ) : null}
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
