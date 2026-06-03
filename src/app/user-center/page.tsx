'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api-response';
import UserAvatar from '@/components/user-avatar';
import { HumanVerificationDialog } from '@/components/human-verification-dialog';
import { requiresActivation } from '@/features/account/account-state';
import { ProtectedAccountPanel } from '@/features/account/protected-account-panel';
import { userCenterCartFixtures, userCenterPurchaseHistory } from '@/features/public/user-center-data';
import { UserMediaModule } from '@/features/public/user-media-module';
import { userApiRequest } from '@/lib/user-api-client';
import { formatCredits } from '@/lib/credits';
import {
  shouldRefreshUserCenterOnEntry,
  shouldRefreshUserCenterOnResume,
} from './refresh';
import { ArrowLeft, ShoppingBag, Clock, Star, Crown, Camera, Edit3, Check, X, ChevronRight, Trash2, Minus, Plus, Gift, Copy, CalendarCheck } from 'lucide-react';
import type { GeneratedMediaAssetDto } from '@/server/agent/types';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  size: string;
}

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

const LEVEL_MAP: Record<string, { label: string; color: string }> = {
  free: { label: '普通用户', color: '#86868b' },
  vip: { label: 'VIP会员', color: '#1d1d1f' },
  svip: { label: 'SVIP会员', color: '#b45309' },
  partner: { label: '合伙人', color: '#1d1d1f' },
  core_partner: { label: '核心合伙人', color: '#b91c1c' },
};

