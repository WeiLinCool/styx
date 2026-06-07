'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Check, Film, Loader2, Sparkles, Wand2 } from 'lucide-react';

import {
  createAgentRun,
  getAgentRunDetail,
  getGeneratedRunArtifactAccess,
  listChatModels,
  selectChatModelId,
  type ChatModelOption,
} from '@/features/public/agent-runtime-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DirectMediaResultDto } from '@/server/agent/types';
import {
  buildPromptOptimizationPrompt,
  readPromptOptimizationMessage,
} from './workflow-quick-actions';

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForTerminalRun(input: {
  runId: string;
  operationRef: MutableRefObject<number>;
  operationId: number;
  maxAttempts?: number;
}) {
  const maxAttempts = input.maxAttempts ?? 20;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (input.operationRef.current !== input.operationId) {
      return null;
    }

    const detail = await getAgentRunDetail(input.runId);
    if (input.operationRef.current !== input.operationId) {
      return null;
    }

    if (detail.run.status === 'succeeded' || detail.run.status === 'failed') {
      return detail;
    }

    await delay(1000);
  }

  throw new Error('AI 请求超时，请稍后重试。');
}

function readStorageStatus(value: unknown): DirectMediaResultDto['metadata']['storageStatus'] {
  return value === 'provider_direct' || value === 'cached' || value === 'stored' ? value : 'cached';
}

export function filterWorkflowChatModels(models: ChatModelOption[]) {
  return models.filter((model) => model.providerName !== 'Development Provider');
}

export function getWorkflowChatModelLabel(model: ChatModelOption) {
  return `${model.name} · ${model.providerName}`;
}

export type PromptOptimizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPrompt: string;
  isLoggedIn: boolean;
  activationRequired: boolean;
  openLoginModal: () => void;
  onApply: (prompt: string) => void;
};

