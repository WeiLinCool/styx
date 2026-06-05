'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type AdminEditableDocBlock,
  createEmptyAdminBlock,
} from './admin-doc-blocks';

function BlockCard({
  block,
  index,
  total,
  onChange,
  onMove,
  onDelete,
}: {
  block: AdminEditableDocBlock;
  index: number;
  total: number;
  onChange: (next: AdminEditableDocBlock) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            内容块 {index + 1}
          </div>
          <div className="text-xs text-muted-foreground">{block.kind}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onMove(-1)} disabled={index === 0}>
            上移
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onMove(1)} disabled={index === total - 1}>
            下移
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDelete}>
            删除
          </Button>
        </div>
      </div>

      {block.kind === 'rich_text' ? (
        <div className="space-y-2">
          <Label>正文</Label>
          <Textarea
            value={block.body}
            onChange={(event) => onChange({ ...block, body: event.target.value })}
            className="min-h-32"
          />
        </div>
      ) : null}

      {block.kind === 'faq' ? (
        <div className="space-y-3">
          {block.items.map((item, itemIndex) => (
            <div key={item.id} className="grid gap-3 rounded-md border border-border p-3">
              <Input
                value={item.question}
                placeholder={`问题 ${itemIndex + 1}`}
                onChange={(event) =>
                  onChange({
                    ...block,
                    items: block.items.map((current) =>
                      current.id === item.id ? { ...current, question: event.target.value } : current,
                    ),
                  })
                }
              />
              <Textarea
                value={item.answer}
                placeholder="答案"
                onChange={(event) =>
                  onChange({
                    ...block,
                    items: block.items.map((current) =>
                      current.id === item.id ? { ...current, answer: event.target.value } : current,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      {block.kind === 'step_media' ? (
        <div className="space-y-3">
          {block.steps.map((step, stepIndex) => (
            <div key={step.id} className="grid gap-3 rounded-md border border-border p-3">
              <Input
                value={step.title}
                placeholder={`步骤 ${stepIndex + 1} 标题`}
                onChange={(event) =>
                  onChange({
                    ...block,
                    steps: block.steps.map((current) =>
                      current.id === step.id ? { ...current, title: event.target.value } : current,
                    ),
                  })
                }
              />
              <Textarea
                value={step.body}
                placeholder="步骤说明"
                onChange={(event) =>
                  onChange({
                    ...block,
                    steps: block.steps.map((current) =>
                      current.id === step.id ? { ...current, body: event.target.value } : current,
                    ),
                  })
                }
              />
              <Input
                value={step.imageUrl}
                placeholder="配图 URL（可选）"
                onChange={(event) =>
                  onChange({
                    ...block,
                    steps: block.steps.map((current) =>
                      current.id === step.id ? { ...current, imageUrl: event.target.value } : current,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      {block.kind === 'gallery' ? (
        <div className="space-y-3">
          {block.items.map((item, itemIndex) => (
            <div key={item.id} className="grid gap-3 rounded-md border border-border p-3">
              <Input
                value={item.imageUrl}
                placeholder={`图片 ${itemIndex + 1} URL`}
                onChange={(event) =>
                  onChange({
                    ...block,
                    items: block.items.map((current) =>
                      current.id === item.id ? { ...current, imageUrl: event.target.value } : current,
                    ),
                  })
                }
              />
              <Input
                value={item.title}
                placeholder="标题"
                onChange={(event) =>
                  onChange({
                    ...block,
                    items: block.items.map((current) =>
                      current.id === item.id ? { ...current, title: event.target.value } : current,
                    ),
                  })
                }
              />
              <Textarea
                value={item.description}
                placeholder="说明"
                onChange={(event) =>
                  onChange({
                    ...block,
                    items: block.items.map((current) =>
                      current.id === item.id ? { ...current, description: event.target.value } : current,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : null}

      {block.kind === 'video' ? (
        <div className="grid gap-3">
          <Input value={block.title} placeholder="视频标题" onChange={(event) => onChange({ ...block, title: event.target.value })} />
          <Input value={block.url} placeholder="视频 URL" onChange={(event) => onChange({ ...block, url: event.target.value })} />
          <Input value={block.coverImage} placeholder="封面图 URL（可选）" onChange={(event) => onChange({ ...block, coverImage: event.target.value })} />
          <Textarea value={block.description} placeholder="视频说明" onChange={(event) => onChange({ ...block, description: event.target.value })} />
        </div>
      ) : null}

      {block.kind === 'audio' ? (
        <div className="grid gap-3">
          <Input value={block.title} placeholder="音频标题" onChange={(event) => onChange({ ...block, title: event.target.value })} />
          <Input value={block.url} placeholder="音频 URL" onChange={(event) => onChange({ ...block, url: event.target.value })} />
          <Textarea value={block.description} placeholder="音频说明" onChange={(event) => onChange({ ...block, description: event.target.value })} />
        </div>
      ) : null}

      {block.kind === 'unsupported' ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          当前块类型暂不支持可视化编辑，保存时会原样保留。
        </div>
      ) : null}
    </section>
  );
}

export function AdminDocBlockEditor({
  blocks,
  onChange,
  errorMessages,
}: {
  blocks: AdminEditableDocBlock[];
  onChange: (blocks: AdminEditableDocBlock[]) => void;
  errorMessages: string[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">内容块</h3>
          <p className="text-xs text-muted-foreground">按块维护文档内容，避免直接编辑底层 JSON。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['rich_text', 'faq', 'step_media', 'gallery', 'video', 'audio'] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...blocks, createEmptyAdminBlock(kind)])}
            >
              新增内容块
            </Button>
          ))}
        </div>
      </div>

      {errorMessages.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {errorMessages.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        {blocks.map((block, index) => (
          <BlockCard
            key={block.id}
            block={block}
            index={index}
            total={blocks.length}
            onChange={(next) => onChange(blocks.map((current) => (current.id === next.id ? next : current)))}
            onMove={(direction) => {
              const next = [...blocks];
              const targetIndex = index + direction;
              [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
              onChange(next);
            }}
            onDelete={() => onChange(blocks.filter((current) => current.id !== block.id))}
          />
        ))}
      </div>
    </div>
  );
}
