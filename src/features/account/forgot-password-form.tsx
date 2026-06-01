'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readJsonResponse } from '@/lib/api-response';
import { userApiRequest } from '@/lib/user-api-client';

export function ForgotPasswordForm() {
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('忘记密码，需要客服协助重置');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone) {
      return;
    }

    setPending(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await userApiRequest('/api/auth/password-reset-work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, reason }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof payload?.error?.message === 'string' ? payload.error.message : '工单提交失败，请重试。',
        );
      }

      setSuccessMessage('工单已提交，请联系客服获取审核后的临时密码。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '工单提交失败，请重试。');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-[#1d1d1f]" htmlFor="forgot-password-phone">
          手机号
        </label>
        <Input
          id="forgot-password-phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))}
          placeholder="输入注册手机号"
          className="h-12 rounded-xl border-[#d2d2d7] bg-white text-[#1d1d1f]"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-[#1d1d1f]" htmlFor="forgot-password-reason">
          说明
        </label>
        <textarea
          id="forgot-password-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-28 w-full rounded-xl border border-[#d2d2d7] bg-white px-3 py-3 text-sm text-[#1d1d1f] outline-none focus:border-[#1d1d1f]"
        />
      </div>
      {errorMessage ? (
        <div className="rounded-xl bg-[#fff1f3] px-4 py-3 text-sm text-[#b42318]">{errorMessage}</div>
      ) : null}
      {successMessage ? (
        <div className="rounded-xl bg-[#ecfdf3] px-4 py-3 text-sm text-[#027a48]">{successMessage}</div>
      ) : null}
      <Button type="submit" disabled={pending || phone.length < 6} className="h-12 w-full rounded-xl bg-[#1d1d1f] text-white hover:bg-[#333]">
        {pending ? '提交中...' : '提交重置工单'}
      </Button>
    </form>
  );
}
