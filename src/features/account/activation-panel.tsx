'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Link2, Mail, Phone, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ActivationPanelProps = {
  accountState?: 'pending_activation' | 'active' | 'suspended' | 'archived';
};

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export function ActivationPanel({ accountState = 'pending_activation' }: ActivationPanelProps) {
  const [token, setToken] = useState('');
  const [bindSubject, setBindSubject] = useState('');
  const [bindProvider, setBindProvider] = useState<'email' | 'phone' | 'github'>('email');
  const [message, setMessage] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  async function submitActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState('submitting');
    setMessage('');

    const response = await fetch('/api/account/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      setSubmitState('success');
      setMessage('账号已激活。');
      return;
    }

    const payload = await response.json().catch(() => null);
    setSubmitState('error');
    setMessage(payload?.error?.message ?? '激活失败，请重新检查激活码。');
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
            当前状态为 {accountState}。完成激活后才能使用会员、订单和生成记录等受保护功能。
          </p>
        </div>
      </div>

      <form onSubmit={submitActivation} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="输入激活码或激活 token"
          className="min-h-10"
        />
        <Button type="submit" disabled={submitState === 'submitting' || token.length < 16}>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          激活
        </Button>
      </form>

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
          placeholder="输入要绑定的邮箱、手机号或第三方账号 ID"
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
