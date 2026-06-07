import { LockKeyhole, ShieldAlert } from 'lucide-react';

import { AdminLoginForm } from '@/features/admin/admin-login-form';

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--accent)_18%,transparent)_0%,transparent_32%),linear-gradient(180deg,var(--background)_0%,color-mix(in_srgb,var(--background)_80%,var(--foreground)_20%)_100%)] px-6 py-10 text-foreground">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="flex flex-col justify-between rounded-[32px] border border-border bg-foreground px-8 py-10 text-background shadow-2xl shadow-black/15">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.28em] text-white/70">
              <LockKeyhole className="h-3.5 w-3.5" />
              Taiji Admin
            </div>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-tight text-background">
              资产管理控制台需要独立、完整、可审计的登录验证。
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/72">
              所有后台路由仅接受正式后台会话。只有显式加入管理端准入白名单且具备后台角色的账号，才允许进入控制台。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/60">权限要求</p>
              <p className="mt-3 text-sm leading-6 text-white/80">
                仅限激活中的后台角色账户访问，普通站点用户态不会继承到这里。
              </p>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
              <div className="flex items-center gap-2 text-amber-200">
                <ShieldAlert className="h-4 w-4" />
                <p className="text-xs uppercase tracking-[0.24em]">准入规则</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-amber-50">
                当前不接入短信验证。管理端采用账号密码登录，并以显式白名单作为独立准入条件，所有后台登录都应进入审计。
              </p>
            </div>
          </div>
        </section>
        <section className="flex items-center justify-center">
          <div className="w-full max-w-md">
            <AdminLoginForm />
          </div>
        </section>
      </div>
    </div>
  );
}
