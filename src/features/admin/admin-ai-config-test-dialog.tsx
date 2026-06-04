'use client';

import { useState } from 'react';
import { Loader2, TestTube2 } from 'lucide-react';

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { adminApiRequest } from '@/lib/admin-api-client';
import { readJsonResponse } from '@/lib/api-response';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatAdminAiLabel } from './admin-ai-labels';
import { formatCredits } from '@/lib/credits';

type ConfigTestResult = {
  ok?: boolean;
  result?: {
    ok?: boolean;
    elapsedMs?: number;
    prompt?: string;
    providerLabel?: string;
    modelLabel?: string;
    error?: string | null;
    run?: {
      status?: string;
      finalMessage?: string | null;
      errorMessage?: string | null;
      usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      } | null;
      billing?: {
        status?: string;
        creditCost?: number | null;
        ledgerEntryId?: string | null;
      } | null;
    } | null;
    events?: Array<{
      eventType?: string;
      createdAt?: string;
    }>;
  };
  error?: {
    message?: string;
  };
};

function formatUsage(totalTokens: number | undefined) {
  return typeof totalTokens === 'number' ? `${totalTokens} token` : formatAdminAiLabel('unknown');
}

function formatBilling(status: string | undefined, creditCost: number | null | undefined) {
  const statusLabel = formatAdminAiLabel(status ?? 'unknown');

  return typeof creditCost === 'number' ? `${statusLabel} · ${formatCredits(creditCost)} 积分` : statusLabel;
}

export function AdminAiConfigTestDialog({
  title,
  description,
  triggerLabel,
  url,
  body,
  compact = false,
}: {
  title: string;
  description: string;
  triggerLabel: string;
  url: string;
  body: Record<string, unknown>;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ConfigTestResult | null>(null);
  const [prompt, setPrompt] = useState('请为石头印画设计一句标题');

  async function runTest() {
    setPending(true);
    setResult(null);

    try {
      const response = await adminApiRequest(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...body,
          prompt: prompt.trim(),
        }),
      });
      const payload = (await readJsonResponse(response)) as ConfigTestResult;
      setResult(payload);
    } finally {
      setPending(false);
    }
  }

  const trigger = (
    <Button
      type="button"
      size={compact ? 'icon-sm' : 'sm'}
      variant="outline"
      title={triggerLabel}
      aria-label={triggerLabel}
    >
      <TestTube2 className="h-3.5 w-3.5" />
      {compact ? null : triggerLabel}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {compact ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {triggerLabel}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="admin-ai-config-test-prompt">测试提示词</Label>
          <Textarea
            id="admin-ai-config-test-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            placeholder="输入一条和用户端接近的测试消息"
            disabled={pending}
          />
        </div>
        <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
          {result ? (
            result.ok ? (
              <div className="space-y-2">
                <p className="font-medium text-emerald-700">闭环测试成功。</p>
                <p>状态：{formatAdminAiLabel(result.result?.run?.status ?? 'succeeded')}</p>
                <p>耗时：{result.result?.elapsedMs ?? 0} ms</p>
                <p>模型：{result.result?.providerLabel} / {result.result?.modelLabel}</p>
                <p>
                  计费：
                  {formatBilling(
                    result.result?.run?.billing?.status,
                    result.result?.run?.billing?.creditCost,
                  )}
                </p>
                <p>用量：{formatUsage(result.result?.run?.usage?.totalTokens)}</p>
                <div className="space-y-1">
                  <p className="font-medium text-neutral-900">回复</p>
                  <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-card p-2 text-xs text-foreground">
                    {result.result?.run?.finalMessage ?? '无回复内容'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-medium text-red-700">
                  {result.result?.run?.finalMessage ? '供应商已回复，但闭环后续失败。' : '闭环测试失败。'}
                </p>
                <p>状态：{formatAdminAiLabel(result.result?.run?.status ?? 'failed')}</p>
                <p>{result.error?.message ?? result.result?.error ?? result.result?.run?.errorMessage ?? '请求未通过。'}</p>
                <p>
                  计费：
                  {formatBilling(
                    result.result?.run?.billing?.status,
                    result.result?.run?.billing?.creditCost,
                  )}
                </p>
                <p>用量：{formatUsage(result.result?.run?.usage?.totalTokens)}</p>
                {result.result?.run?.finalMessage ? (
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">供应商回复</p>
                    <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border bg-card p-2 text-xs text-foreground">
                      {result.result.run.finalMessage}
                    </div>
                  </div>
                ) : null}
                <p>事件数：{result.result?.events?.length ?? 0}</p>
              </div>
            )
          ) : (
            <p>输入接近用户真实请求的提示词，点击开始测试后返回完整闭环结果。</p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            关闭
          </Button>
          <Button type="button" disabled={pending} onClick={() => void runTest()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            开始测试
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
