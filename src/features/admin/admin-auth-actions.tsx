'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, LogIn, LogOut } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readJsonResponse } from '@/lib/api-response';
import { adminApiRequest } from '@/lib/admin-api-client';
import { cn } from '@/lib/utils';

type AdminAuthActionsProps = {
  authenticated: boolean;
};

type ActionState = {
  tone: 'success' | 'error';
  message: string;
};

export function getAdminAuthActionState(authenticated: boolean) {
  return authenticated
    ? { kind: 'logout' as const, label: '退出登录' }
    : { kind: 'login' as const, label: '进入后台' };
}

export function AdminAuthActions({ authenticated }: AdminAuthActionsProps) {
  const router = useRouter();
  const [phone, setPhone] = useState(process.env.NODE_ENV === 'production' ? '' : '13800000000');
  const [nickname, setNickname] = useState(process.env.NODE_ENV === 'production' ? '' : '后台运营');
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionState | null>(null);
  const action = getAdminAuthActionState(authenticated);

  async function handleLogout() {
    setPending(true);
    setState(null);

    try {
      const response = await adminApiRequest('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error('退出登录失败。');
      }

      toast.success('已退出后台登录。');
      setState({ tone: 'success', message: '已退出后台登录。' });
      router.refresh();
    } catch (error) {
      setState({
        tone: 'error',
        message: error instanceof Error ? error.message : '退出登录失败。',
      });
    } finally {
      setPending(false);
    }
  }

  async function handleLogin() {
    setPending(true);
    setState(null);

    try {
      const response = await adminApiRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phone,
          nickname: nickname.trim() || undefined,
        }),
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(
          typeof payload?.error?.message === 'string' ? payload.error.message : '进入后台失败。',
        );
      }

      toast.success('进入后台成功。');
      setState({ tone: 'success', message: '登录成功，正在刷新后台。' });
      router.refresh();
    } catch (error) {
      setState({
        tone: 'error',
        message: error instanceof Error ? error.message : '进入后台失败。',
      });
    } finally {
      setPending(false);
    }
  }

  if (authenticated) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-md"
          disabled={pending}
          onClick={() => void handleLogout()}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
          {action.label}
        </Button>
        {state ? (
          <p
            className={cn(
              'text-[11px]',
              state.tone === 'success' ? 'text-emerald-700' : 'text-red-700',
            )}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="手机号"
          className="bg-white"
        />
        <Input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="显示名称"
          className="bg-white"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="button" className="sm:w-auto" disabled={pending || phone.trim().length < 6} onClick={() => void handleLogin()}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
          {action.label}
        </Button>
        {state ? (
          <p
            className={cn(
              'text-xs',
              state.tone === 'success' ? 'text-emerald-700' : 'text-red-700',
            )}
          >
            {state.message}
          </p>
        ) : (
          <p className="text-xs text-neutral-500">开发环境下可复用现有手机号登录接口进入后台。</p>
        )}
      </div>
    </div>
  );
}
