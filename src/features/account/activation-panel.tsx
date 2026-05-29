'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardList, Link2, Mail, Phone, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collectBrowserFingerprint } from './browser-fingerprint';

type ActivationPanelProps = {
  accountState?: 'pending_activation' | 'active' | 'suspended' | 'archived';
};

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

type WorkOrderState = {
  code: string;
  expiresAt: string;
  deviceMetadata?: Record<string, unknown>;
};

export function ActivationPanel({ accountState = 'pending_activation' }: ActivationPanelProps) {
  const [bindSubject, setBindSubject] = useState('');
  const [bindProvider, setBindProvider] = useState<'email' | 'phone' | 'github'>('email');
  const [message, setMessage] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [workOrder, setWorkOrder] = useState<WorkOrderState | null>(null);

  async function createActivationRequest() {
    setSubmitState('submitting');
    setMessage('');
    setWorkOrder(null);

    const response = await fetch('/api/account/activation-work-orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fingerprint: collectBrowserFingerprint() }),
    });

    if (response.ok) {
      const payload = await response.json();
      setWorkOrder(payload.workOrder);
      setSubmitState('success');
      setMessage('激活工单已生成，请将工单码提供给客服审核。');
      return;
    }

    const payload = await response.json().catch(() => null);
    setSubmitState('error');
    setMessage(payload?.error?.message ?? '激活工单生成失败，请稍后重试。');
  }

  async function submitBinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState('submitting');
    setMessage('');

    const response = await fetch('/api/account/bind', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: bindProvider,
        subject: bindSubject,
      }),
    });

    if (response.ok) {
      setSubmitState('success');
      setMessage('绑定已完成。');
      return;
    }

    const payload = await response.json().catch(() => null);
    setSubmitState('error');
    setMessage(payload?.error?.message ?? '绑定失败，请确认身份信息。');
  }

  return (
    <section className="w-full rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-neutral-950 text-white">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-neutral-950">账号激活</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            当前状态为 {accountState}。请从当前浏览器生成绑定工单，并将工单码提供给客服完成审核激活。
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-neutral-950">浏览器绑定激活工单</p>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              系统会生成当前浏览器的绑定摘要，客服审核通过后账号才会激活。
            </p>
          </div>
          <Button
            type="button"
            disabled={submitState === 'submitting'}
            onClick={() => void createActivationRequest()}
          >
            <ClipboardList className="mr-2 h-4 w-4" />
            生成工单码
          </Button>
        </div>
        {workOrder ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-white p-3">
            <p className="text-xs text-neutral-500">请提供给客服的工单码</p>
            <p className="mt-1 break-all font-mono text-lg font-semibold text-emerald-700">
              {workOrder.code}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              有效期至 {new Date(workOrder.expiresAt).toLocaleString('zh-CN')}
            </p>
          </div>
        ) : null}
      </div>

      <form onSubmit={submitBinding} className="mt-5 grid gap-3 md:grid-cols-[160px_1fr_auto]">
        <select
          value={bindProvider}
          onChange={(event) => setBindProvider(event.target.value as 'email' | 'phone' | 'github')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="绑定类型"
        >
          <option value="email">邮箱</option>
          <option value="phone">手机</option>
          <option value="github">GitHub</option>
        </select>
        <Input
          value={bindSubject}
          onChange={(event) => setBindSubject(event.target.value)}
          placeholder="账号激活后可继续绑定邮箱、手机号或第三方账号 ID"
          className="min-h-10"
        />
        <Button type="submit" variant="outline" disabled={submitState === 'submitting' || !bindSubject}>
          {bindProvider === 'email' ? (
            <Mail className="mr-2 h-4 w-4" />
          ) : bindProvider === 'phone' ? (
            <Phone className="mr-2 h-4 w-4" />
          ) : (
            <Link2 className="mr-2 h-4 w-4" />
          )}
          绑定
        </Button>
      </form>

      {message ? (
        <p
          className={`mt-4 text-sm ${submitState === 'error' ? 'text-red-600' : 'text-emerald-700'}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
