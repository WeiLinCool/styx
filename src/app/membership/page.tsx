'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import UserAvatar from '@/components/user-avatar';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import { membershipComparisonRows, membershipFaqs, membershipPlans } from '@/features/public/membership-data';
import {
  ArrowLeft,
  Crown,
  Check,
  Gift,
  ChevronDown,
} from 'lucide-react';

function MembershipNav() {
  const router = useRouter();
  const { user, isLoggedIn, openLoginModal } = useAuth();
  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/home" className="flex items-center gap-1 text-[#555555] transition-colors hover:text-[#1d1d1f]">
            <ArrowLeft size={18} />
            <span className="hidden text-sm sm:inline">返回首页</span>
          </Link>
          <div className="h-4 w-px bg-black/[0.08]" />
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1d1d1f]">
              <Crown size={14} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-[#1d1d1f]">会员订阅</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isLoggedIn && user ? (
            <div className="flex items-center gap-2">
              <UserAvatar avatar={user.avatar} size={28} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
              <span className="hidden text-xs text-[#1d1d1f] sm:inline">{user.nickname}</span>
            </div>
          ) : (
            <button onClick={openLoginModal} className="cursor-pointer rounded-full bg-[#1d1d1f] px-4 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#333]">
              登录
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

export default function MembershipPage() {
  const router = useRouter();
  const { user, isLoggedIn, updateUser, openLoginModal } = useAuth();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const activationRequired = isLoggedIn && user ? requiresActivation(user) : false;

  const handleSubscribe = (planId: string) => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (!user || requiresActivation(user)) return;
    const level = planId === 'yearly' ? 'yearly' : planId === 'monthly' ? 'monthly' : 'free';
    const expiry = level === 'yearly'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : level === 'monthly'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;
    updateUser({ membershipLevel: level, membershipExpiry: expiry });
  };

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]">
      <MembershipNav />

      <div className="pt-14">
        {/* Hero */}
        <div className="relative overflow-hidden bg-[#f5f5f7] py-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-black/[0.03] to-black/[0.01]" />
          </div>
          <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-5 py-2 text-sm font-medium text-[#1d1d1f] shadow-sm">
              <Crown size={14} className="text-[#1d1d1f]" />
              会员订阅
            </div>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-[#1d1d1f] sm:text-5xl lg:text-6xl">
              选择适合你的方案
            </h1>
            <p className="mx-auto max-w-md text-lg text-[#555555]">解锁更多AI创作能力，让石头印画创作更高效</p>
          </div>
        </div>

        {/* 当前会员状态 */}
        {isLoggedIn && user && (
          <div className="mx-auto -mt-6 max-w-3xl px-4 sm:px-6">
            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-lg shadow-black/[0.04]">
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <div className="flex items-center gap-3">
                  <UserAvatar avatar={user.avatar} size={48} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
                  <div>
                    <p className="text-sm font-semibold text-[#1d1d1f]">{user.nickname}</p>
                    <p className="text-xs text-[#555555]">
                      当前会员：
                      <span className="font-medium text-[#1d1d1f]">
                        {user.membershipLevel === 'yearly' ? '年度会员' : user.membershipLevel === 'monthly' ? '月度会员' : '免费版'}
                      </span>
                      {user.membershipExpiry && (
                        <span className="ml-2">到期：{new Date(user.membershipExpiry).toLocaleDateString('zh-CN')}</span>
                      )}
                    </p>
                  </div>
                </div>
                {user.membershipLevel !== 'yearly' && (
                  <button
                    onClick={() => handleSubscribe('yearly')}
                    className="cursor-pointer rounded-full bg-[#1d1d1f] px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-[#333]"
                  >
                    升级年度会员
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activationRequired && (
          <ProtectedAccountPanel accountState={user?.accountState} title="激活账号后订阅会员" />
        )}

        {/* 方案卡片 */}
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {membershipPlans.map((plan) => (
              <div
                key={plan.id}
                className={`relative overflow-hidden rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/[0.08] ${
                  plan.popular
                    ? 'border-[#1d1d1f] bg-white shadow-lg shadow-black/[0.1]'
                    : 'border-black/[0.08] bg-white'
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 rounded-bl-xl bg-[#1d1d1f] px-4 py-1 text-xs font-bold text-white">
                    最受欢迎
                  </div>
                )}

                <div className="mb-5 flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${plan.popular ? 'bg-[#1d1d1f]/[0.08]' : plan.iconBg}`}>
                    <plan.icon size={20} className={plan.popular ? 'text-[#1d1d1f]' : plan.id === 'free' ? 'text-[#1d1d1f]' : 'text-white'} />
                  </div>
                  <div>
                    <h3 className={`text-lg font-bold ${plan.popular ? 'text-[#1d1d1f]' : 'text-[#1d1d1f]'}`}>{plan.name}</h3>
                    <p className={`text-xs ${plan.popular ? 'text-[#555555]' : 'text-[#555555]'}`}>{plan.desc}</p>
                  </div>
                </div>

                <div className="mb-6 flex items-baseline gap-1">
                  <span className={`text-4xl font-bold tracking-tight ${plan.popular ? 'text-[#1d1d1f]' : 'text-[#1d1d1f]'}`}>
                    ¥{plan.price}
                  </span>
                  {plan.period && <span className={`text-sm ${plan.popular ? 'text-[#555555]' : 'text-[#555555]'}`}>{plan.period}</span>}
                  {plan.originalPrice && (
                    <span className={`ml-2 text-sm line-through ${plan.popular ? 'text-white/40' : 'text-[#999]'}`}>¥{plan.originalPrice}</span>
                  )}
                </div>

                {plan.originalPrice && (
                  <div className={`mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    plan.popular ? 'bg-[#f5f5f7] text-[#1d1d1f]' : 'bg-[#f5f5f7] text-[#1d1d1f]'
                  }`}>
                    <Gift size={12} />
                    省 ¥{plan.originalPrice - plan.price}/年
                  </div>
                )}

                <div className="mb-7 space-y-3">
                  {plan.features.map((f) => (
                    <div key={f.text} className="flex items-center gap-2.5">
                      {f.included ? (
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          plan.popular ? 'bg-[#1d1d1f]/[0.08]' : 'bg-[#1d1d1f]/[0.08]'
                        }`}>
                          <Check size={12} className={plan.popular ? 'text-[#1d1d1f]' : 'text-[#1d1d1f]'} />
                        </div>
                      ) : (
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/[0.04]">
                          <span className="text-[10px] text-[#999]">—</span>
                        </div>
                      )}
                      <span className={`text-sm ${f.included ? (plan.popular ? 'text-[#1d1d1f]' : 'text-[#1d1d1f]') : (plan.popular ? 'text-[#999]' : 'text-[#999]')}`}>
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  className={`w-full cursor-pointer rounded-xl py-3.5 text-sm font-semibold transition-all ${
                    activationRequired
                      ? 'bg-[#f5f5f7] text-[#86868b]'
                      : isLoggedIn && user?.membershipLevel === plan.id
                      ? 'bg-[#f5f5f7] text-[#86868b] cursor-default'
                      : 'bg-[#1d1d1f] text-white hover:bg-[#333] active:scale-[0.98]'
                  }`}
                >
                  {activationRequired ? '请先激活' : isLoggedIn && user?.membershipLevel === plan.id ? '当前方案' : plan.price === 0 ? '免费使用' : '立即订阅'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 功能对比 */}
        <div className="bg-[#f5f5f7] py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 className="mb-10 text-center text-3xl font-bold tracking-tight text-[#1d1d1f]">
              功能对比
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b-2 border-[#1d1d1f]">
                    <th className="pb-4 text-left text-sm font-semibold text-[#1d1d1f]">功能</th>
                    <th className="pb-4 text-center text-sm font-semibold text-[#999]">免费版</th>
                    <th className="pb-4 text-center text-sm font-semibold text-[#1d1d1f]">月度会员</th>
                    <th className="pb-4 text-center text-sm font-semibold text-[#1d1d1f]">年度会员</th>
                  </tr>
                </thead>
                <tbody>
                  {membershipComparisonRows.map((row, i) => (
                    <tr key={row.name} className={`border-b border-black/[0.06] ${i % 2 === 0 ? 'bg-white/50' : ''}`}>
                      <td className="py-4 text-sm font-medium text-[#1d1d1f]">{row.name}</td>
                      <td className="py-4 text-center text-sm text-[#999]">{row.free}</td>
                      <td className="py-4 text-center text-sm text-[#555555]">{row.monthly}</td>
                      <td className="py-4 text-center text-sm font-medium text-[#1d1d1f]">{row.yearly}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="mb-10 text-center text-3xl font-bold tracking-tight text-[#1d1d1f]">
            常见问题
          </h2>
          <div className="space-y-3">
            {membershipFaqs.map((faq, i) => (
              <div
                key={faq.q}
                className="overflow-hidden rounded-xl border border-black/[0.06] bg-white transition-shadow hover:shadow-sm"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="flex w-full cursor-pointer items-center justify-between px-6 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-[#1d1d1f]">{faq.q}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-[#999] transition-transform ${expandedFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {expandedFaq === i && (
                  <div className="border-t border-black/[0.04] px-6 pb-4 pt-3">
                    <p className="text-sm leading-relaxed text-[#555555]">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