export default function UserCenterPage() {
  const { user, isLoggedIn, updateUser, refreshUser, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [activeTab, setActiveTab] = useState<'overview' | 'cart' | 'history' | 'profile'>('overview');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [cart, setCart] = useState<CartItem[]>(userCenterCartFixtures);
  const [purchaseHistory] = useState(userCenterPurchaseHistory);
  const [inviteSummary, setInviteSummary] = useState(user?.inviteSummary ?? null);
  const [recentPointActivities, setRecentPointActivities] = useState(user?.recentPointActivities ?? []);
  const [checkinStatus, setCheckinStatus] = useState(user?.checkinStatus ?? null);
  const [subscriptionWorkOrder, setSubscriptionWorkOrder] =
    useState<SubscriptionWorkOrderSummary | null>(null);
  const [savedMediaAssets, setSavedMediaAssets] = useState<GeneratedMediaAssetDto[]>([]);
  const [checkinPending, setCheckinPending] = useState(false);
  const [checkinVerificationOpen, setCheckinVerificationOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshInFlightRef = useRef<Promise<unknown> | null>(null);
  const lastRefreshAtRef = useRef(0);

  const refreshUserCenterSnapshot = useCallback(() => {
    if (
      !shouldRefreshUserCenterOnEntry({
        pathname,
        isLoggedIn,
        hasUser: Boolean(user),
      })
    ) {
      return;
    }

    const now = Date.now();
    if (refreshInFlightRef.current || now - lastRefreshAtRef.current < 250) {
      return;
    }

    lastRefreshAtRef.current = now;
    const refreshPromise = refreshUser().finally(() => {
      if (refreshInFlightRef.current === refreshPromise) {
        refreshInFlightRef.current = null;
      }
    });

    refreshInFlightRef.current = refreshPromise;
  }, [isLoggedIn, pathname, refreshUser, user]);

  useEffect(() => {
    setInviteSummary(user?.inviteSummary ?? null);
    setRecentPointActivities(user?.recentPointActivities ?? []);
    setCheckinStatus(user?.checkinStatus ?? null);
  }, [user]);

  useEffect(() => {
    if (!isLoggedIn || !user) {
      router.replace('/home');
    }
  }, [isLoggedIn, router, user]);

  useEffect(() => {
    refreshUserCenterSnapshot();
  }, [refreshUserCenterSnapshot]);

  useEffect(() => {
    function handleResume() {
      if (
        !shouldRefreshUserCenterOnResume({
          pathname,
          isLoggedIn,
          hasUser: Boolean(user),
          visibilityState: document.visibilityState,
          hasFocus: document.hasFocus(),
        })
      ) {
        return;
      }

      refreshUserCenterSnapshot();
    }

    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [isLoggedIn, pathname, refreshUserCenterSnapshot, user]);

  useEffect(() => {
    if (
      isLoggedIn &&
      user &&
      !requiresActivation(user) &&
      Array.isArray(user.permissionCodes) &&
      !user.permissionCodes.includes('page.user_center')
    ) {
      router.replace('/forbidden');
    }
  }, [isLoggedIn, router, user]);

  useEffect(() => {
    if (!isLoggedIn || !user || requiresActivation(user)) {
      setSubscriptionWorkOrder(null);
      setSavedMediaAssets([]);
      return;
    }

    const canReadMediaAssets = Array.isArray(user.permissionCodes)
      ? user.permissionCodes.includes('api.user.media_assets.list')
      : true;

    let cancelled = false;
    void (async () => {
      const [workOrderResponse, mediaResponse] = await Promise.all([
        userApiRequest('/api/membership/subscription-work-orders/current', {
          cache: 'no-store',
        }),
        canReadMediaAssets
          ? userApiRequest('/api/user/media-assets', {
              cache: 'no-store',
            })
          : Promise.resolve(new Response(JSON.stringify({ assets: [] }), { status: 200 })),
      ]);
      const [workOrderPayload, mediaPayload] = await Promise.all([
        readJsonResponse(workOrderResponse),
        readJsonResponse(mediaResponse),
      ]);
      if (!cancelled) {
        if (workOrderResponse.ok) {
          setSubscriptionWorkOrder(workOrderPayload.subscriptionWorkOrder ?? null);
        }
        if (mediaResponse.ok) {
          setSavedMediaAssets(Array.isArray(mediaPayload.assets) ? mediaPayload.assets : []);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user, router]);

  if (!isLoggedIn || !user) {
    return null;
  }

  if (requiresActivation(user)) {
    return (
      <div className="min-h-screen bg-white">
        <div className="sticky top-0 z-50 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
            <button onClick={() => router.back()} className="mr-3 cursor-pointer rounded-full p-1.5 hover:bg-[#f5f5f7]">
              <ArrowLeft className="h-5 w-5 text-[#1d1d1f]" />
            </button>
            <h1 className="text-base font-semibold text-[#1d1d1f]">用户中心</h1>
          </div>
        </div>
        <ProtectedAccountPanel accountState={user.accountState} title="激活账号后进入用户中心" />
      </div>
    );
  }

  const levelInfo = LEVEL_MAP[user.userLevel] || LEVEL_MAP.free;
  const totalCartPrice = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const maskedPhone = user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  const membershipLabel = user.membershipLevel === 'free' ? '免费' : user.membershipLevel === 'monthly' ? '月度' : '年度';
  const permissionCodes = Array.isArray(user.permissionCodes) ? user.permissionCodes : null;
  const canAccessUserCenter = permissionCodes ? permissionCodes.includes('page.user_center') : true;
  const canCopyInviteCode = permissionCodes
    ? permissionCodes.includes('action.user_center.copy_invite_code')
    : true;
  const canCheckin = permissionCodes ? permissionCodes.includes('api.user.points.checkin') : true;
  const subscriptionWorkOrderLabel = subscriptionWorkOrder?.result === 'approved'
    ? '已通过'
    : subscriptionWorkOrder?.result === 'rejected'
      ? '已拒绝'
      : subscriptionWorkOrder?.status === 'processing'
        ? '处理中'
        : subscriptionWorkOrder?.status === 'archived'
          ? '已归档'
          : '待处理';

  const handleSave = (field: string) => {
    if (!editValue.trim()) { setEditingField(null); return; }
    updateUser({ [field]: editValue.trim() });
    setEditingField(null);
  };

  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      updateUser({ avatar: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id !== id) return item;
      const newQty = Math.max(1, item.quantity + delta);
      return { ...item, quantity: newQty };
    }));
  };

  const removeCartItem = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const copyInviteValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // ignore clipboard failures in unsupported contexts
    }
  };

  const renderOverview = () => (
    <div className="space-y-4">
      <UserMediaModule assets={savedMediaAssets} />
    </div>
  );

  const handleRefreshInviteSummary = async () => {
    setInviteBusy(true);
    setActionMessage(null);
    try {
      const response = await userApiRequest('/api/user/invite', { cache: 'no-store' });
      const payload = await readJsonResponse(response);
      if (response.ok && payload.inviteSummary) {
        setInviteSummary(payload.inviteSummary);
        updateUser({ inviteSummary: payload.inviteSummary });
        return;
      }

      setActionMessage(
        typeof payload?.error?.message === 'string' ? payload.error.message : '邀请信息刷新失败，请稍后重试。',
      );
    } finally {
      setInviteBusy(false);
    }
  };

  const handleStartDailyCheckin = async () => {
    if (!canCheckin) {
      setActionMessage('当前会员方案暂无签到权限。');
      return;
    }

    if (checkinPending || checkinStatus?.checkedIn) {
      return;
    }

    setActionMessage(null);
    setCheckinVerificationOpen(true);
  };

  const handleCheckinVerification = async () => {
    setCheckinPending(true);
    setActionMessage(null);
    try {
      const verifyResponse = await userApiRequest('/api/user/points/checkin/challenge', {
        method: 'PUT',
      });
      const verifyPayload = await readJsonResponse(verifyResponse);
      if (!verifyResponse.ok || !verifyPayload.verificationToken) {
        setActionMessage(
          typeof verifyPayload?.error?.message === 'string' ? verifyPayload.error.message : '签到验证失败，请重新验证。',
        );
        setCheckinVerificationOpen(false);
        return;
      }

      const response = await userApiRequest('/api/user/points/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verificationToken: verifyPayload.verificationToken }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.checkin) {
        setActionMessage(
          typeof payload?.error?.message === 'string' ? payload.error.message : '签到失败，请稍后重试。',
        );
        setCheckinVerificationOpen(false);
        return;
      }

      setCheckinStatus(payload.checkin);
      const refreshedUser = await refreshUser();
      if (refreshedUser) {
        setInviteSummary(refreshedUser.inviteSummary ?? null);
        setRecentPointActivities(refreshedUser.recentPointActivities ?? []);
        setCheckinStatus(refreshedUser.checkinStatus ?? payload.checkin);
      }
      setCheckinVerificationOpen(false);
      setActionMessage(
        payload.alreadyCheckedIn
          ? '今天已经签到过了。'
          : `签到成功，获得 ${formatCredits(payload.checkin.rewardPoints ?? 0)} 积分。`,
      );
    } finally {
      setCheckinPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <button onClick={() => router.back()} className="mr-3 cursor-pointer rounded-full p-1.5 hover:bg-[#f5f5f7]">
            <ArrowLeft className="h-5 w-5 text-[#1d1d1f]" />
          </button>
          <h1 className="text-base font-semibold text-[#1d1d1f]">用户中心</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-20">
        {/* Profile Card */}
        <div className="mt-6 rounded-2xl bg-[#f5f5f7] p-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <UserAvatar avatar={user.avatar} size={64} userLevel={user.userLevel} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-[#1d1d1f] text-white shadow-md"
              >
                <Camera className="h-3 w-3" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#1d1d1f] truncate">{user.nickname}</h2>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: levelInfo.color }}
                >
                  {levelInfo.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#86868b]">{user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white p-3 text-center">
              <Star className="mx-auto h-5 w-5 text-[#b45309]" />
              <p className="mt-1 text-lg font-bold text-[#1d1d1f]">{formatCredits(user.points)}</p>
              <p className="text-[10px] text-[#86868b]">积分</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center">
              <ShoppingBag className="mx-auto h-5 w-5 text-[#1d1d1f]" />
              <p className="mt-1 text-lg font-bold text-[#1d1d1f]">{cart.length}</p>
              <p className="text-[10px] text-[#86868b]">购物车</p>
            </div>
            <div className="rounded-xl bg-white p-3 text-center">
              <Crown className="mx-auto h-5 w-5 text-[#b45309]" />
              <p className="mt-1 text-lg font-bold text-[#1d1d1f]">
                {membershipLabel}
              </p>
              <p className="text-[10px] text-[#86868b]">当前会员</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex gap-1 rounded-xl bg-[#f5f5f7] p-1">
          {[
            { key: 'overview', label: '总览' },
            { key: 'cart', label: '购物车' },
            { key: 'history', label: '历史' },
            { key: 'profile', label: '资料' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`cursor-pointer flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                activeTab === tab.key ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {actionMessage ? (
          <div className="mt-4 rounded-xl border border-black/[0.08] bg-[#f5f5f7] px-4 py-3 text-sm text-[#1d1d1f]">
            {actionMessage}
          </div>
        ) : null}

        {/* Tab Content */}
        <div className="mt-4">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-3">
              {renderOverview()}

              <div
                onClick={() => setActiveTab('cart')}
                className="flex cursor-pointer items-center justify-between rounded-xl bg-[#f5f5f7] p-4 transition-all hover:bg-[#eee]"
              >
                <div className="flex items-center gap-3">
                  <ShoppingBag className="h-5 w-5 text-[#1d1d1f]" />
                  <div>
                    <p className="text-sm font-medium text-[#1d1d1f]">我的购物车</p>
                    <p className="text-xs text-[#86868b]">{cart.length} 件商品</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#86868b]" />
              </div>

              <div
                onClick={() => setActiveTab('history')}
                className="flex cursor-pointer items-center justify-between rounded-xl bg-[#f5f5f7] p-4 transition-all hover:bg-[#eee]"
              >
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-[#1d1d1f]" />
                  <div>
                    <p className="text-sm font-medium text-[#1d1d1f]">购买记录</p>
                    <p className="text-xs text-[#86868b]">{purchaseHistory.length} 笔订单</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#86868b]" />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-[#f5f5f7] p-4">
                <div className="flex items-center gap-3">
                  <Star className="h-5 w-5 text-[#b45309]" />
                  <div>
                    <p className="text-sm font-medium text-[#1d1d1f]">我的积分</p>
                    <p className="text-xs text-[#86868b]">当前 {formatCredits(user.points)} 积分</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-[#f5f5f7] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Gift className="mt-0.5 h-5 w-5 text-[#1d1d1f]" />
                    <div>
                      <p className="text-sm font-medium text-[#1d1d1f]">邀请有礼</p>
                      <p className="mt-1 text-xs text-[#86868b]">
                        邀请码 {inviteSummary?.inviteCode ?? '...'} · 已邀请 {inviteSummary?.invitedCount ?? 0} 人
                      </p>
                      <p className="mt-1 text-xs text-[#86868b]">
                        已达标 {inviteSummary?.qualifiedCount ?? 0} 人 · 累计奖励 {formatCredits(inviteSummary?.rewardedPoints ?? 0)} 积分
                      </p>
                    </div>
                  </div>
                  {canCopyInviteCode ? (
                    <button
                      onClick={() => {
                        if (inviteSummary?.inviteLink) {
                          void copyInviteValue(inviteSummary.inviteLink);
                        } else {
                          void handleRefreshInviteSummary();
                        }
                      }}
                      disabled={inviteBusy}
                      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-white px-3 py-1 text-[10px] font-medium text-[#1d1d1f] disabled:opacity-50"
                    >
                      <Copy className="h-3 w-3" />
                      {inviteSummary?.inviteLink ? '复制链接' : '刷新'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl bg-[#f5f5f7] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <CalendarCheck className="mt-0.5 h-5 w-5 text-[#22c55e]" />
                    <div>
                      <p className="text-sm font-medium text-[#1d1d1f]">每日签到</p>
                      <p className="mt-1 text-xs text-[#86868b]">
                        {checkinStatus?.checkedIn
                          ? `今日已签到${checkinStatus.rewardPoints ? `，获得 ${formatCredits(checkinStatus.rewardPoints)} 积分` : ''}`
                          : '每天可随机获得 1-3 积分'}
                      </p>
                      <p className="mt-1 text-xs text-[#86868b]">
                        {checkinStatus?.businessDate ?? '--'} · 连续签到 {checkinStatus?.streakCount ?? 0} 天
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void handleStartDailyCheckin()}
                    disabled={!canCheckin || checkinPending || checkinStatus?.checkedIn}
                    className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-medium text-white ${
                      !canCheckin || checkinPending || checkinStatus?.checkedIn ? 'bg-[#c7c7cc]' : 'bg-[#1d1d1f]'
                    }`}
                  >
                    {!canCheckin ? '无权限' : checkinPending ? '签到中' : checkinStatus?.checkedIn ? '今日已签' : '立即签到'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-[#f5f5f7] p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Clock className="h-5 w-5 text-[#1d1d1f]" />
                  <div>
                    <p className="text-sm font-medium text-[#1d1d1f]">最近积分活动</p>
                    <p className="text-xs text-[#86868b]">最近 5 条积分变动记录</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {recentPointActivities.length === 0 ? (
                    <p className="text-xs text-[#86868b]">暂无积分记录</p>
                  ) : (
                    recentPointActivities.map(activity => (
                      <div key={activity.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-[#1d1d1f]">{activity.reason}</p>
                          <p className="mt-0.5 text-[10px] text-[#86868b]">
                            {new Date(activity.createdAt).toLocaleString('zh-CN', { hour12: false })}
                          </p>
                        </div>
                        <p className={`shrink-0 text-sm font-semibold ${activity.amount >= 0 ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>
                          {activity.amount >= 0 ? '+' : ''}
                          {formatCredits(activity.amount)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-[#f5f5f7] p-4">
                <div className="flex items-center gap-3">
                  <Crown className="h-5 w-5 text-[#b45309]" />
                  <div>
                    <p className="text-sm font-medium text-[#1d1d1f]">当前会员</p>
                    <p className="text-xs text-[#86868b]">
                      {user.membershipLevel === 'free' ? '免费用户' : `${membershipLabel}会员`}
                      {user.membershipExpiry && ` · 到期 ${user.membershipExpiry}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/membership')}
                  className="cursor-pointer rounded-full bg-[#1d1d1f] px-3 py-1 text-[10px] font-medium text-white"
                >
                  升级
                </button>
              </div>

              {subscriptionWorkOrder ? (
                <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#1d1d1f]">会员订阅工单</p>
                      <p className="mt-1 text-xs text-[#86868b]">
                        {subscriptionWorkOrder.planName} · {subscriptionWorkOrder.orderNumber}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#f5f5f7] px-2.5 py-1 text-xs text-[#1d1d1f]">
                      {subscriptionWorkOrderLabel}
                    </span>
                  </div>
                  {subscriptionWorkOrder.decisionNote ? (
                    <p className="mt-3 text-xs text-[#555555]">
                      {subscriptionWorkOrder.decisionNote}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div
                onClick={() => setActiveTab('profile')}
                className="flex cursor-pointer items-center justify-between rounded-xl bg-[#f5f5f7] p-4 transition-all hover:bg-[#eee]"
              >
                <div className="flex items-center gap-3">
                  <Edit3 className="h-5 w-5 text-[#1d1d1f]" />
                  <p className="text-sm font-medium text-[#1d1d1f]">修改个人资料</p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#86868b]" />
              </div>

              <button
                onClick={() => { logout(); router.push('/home'); }}
                className="mt-4 w-full cursor-pointer rounded-xl border border-[#b91c1c]/20 py-3 text-sm font-medium text-[#b91c1c] transition-all hover:bg-[#b91c1c]/5"
              >
                退出登录
              </button>
            </div>
          )}

          {/* Cart Tab */}
          {activeTab === 'cart' && (
            <div>
              {cart.length === 0 ? (
                <div className="py-16 text-center">
                  <ShoppingBag className="mx-auto h-12 w-12 text-[#ddd]" />
                  <p className="mt-3 text-sm text-[#86868b]">购物车是空的</p>
                  <button
                    onClick={() => router.push('/shop')}
                    className="mt-3 cursor-pointer rounded-full bg-[#1d1d1f] px-5 py-2 text-xs font-medium text-white"
                  >
                    去商城逛逛
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl bg-[#f5f5f7] p-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white">
                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#1d1d1f] truncate">{item.name}</p>
                        <p className="text-xs text-[#86868b]">{item.size}</p>
                        <p className="mt-1 text-sm font-bold text-[#1d1d1f]">¥{item.price}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartQty(item.id, -1)}
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-black/[0.1] bg-white"
                        >
                          <Minus className="h-3 w-3 text-[#1d1d1f]" />
                        </button>
                        <span className="w-6 text-center text-sm font-medium text-[#1d1d1f]">{item.quantity}</span>
                        <button
                          onClick={() => updateCartQty(item.id, 1)}
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-black/[0.1] bg-white"
                        >
                          <Plus className="h-3 w-3 text-[#1d1d1f]" />
                        </button>
                        <button onClick={() => removeCartItem(item.id)} className="ml-1 cursor-pointer text-[#86868b] hover:text-[#b91c1c]">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-xl bg-[#f5f5f7] p-4">
                    <p className="text-sm text-[#86868b]">合计</p>
                    <p className="text-lg font-bold text-[#1d1d1f]">¥{totalCartPrice}</p>
                  </div>
                  <button className="w-full cursor-pointer rounded-xl bg-[#1d1d1f] py-3 text-sm font-medium text-white transition-all hover:bg-[#333]">
                    去结算
                  </button>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {purchaseHistory.length === 0 ? (
                <div className="py-16 text-center">
                  <Clock className="mx-auto h-12 w-12 text-[#ddd]" />
                  <p className="mt-3 text-sm text-[#86868b]">暂无购买记录</p>
                </div>
              ) : (
                purchaseHistory.map(item => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl bg-[#f5f5f7] p-4">
                    <div>
                      <p className="text-sm font-medium text-[#1d1d1f]">{item.name}</p>
                      <p className="text-xs text-[#86868b]">{item.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#1d1d1f]">¥{item.price}</p>
                      <p className="text-[10px] text-[#22c55e]">{item.status}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-3">
              {/* Avatar */}
              <div className="rounded-xl bg-[#f5f5f7] p-4">
                <p className="mb-3 text-xs font-medium text-[#86868b]">头像</p>
                <div className="flex items-center gap-4">
                  <UserAvatar avatar={user.avatar} size={56} userLevel={user.userLevel} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer rounded-xl border border-black/[0.1] bg-white px-4 py-2 text-xs font-medium text-[#1d1d1f] transition-all hover:bg-[#f5f5f7]"
                  >
                    更换头像
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </div>
              </div>

              {/* Nickname */}
              <div className="rounded-xl bg-[#f5f5f7] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-medium text-[#86868b]">昵称</p>
                    {editingField === 'nickname' ? (
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="flex-1 rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 text-sm text-[#1d1d1f] outline-none"
                          autoFocus
                        />
                        <button onClick={() => handleSave('nickname')} className="cursor-pointer text-[#1d1d1f]"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setEditingField(null)} className="cursor-pointer text-[#86868b]"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center gap-2">
                        <p className="text-sm text-[#1d1d1f]">{user.nickname}</p>
                        <button onClick={() => startEdit('nickname', user.nickname)} className="cursor-pointer text-[#86868b] hover:text-[#1d1d1f]">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Phone */}
              <div className="rounded-xl bg-[#f5f5f7] p-4">
                <p className="text-xs font-medium text-[#86868b]">手机号</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-sm text-[#1d1d1f]">{maskedPhone}</p>
                </div>
              </div>

              {/* Password */}
              <div className="rounded-xl bg-[#f5f5f7] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-[#86868b]">密码</p>
                    <p className="mt-1 text-sm text-[#1d1d1f]">••••••</p>
                  </div>
                  <button
                    onClick={() => startEdit('password', '')}
                    className="cursor-pointer rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 text-xs font-medium text-[#1d1d1f]"
                  >
                    修改密码
                  </button>
                </div>
                {editingField === 'password' && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="password"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      placeholder="输入新密码"
                      className="flex-1 rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 text-sm text-[#1d1d1f] outline-none"
                      autoFocus
                    />
                    <button onClick={() => { setEditingField(null); }} className="cursor-pointer text-[#1d1d1f]"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditingField(null)} className="cursor-pointer text-[#86868b]"><X className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <HumanVerificationDialog
        open={checkinVerificationOpen}
        title="签到验证"
        description="输入图中验证码后继续签到。"
        busy={checkinPending}
        onCancel={() => {
          if (!checkinPending) {
            setCheckinVerificationOpen(false);
          }
        }}
        onVerified={handleCheckinVerification}
      />
    </div>
  );
}
  if (!canAccessUserCenter) {
    return null;
  }