export function PromptOptimizationDialog({
  open,
  onOpenChange,
  currentPrompt,
  isLoggedIn,
  activationRequired,
  openLoginModal,
  onApply,
}: PromptOptimizationDialogProps) {
  const [draftPrompt, setDraftPrompt] = useState(currentPrompt);
  const [optimizedPrompt, setOptimizedPrompt] = useState<string | null>(null);
  const [chatModels, setChatModels] = useState<ChatModelOption[]>([]);
  const [selectedChatModelId, setSelectedChatModelId] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef(0);
  const selectedChatModel = chatModels.find((model) => model.id === selectedChatModelId) ?? null;
  const canOptimize = Boolean(selectedChatModelId) && !loadingModels && !optimizing;

  useEffect(() => {
    if (!open) {
      operationRef.current += 1;
      return;
    }

    setDraftPrompt(currentPrompt);
    setOptimizedPrompt(null);
    setError(null);

    if (!isLoggedIn || activationRequired) {
      setChatModels([]);
      setSelectedChatModelId(null);
      setLoadingModels(false);
      return;
    }

    let cancelled = false;
    setLoadingModels(true);
    void listChatModels()
      .then((models) => {
        if (cancelled) {
          return;
        }

        const filteredModels = filterWorkflowChatModels(models);
        setChatModels(filteredModels);
        setSelectedChatModelId(selectChatModelId(filteredModels));
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setChatModels([]);
        setSelectedChatModelId(null);
        setError(loadError instanceof Error ? loadError.message : '聊天模型加载失败');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingModels(false);
        }
      });

    return () => {
      cancelled = true;
      operationRef.current += 1;
    };
  }, [activationRequired, currentPrompt, isLoggedIn, open]);

  const handleOptimize = async () => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (activationRequired) {
      setError('账号激活后可使用 AI 提示词优化。');
      return;
    }
    if (!selectedChatModelId) {
      setError(loadingModels ? '聊天模型加载中...' : '当前没有可用的聊天模型。');
      return;
    }

    const operationId = operationRef.current + 1;
    operationRef.current = operationId;
    setOptimizing(true);
    setError(null);
    setOptimizedPrompt(null);

    try {
      const { run } = await createAgentRun({
        taskType: 'chat',
        prompt: buildPromptOptimizationPrompt(draftPrompt),
        modelId: selectedChatModelId,
      });

      if (run.status === 'failed') {
        throw new Error(run.errorMessage ?? '提示词优化失败');
      }

      const detail = await waitForTerminalRun({
        runId: run.id,
        operationRef,
        operationId,
      });
      if (!detail) {
        return;
      }

      const nextPrompt = readPromptOptimizationMessage(detail.run);
      if (!nextPrompt) {
        throw new Error('优化结果为空，请重试。');
      }

      setOptimizedPrompt(nextPrompt);
    } catch (optimizeError) {
      if (operationRef.current !== operationId) {
        return;
      }
      setError(optimizeError instanceof Error ? optimizeError.message : '提示词优化失败');
    } finally {
      if (operationRef.current === operationId) {
        setOptimizing(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Wand2 size={18} />
            AI 对话优化提示词
          </DialogTitle>
          <DialogDescription>
            在当前工作流上下文里生成一版更清晰的提示词，只有点击“应用到当前工作流”才会覆盖主页面内容。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
            {loadingModels
              ? '正在加载聊天模型...'
              : selectedChatModel
                ? `当前优化模型：${selectedChatModel.name}`
                : '当前没有可用聊天模型。'}
          </div>

          {chatModels.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">选择优化模型</p>
              <Select
                value={selectedChatModelId ?? ''}
                onValueChange={setSelectedChatModelId}
                disabled={loadingModels || optimizing}
              >
                <SelectTrigger className="w-full rounded-xl border-input bg-card px-4 py-3 text-sm">
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  {chatModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {getWorkflowChatModelLabel(model)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">当前提示词</p>
            <textarea
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.target.value)}
              rows={6}
              className="w-full resize-none rounded-xl border border-input bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          ) : null}

          {optimizedPrompt ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">优化结果</p>
              <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-foreground">
                {optimizedPrompt}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
              生成后会在这里显示一版可直接应用的提示词。
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-xl border border-border px-4 py-2.5 text-sm text-foreground transition-colors hover:border-ring"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={handleOptimize}
            disabled={!canOptimize || draftPrompt.trim().length === 0}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground transition-colors hover:border-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {optimizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            生成优化版本
          </button>
          <button
            type="button"
            onClick={() => {
              if (!optimizedPrompt) {
                return;
              }
              onApply(optimizedPrompt);
              onOpenChange(false);
            }}
            disabled={!optimizedPrompt}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check size={14} />
            应用到当前工作流
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ReferenceImageDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
  selectedImageModelId: string | null;
  isLoggedIn: boolean;
  activationRequired: boolean;
  openLoginModal: () => void;
  onApply: (sceneUrl: string) => void;
};

export function ReferenceImageDialog({
  open,
  onOpenChange,
  prompt,
  selectedImageModelId,
  isLoggedIn,
  activationRequired,
  openLoginModal,
  onApply,
}: ReferenceImageDialogProps) {
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<DirectMediaResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef(0);

  useEffect(() => {
    if (!open) {
      operationRef.current += 1;
      return;
    }

    setGenerating(false);
    setGeneratedImage(null);
    setError(null);

    return () => {
      operationRef.current += 1;
    };
  }, [open]);

  const handleGenerate = async () => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    if (activationRequired) {
      setError('账号激活后可生成参考图。');
      return;
    }
    if (!selectedImageModelId) {
      setError('当前没有可用的生图模型。');
      return;
    }
    if (!prompt.trim()) {
      setError('请先填写提示词后再生成参考图。');
      return;
    }

    const operationId = operationRef.current + 1;
    operationRef.current = operationId;
    setGenerating(true);
    setGeneratedImage(null);
    setError(null);

    try {
      const { run } = await createAgentRun({
        taskType: 'image',
        prompt: prompt.trim(),
        modelId: selectedImageModelId,
        input: {
          mode: 'generate',
        },
      });

      if (run.status === 'failed') {
        throw new Error(run.errorMessage ?? '参考图生成失败');
      }

      const detail = await waitForTerminalRun({
        runId: run.id,
        operationRef,
        operationId,
        maxAttempts: 30,
      });
      if (!detail) {
        return;
      }
      if (detail.run.status === 'failed') {
        throw new Error(detail.run.errorMessage ?? '参考图生成失败');
      }

      const artifact = detail.run.artifacts.find(
        (item) => item.kind === 'image' && item.status === 'ready',
      );
      if (!artifact) {
        throw new Error('参考图生成完成，但没有找到可预览的结果。');
      }

      const access = await getGeneratedRunArtifactAccess(detail.run.id, artifact.id, 'preview');
      if (operationRef.current !== operationId) {
        return;
      }

      setGeneratedImage({
        kind: 'image',
        title: artifact.title,
        delivery: {
          mode: 'provider_url',
          url: access.url,
          expiresAt: access.expiresAt,
        },
        metadata: {
          ...artifact.metadata,
          artifactId: artifact.id,
          storageStatus: readStorageStatus(artifact.metadata.storageStatus),
        },
      });
    } catch (generateError) {
      if (operationRef.current !== operationId) {
        return;
      }
      setError(generateError instanceof Error ? generateError.message : '参考图生成失败');
    } finally {
      if (operationRef.current === operationId) {
        setGenerating(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Film size={18} />
            生成参考图
          </DialogTitle>
          <DialogDescription>
            根据当前工作流提示词生成一张参考图。只有点击“应用为当前场景”才会写回当前工作流。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
            {prompt.trim() || '当前没有可用提示词。'}
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {generatedImage ? (
              <img
                src={generatedImage.delivery.url}
                alt={generatedImage.title}
                className="mx-auto max-h-[420px] w-full object-contain"
              />
            ) : (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
                {generating ? (
                  <>
                    <Loader2 size={28} className="animate-spin text-foreground/40" />
                    <p className="text-sm font-medium text-foreground">参考图生成中...</p>
                  </>
                ) : (
                  <>
                    <Sparkles size={28} className="text-foreground/40" />
                    <p className="text-sm font-medium text-foreground">生成后在这里预览参考图</p>
                    <p className="text-xs text-muted-foreground">应用后会回填为当前场景</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-xl border border-border px-4 py-2.5 text-sm text-foreground transition-colors hover:border-ring"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground transition-colors hover:border-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            生成参考图
          </button>
          <button
            type="button"
            onClick={() => {
              if (!generatedImage) {
                return;
              }
              onApply(generatedImage.delivery.url);
              onOpenChange(false);
            }}
            disabled={!generatedImage}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check size={14} />
            应用为当前场景
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
