import { redirect } from 'next/navigation';

import { SetPasswordForm } from '@/features/account/set-password-form';

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const phone = typeof params.phone === 'string' ? params.phone : '';

  if (!phone) {
    redirect('/home');
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md rounded-[28px] border border-border bg-card p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground text-sm font-bold text-background">
            NF
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">首次设置密码</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            当前账号还没有密码。先完成密码设置，再返回登录页进入用户端。
          </p>
        </div>
        <SetPasswordForm phone={phone} />
      </div>
    </div>
  );
}
