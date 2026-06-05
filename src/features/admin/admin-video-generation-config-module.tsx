'use client';

import { useMemo, useState, useTransition } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import type { VideoStylePreset } from '@/server/repositories/video-generation-config';

type DraftStyle = VideoStylePreset & {
  draftId: string;
};

type SavePayload = {
  ok?: boolean;
  styles?: VideoStylePreset[];
  error?: {
    message?: string;
  };
};

function toDraftStyle(style: VideoStylePreset, index: number): DraftStyle {
  return {
    ...style,
    draftId: style.id || `style-${index}`,
  };
}

function createEmptyDraft(sortOrder: number): DraftStyle {
  const draftId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `new-${Date.now()}`;

  return {
    id: '',
    draftId,
    code: '',
    name: '',
    prompt: '',
    enabled: true,
    sortOrder,
  };
}

function normalizeDraftForSave(style: DraftStyle) {
  return {
    ...(style.id ? { id: style.id } : {}),
    code: style.code.trim(),
    name: style.name.trim(),
    prompt: style.prompt.trim(),
    enabled: style.enabled,
    sortOrder: style.sortOrder,
  };
}

function getLocalValidationError(styles: DraftStyle[]) {
  for (const style of styles) {
    if (!style.code.trim()) {
      return '风格代码不能为空。';
    }
    if (!style.name.trim()) {
      return '风格名称不能为空。';
    }
    if (!style.prompt.trim()) {
      return '提示词不能为空。';
    }
  }

  return null;
}

export function AdminVideoGenerationConfigModule({
  initialStyles,
}: {
  initialStyles: VideoStylePreset[];
}) {
  const [styles, setStyles] = useState<DraftStyle[]>(() => initialStyles.map(toDraftStyle));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sortedStyles = useMemo(
    () =>
      [...styles].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }
        return left.code.localeCompare(right.code);
      }),
    [styles],
  );

  function updateStyle(draftId: string, patch: Partial<DraftStyle>) {
    setStyles((current) =>
      current.map((style) => (style.draftId === draftId ? { ...style, ...patch } : style)),
    );
  }

  function addStyle() {
    const nextSortOrder =
      styles.reduce((max, style) => Math.max(max, style.sortOrder), 0) + 1;
    setStyles((current) => [...current, createEmptyDraft(nextSortOrder)]);
    setMessage(null);
    setError(null);
  }

  function removeStyle(draftId: string) {
    setStyles((current) => current.filter((style) => style.draftId !== draftId));
    setMessage(null);
    setError(null);
  }

  function saveStyles() {
    const validationError = getLocalValidationError(styles);
    if (validationError) {
      setError(validationError);
      setMessage(null);
      return;
    }

    startTransition(async () => {
      setError(null);
      setMessage(null);

      try {
        const response = await adminApiRequest('/api/admin/video-generation-config', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ styles: sortedStyles.map(normalizeDraftForSave) }),
        });
        const payload = await readJsonResponse<SavePayload>(response);

        if (!response.ok) {
          throw new Error(payload?.error?.message ?? '保存视频风格配置失败。');
        }

        setStyles((payload?.styles ?? []).map(toDraftStyle));
        setMessage('已保存视频风格配置。未提交的历史风格不会被删除，请通过禁用控制下线。');
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : '保存视频风格配置失败。');
      }
    });
  }

  return (
    <Card className="gap-0 rounded-lg border-border bg-card py-0 shadow-sm">
      <CardHeader className="border-b border-border px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">视频风格预设</CardTitle>
            <CardDescription className="mt-1">
              管理会员视频生成页面的风格代码、显示名称与默认提示词。
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-md px-2 text-xs"
              onClick={addStyle}
              disabled={isPending}
            >
              <Plus className="h-4 w-4" />
              添加
            </Button>
            <Button
              type="button"
              className="h-8 rounded-md px-2 text-xs"
              onClick={saveStyles}
              disabled={isPending}
            >
              <Save className="h-4 w-4" />
              保存
            </Button>
          </div>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </CardHeader>
      <CardContent className="px-0 py-0">
        <div className="overflow-x-auto">
          <div className="min-w-[960px]">
            <div className="grid grid-cols-[120px_150px_minmax(320px,1fr)_88px_92px_64px] gap-2 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
              <div>代码</div>
              <div>名称</div>
              <div>提示词</div>
              <div>启用</div>
              <div>排序</div>
              <div className="text-right">移除</div>
            </div>
            {sortedStyles.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                暂无视频风格预设。
              </div>
            ) : (
              sortedStyles.map((style) => (
                <div
                  key={style.draftId}
                  className="grid grid-cols-[120px_150px_minmax(320px,1fr)_88px_92px_64px] items-start gap-2 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <Input
                    value={style.code}
                    onChange={(event) => updateStyle(style.draftId, { code: event.target.value })}
                    placeholder="stone"
                    className="h-8 rounded-md text-xs"
                    disabled={isPending}
                  />
                  <Input
                    value={style.name}
                    onChange={(event) => updateStyle(style.draftId, { name: event.target.value })}
                    placeholder="石头印画"
                    className="h-8 rounded-md text-xs"
                    disabled={isPending}
                  />
                  <Textarea
                    value={style.prompt}
                    onChange={(event) =>
                      updateStyle(style.draftId, { prompt: event.target.value })
                    }
                    placeholder="石头印画动态短片"
                    className="min-h-16 rounded-md text-xs"
                    disabled={isPending}
                  />
                  <label className="flex h-8 items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={style.enabled}
                      onCheckedChange={(checked) =>
                        updateStyle(style.draftId, { enabled: checked === true })
                      }
                      disabled={isPending}
                    />
                    启用
                  </label>
                  <Input
                    type="number"
                    value={style.sortOrder}
                    onChange={(event) =>
                      updateStyle(style.draftId, { sortOrder: Number(event.target.value) })
                    }
                    className="h-8 rounded-md text-xs"
                    disabled={isPending}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-md"
                      onClick={() => removeStyle(style.draftId)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
