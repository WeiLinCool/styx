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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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

export function AdminAiConfigTestDialog({
  title,
  description,
  triggerLabel,
  url,
  body,
}: {
  title: string;
  description: string;
  triggerLabel: string;
  url: string;
  body: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ConfigTestResult | null>(null);
  const [prompt, setPrompt] = useState('请为石头印画设计一句标题');

  async function runTest() {
    setPending(true);
    setResult(null);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...body,
          prompt: prompt.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ConfigTestResult;
      setResult(payload);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <TestTube2 className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="admin-ai-config-test-prompt">测试 Prompt</Label>
          <Textarea
            id="admin-ai-config-test-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            placeholder="输入一条和用户端接近的测试消息"
            disabled={pending}
          />
        </div>
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
          {result ? (
            result.ok ? (
              <div className="space-y-2">
                <p className="font-medium text-emerald-700">闭环测试成功。</p>
                <p>状态：{result.result?.run?.status ?? 'succeeded'}</p>
                <p>耗时：{result.result?.elapsedMs ?? 0} ms</p>
                <p>模型：{result.result?.providerLabel} / {result.result?.modelLabel}</p>
                <p>计费：{result.result?.run?.billing?.status ?? 'unknown'}{typeof result.result?.run?.billing?.creditCost === 'number' ? ` · ${result.result.run.billing.creditCost} credits` : ''}</p>
                <p>用量：{typeof result.result?.run?.usage?.totalTokens === 'number' ? `${result.result.run.usage.totalTokens} tokens` : 'unknown'}</p>
                <div className="space-y-1">
                  <p className="font-medium text-neutral-900">回复</p>
                  <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-neutral-200 bg-white p-2 text-xs text-neutral-800">
                    {result.result?.run?.finalMessage ?? '无回复内容'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-medium text-red-700">
                  {result.result?.run?.finalMessage ? '供应商已回复，但闭环后续失败。' : '闭环测试失败。'}
                </p>
                <p>状态：{result.result?.run?.status ?? 'failed'}</p>
                <p>{result.error?.message ?? result.result?.error ?? result.result?.run?.errorMessage ?? '请求未通过。'}</p>
                <p>计费：{result.result?.run?.billing?.status ?? 'unknown'}{typeof result.result?.run?.billing?.creditCost === 'number' ? ` · ${result.result.run.billing.creditCost} credits` : ''}</p>
                <p>用量：{typeof result.result?.run?.usage?.totalTokens === 'number' ? `${result.result.run.usage.totalTokens} tokens` : 'unknown'}</p>
                {result.result?.run?.finalMessage ? (
                  <div className="space-y-1">
                    <p className="font-medium text-neutral-900">供应商回复</p>
                    <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-neutral-200 bg-white p-2 text-xs text-neutral-800">
                      {result.result.run.finalMessage}
                    </div>
                  </div>
                ) : null}
                <p>事件数：{result.result?.events?.length ?? 0}</p>
              </div>
            )
          ) : (
            <p>输入接近用户真实请求的 prompt，点击开始测试后返回完整闭环结果。</p>
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
