'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { readJsonResponse } from '@/lib/api-response';
import { adminApiRequest } from '@/lib/admin-api-client';

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await adminApiRequest('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof payload?.error?.message === 'string' ? payload.error.message : '登录失败。',
        );
      }

      toast.success('管理端登录成功。');
      router.push('/admin');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录失败。');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-neutral-200 bg-white/95 shadow-xl shadow-neutral-950/10">
      <CardHeader className="space-y-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-950 text-white">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl tracking-tight text-neutral-950">管理端登录</CardTitle>
          <CardDescription className="text-sm leading-6 text-neutral-600">
            使用后台账号和密码进入独立管理端。这里不是会员侧登录入口。
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-800" htmlFor="admin-username">
              账号
            </label>
            <Input
              id="admin-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="输入后台账号"
              className="h-11 border-neutral-300 bg-white"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-800" htmlFor="admin-password">
              密码
            </label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="输入后台密码"
              className="h-11 border-neutral-300 bg-white"
            />
          </div>
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={pending || !username || !password}>
            {pending ? '登录中...' : '进入管理端'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
