import { redirect } from 'next/navigation';

import { SetPasswordForm } from '@/features/account/set-password-form';

export default async function ResetPasswordPage({
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
    <div className="min-h-screen bg-[#f5f5f7] px-4 py-10">
      <div className="mx-auto max-w-md rounded-[28px] bg-white p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)]">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1d1d1f] text-sm font-bold text-white">
            NF
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#1d1d1f]">重置正式密码</h1>
          <p className="mt-2 text-sm leading-6 text-[#6e6e73]">
            你当前使用的是客服提供的临时密码。请立即设置新的正式密码后继续使用账号。
          </p>
        </div>
        <SetPasswordForm phone={phone} mode="reset" />
      </div>
    </div>
  );
}
