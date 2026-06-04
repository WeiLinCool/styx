'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api-response';
import { userApiRequest } from '@/lib/user-api-client';
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
  X,
} from 'lucide-react';

type SubscriptionWorkOrderSummary = {
  id: string;
  code: string;
  status: 'pending' | 'processing' | 'closed' | 'archived';
  result: 'approved' | 'rejected' | null;
  planName: string;
  planCode: string;
  orderNumber: string;
  orderStatus: string;
  orderTotalCents: number;
  submittedAmountCents: number;
  submittedPaymentMethod: string;
  submittedPaidAt: string;
  submittedReference: string;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

const planCodeByUiId: Record<string, string | null> = {
  free: null,
  monthly: 'pro-monthly',
  yearly: 'team-yearly',
};

function formatCny(cents: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function workOrderStatusLabel(workOrder: SubscriptionWorkOrderSummary) {
  if (workOrder.result === 'approved') return '已通过';
  if (workOrder.result === 'rejected') return '已拒绝';
  if (workOrder.status === 'processing') return '处理中';
  if (workOrder.status === 'archived') return '已归档';
  return '待处理';
}

function MembershipNav() {
  const router = useRouter();
  const { user, isLoggedIn, openLoginModal } = useAuth();
  return (
    <nav className="fixed top-0 right-0 left-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/home" className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft size={18} />
            <span className="hidden text-sm sm:inline">返回首页</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
              <Crown size={14} className="text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">会员订阅</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isLoggedIn && user ? (
            <div className="flex items-center gap-2">
              <UserAvatar avatar={user.avatar} size={28} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
              <span className="hidden text-xs text-foreground sm:inline">{user.nickname}</span>
            </div>
          ) : (
            <button onClick={openLoginModal} className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/85">
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
  const { user, isLoggedIn, openLoginModal } = useAuth();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [subscriptionWorkOrder, setSubscriptionWorkOrder] =
    useState<SubscriptionWorkOrderSummary | null>(null);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [submitPending, setSubmitPending] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState<string | null>(null);
  const activationRequired = isLoggedIn && user ? requiresActivation(user) : false;

  useEffect(() => {
    if (!isLoggedIn || !user || requiresActivation(user)) {
      setSubscriptionWorkOrder(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const response = await userApiRequest('/api/membership/subscription-work-orders/current', {
        cache: 'no-store',
      });
      const payload = await readJsonResponse(response);
      if (!cancelled && response.ok) {
        setSubscriptionWorkOrder(payload.subscriptionWorkOrder ?? null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user]);

  const handleSubscribe = (planId: string) => {
    if (!isLoggedIn) { openLoginModal(); return; }
    if (!user || requiresActivation(user)) return;
    const planCode = planCodeByUiId[planId];
    if (!planCode) return;
    setSelectedPlanCode(planCode);
    setSubscriptionMessage(null);
  };

  const handleSubmitSubscriptionWorkOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPlanCode || submitPending) return;

    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount < 0 || !paidAt) {
      setSubscriptionMessage('请填写有效的付款金额和付款时间。');
      return;
    }

    setSubmitPending(true);
    setSubscriptionMessage(null);
    try {
      const response = await userApiRequest('/api/membership/subscription-work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          planCode: selectedPlanCode,
          paymentMethod,
          amountCents: Math.round(amount * 100),
          paidAt: new Date(paidAt).toISOString(),
          reference: paymentReference,
          note: paymentNote,
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        setSubscriptionMessage(
          typeof payload?.error?.message === 'string'
            ? payload.error.message
            : '订阅工单提交失败，请重试。',
        );
        return;
      }

      setSubscriptionWorkOrder(payload.subscriptionWorkOrder);
      setSelectedPlanCode(null);
      setPaymentMethod('');
      setPaidAmount('');
      setPaidAt('');
      setPaymentReference('');
      setPaymentNote('');
      setSubscriptionMessage('订阅工单已提交，请等待客服核销。');
    } finally {
      setSubmitPending(false);
    }
  };

  const selectedPlan = membershipPlans.find((plan) => planCodeByUiId[plan.id] === selectedPlanCode);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MembershipNav />

      <div className="pt-14">
        {/* Hero */}
        <div className="relative overflow-hidden bg-secondary/50 py-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-black/[0.03] to-black/[0.01]" />
          </div>
          <div className="relative z-10 mx-auto max-w-7xl px-4 text-center sm:px-6">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2 text-sm font-medium text-foreground shadow-sm">
              <Crown size={14} className="text-foreground" />
              会员订阅
            </div>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              选择适合你的方案
            </h1>
            <p className="mx-auto max-w-md text-lg text-muted-foreground">解锁更多AI创作能力，让石头印画创作更高效</p>
          </div>
        </div>

        {/* 当前会员状态 */}
        {isLoggedIn && user && (
          <div className="mx-auto -mt-6 max-w-3xl px-4 sm:px-6">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-black/[0.04]">
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <div className="flex items-center gap-3">
                  <UserAvatar avatar={user.avatar} size={48} userLevel={user.userLevel} onClick={() => router.push('/user-center')} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{user.nickname}</p>
                    <p className="text-xs text-muted-foreground">
                      当前会员：
                      <span className="font-medium text-foreground">
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
                    className="cursor-pointer rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/85"
                  >
                    升级年度会员
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {subscriptionWorkOrder && (
          <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
            <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <div className="font-semibold text-foreground">
                    订阅工单 {subscriptionWorkOrder.code}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {subscriptionWorkOrder.planName} · {subscriptionWorkOrder.orderNumber} ·{' '}
                    {formatCny(subscriptionWorkOrder.orderTotalCents)}
                  </div>
                </div>
                <span className="w-fit rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                  {workOrderStatusLabel(subscriptionWorkOrder)}
                </span>
              </div>
              {subscriptionWorkOrder.decisionNote ? (
                <p className="mt-3 text-xs text-muted-foreground">{subscriptionWorkOrder.decisionNote}</p>
              ) : null}
            </div>
          </div>
        )}

        {subscriptionMessage && (
          <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
            <div className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-foreground">
              {subscriptionMessage}
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
                    ? 'border-primary bg-card shadow-lg shadow-black/[0.1]'
                    : 'border-border bg-card'
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 rounded-bl-xl bg-[#1d1d1f] px-4 py-1 text-xs font-bold text-white">
                    最受欢迎
                  </div>
                )}

                <div className="mb-5 flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${plan.popular ? 'bg-secondary' : plan.iconBg}`}>
                    <plan.icon size={20} className={plan.popular ? 'text-foreground' : plan.id === 'free' ? 'text-foreground' : 'text-white'} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground">{plan.desc}</p>
                  </div>
                </div>

                <div className="mb-6 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-foreground">
                    ¥{plan.price}
                  </span>
                  {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                  {plan.originalPrice && (
                    <span className="ml-2 text-sm text-muted-foreground line-through">¥{plan.originalPrice}</span>
                  )}
                </div>

                {plan.originalPrice && (
                  <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                    <Gift size={12} />
                    省 ¥{plan.originalPrice - plan.price}/年
                  </div>
                )}

                <div className="mb-7 space-y-3">
                  {plan.features.map((f) => (
                    <div key={f.text} className="flex items-center gap-2.5">
                      {f.included ? (
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          'bg-secondary'
                        }`}>
                          <Check size={12} className="text-foreground" />
                        </div>
                      ) : (
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary/60">
                          <span className="text-[10px] text-muted-foreground">—</span>
                        </div>
                      )}
                      <span className={`text-sm ${f.included ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {f.text}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={activationRequired || (isLoggedIn && user?.membershipLevel === plan.id)}
                  className={`w-full cursor-pointer rounded-xl py-3.5 text-sm font-semibold transition-all ${
                    activationRequired
                      ? 'bg-secondary text-muted-foreground'
                      : isLoggedIn && user?.membershipLevel === plan.id
                      ? 'bg-secondary text-muted-foreground cursor-default'
                      : 'bg-primary text-primary-foreground hover:bg-primary/85 active:scale-[0.98]'
                  }`}
                >
                  {activationRequired
                    ? '请先激活'
                    : isLoggedIn && user?.membershipLevel === plan.id
                      ? '当前方案'
                      : subscriptionWorkOrder?.planCode === planCodeByUiId[plan.id] &&
                          (subscriptionWorkOrder.status === 'pending' ||
                            subscriptionWorkOrder.status === 'processing')
                        ? '查看申请状态'
                        : plan.price === 0
                          ? '免费使用'
                          : '提交订阅工单'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {selectedPlanCode && selectedPlan ? (
          <div className="fixed inset-0 z-50 flex items-end bg-black/30 px-4 py-4 sm:items-center sm:justify-center">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl shadow-black/20">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">提交订阅工单</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedPlan.name} · 应收 {formatCny(selectedPlan.price * 100)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPlanCode(null)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form className="mt-5 space-y-3" onSubmit={handleSubmitSubscriptionWorkOrder}>
                <label className="block text-sm">
                  <span className="font-medium text-foreground">支付方式</span>
                  <input
                    required
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    placeholder="微信转账 / 支付宝 / 银行转账"
                    className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-foreground">付款金额</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidAmount}
                    onChange={(event) => setPaidAmount(event.target.value)}
                    placeholder="399"
                    className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-foreground">付款时间</span>
                  <input
                    required
                    type="datetime-local"
                    value={paidAt}
                    onChange={(event) => setPaidAt(event.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-foreground">交易流水号/备注</span>
                  <input
                    required
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    placeholder="填写转账流水号或可核对的备注"
                    className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-foreground">补充说明</span>
                  <textarea
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    rows={3}
                    className="mt-1 w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </label>
                {subscriptionMessage ? (
                  <p className="text-sm text-muted-foreground">{subscriptionMessage}</p>
                ) : null}
                <button
                  type="submit"
                  disabled={submitPending}
                  className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:bg-muted"
                >
                  {submitPending ? '提交中...' : '提交工单'}
                </button>
              </form>
            </div>
          </div>
        ) : null}

        {/* 功能对比 */}
        <div className="bg-secondary/50 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 className="mb-10 text-center text-3xl font-bold tracking-tight text-foreground">
              功能对比
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b-2 border-foreground">
                    <th className="pb-4 text-left text-sm font-semibold text-foreground">功能</th>
                    <th className="pb-4 text-center text-sm font-semibold text-muted-foreground">免费版</th>
                    <th className="pb-4 text-center text-sm font-semibold text-foreground">月度会员</th>
                    <th className="pb-4 text-center text-sm font-semibold text-foreground">年度会员</th>
                  </tr>
                </thead>
                <tbody>
                  {membershipComparisonRows.map((row, i) => (
                    <tr key={row.name} className={`border-b border-border ${i % 2 === 0 ? 'bg-card/60' : ''}`}>
                      <td className="py-4 text-sm font-medium text-foreground">{row.name}</td>
                      <td className="py-4 text-center text-sm text-muted-foreground">{row.free}</td>
                      <td className="py-4 text-center text-sm text-muted-foreground">{row.monthly}</td>
                      <td className="py-4 text-center text-sm font-medium text-foreground">{row.yearly}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <h2 className="mb-10 text-center text-3xl font-bold tracking-tight text-foreground">
            常见问题
          </h2>
          <div className="space-y-3">
            {membershipFaqs.map((faq, i) => (
              <div
                key={faq.q}
                className="overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-sm"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                  className="flex w-full cursor-pointer items-center justify-between px-6 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-foreground">{faq.q}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-muted-foreground transition-transform ${expandedFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {expandedFaq === i && (
                  <div className="border-t border-border px-6 pb-4 pt-3">
                    <p className="text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
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
