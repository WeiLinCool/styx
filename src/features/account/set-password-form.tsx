'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readJsonResponse } from '@/lib/api-response';
import { removeUserFromCookie } from '@/lib/cookie';
import { userApiRequest } from '@/lib/user-api-client';

type SetPasswordFormProps = {
  phone: string;
  mode?: 'initial' | 'reset';
};

export function SetPasswordForm({ phone, mode = 'initial' }: SetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone || !password || !confirmPassword) {
      return;
    }

    setPending(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await userApiRequest('/api/auth/set-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, password, confirmPassword, mode }),
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          typeof payload?.error?.message === 'string' ? payload.error.message : '设置密码失败，请重试。',
        );
      }

      removeUserFromCookie();
      setSuccessMessage('密码设置成功，请返回登录。');
      setTimeout(() => {
        router.push('/');
      }, 1000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '设置密码失败，请重试。');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="set-password-phone">
          手机号
        </label>
        <Input
          id="set-password-phone"
          value={phone}
          readOnly
          className="h-12 rounded-xl border-input bg-secondary text-foreground"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="set-password-password">
          新密码
        </label>
        <Input
          id="set-password-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="请设置 6 位以上密码"
          className="h-12 rounded-xl border-input bg-background text-foreground placeholder:text-muted-foreground"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="set-password-confirm">
          确认密码
        </label>
        <Input
          id="set-password-confirm"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="请再次输入密码"
          className="h-12 rounded-xl border-input bg-background text-foreground placeholder:text-muted-foreground"
        />
      </div>
      {errorMessage ? (
        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success-foreground">
          {successMessage}
        </div>
      ) : null}
      <Button type="submit" disabled={pending || password.length < 6 || confirmPassword.length < 6} className="h-12 w-full rounded-xl">
        {pending ? '保存中...' : '保存密码'}
      </Button>
    </form>
  );
}
