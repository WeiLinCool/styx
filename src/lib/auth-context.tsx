'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { readJsonResponse } from '@/lib/api-response';
import { getUserFromCookie, saveUserToCookie, removeUserFromCookie, type UserInfo } from '@/lib/cookie';
import { canSubmitPasswordRegistration, shouldRefreshAuthUserSnapshot, shouldReplaceAuthUser } from '@/lib/auth-user';
import { userApiRequest } from '@/lib/user-api-client';
import { HumanVerificationDialog } from '@/components/human-verification-dialog';
import { X, Phone, Lock, User, Camera, Upload, Check, Ticket } from 'lucide-react';

export type UserPointActivity = {
  id: string;
  entryType: 'grant' | 'debit' | 'adjustment';
  amount: number;
  reason: string;
  createdAt: string;
};

export type UserInviteSummary = {
  inviteCode: string;
  inviteLink: string;
  invitedCount: number;
  qualifiedCount: number;
  rewardedPoints: number;
};

export type UserCheckinStatus = {
  businessDate: string;
  checkedIn: boolean;
  rewardPoints: number | null;
  streakCount: number | null;
  checkedInAt: string | null;
};

export type AuthUserInfo = UserInfo & {
  displayName?: string;
  inviteSummary?: UserInviteSummary;
  checkinStatus?: UserCheckinStatus;
  recentPointActivities?: UserPointActivity[];
};

interface AuthContextType {
  user: AuthUserInfo | null;
  isLoggedIn: boolean;
  login: (user: AuthUserInfo) => void;
  logout: () => void;
  updateUser: (updates: Partial<AuthUserInfo>) => void;
  refreshUser: () => Promise<AuthUserInfo | null>;
  showLoginModal: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function LoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: (user: AuthUserInfo) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [avatarSeed, setAvatarSeed] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAuthAction, setPendingAuthAction] = useState<'login' | 'register' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const invite = searchParams.get('invite');
    if (!invite) {
      return;
    }

    setMode('register');
    setInviteCode((current) => current || invite.slice(0, 20));
  }, [searchParams]);

  const handleLogin = () => {
    if (!phone || !password) return;
    setErrorMessage('');
    setPendingAuthAction('login');
  };

  const performLogin = async (verificationToken: string) => {
    setSubmitting(true);
    setErrorMessage('');
    try {
      const response = await userApiRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, password, verificationToken }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.user) {
        const message = typeof payload?.error?.message === 'string' ? payload.error.message : '登录失败，请重试。';
        setErrorMessage(message);
        if (payload?.error?.code === 'password_setup_required') {
          onClose();
          router.push(`/auth/set-password?phone=${encodeURIComponent(phone)}`);
        }
        return;
      }
      onLogin(payload.user);
    } finally {
      setSubmitting(false);
      setPendingAuthAction(null);
    }
  };

  const handleRegister = () => {
    if (!canSubmitPasswordRegistration({ nickname, phone, password, confirmPassword, agreed })) return;
    setErrorMessage('');
    setPendingAuthAction('register');
  };

  const performRegister = async (verificationToken: string) => {
    setSubmitting(true);
    setErrorMessage('');
    try {
      const response = await userApiRequest('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phone,
          nickname,
          password,
          inviteCode: inviteCode || undefined,
          verificationToken,
        }),
      });
      const payload = await readJsonResponse(response);
      if (!response.ok || !payload.user) {
        setErrorMessage(
          typeof payload?.error?.message === 'string' ? payload.error.message : '设置密码失败，请重试。',
        );
        return;
      }
      onLogin({
        ...payload.user,
        avatar: avatarUrl || avatarSeed || payload.user.avatar,
      });
    } finally {
      setSubmitting(false);
      setPendingAuthAction(null);
    }
  };

  const handleAuthVerification = async () => {
    const response = await userApiRequest('/api/auth/human-verification', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload.verificationToken) {
      setErrorMessage(
        typeof payload?.error?.message === 'string' ? payload.error.message : '验证码验证失败，请重试。',
      );
      setPendingAuthAction(null);
      return;
    }

    if (pendingAuthAction === 'login') {
      await performLogin(payload.verificationToken);
      return;
    }

    if (pendingAuthAction === 'register') {
      await performRegister(payload.verificationToken);
    }
  };

  // 5 default avatar options
  const defaultAvatars = [
    { bg: '#1d1d1f', emoji: '🪨' },
    { bg: '#e91e8c', emoji: '🌸' },
    { bg: '#3b82f6', emoji: '🌊' },
    { bg: '#10b981', emoji: '🍃' },
    { bg: '#f59e0b', emoji: '☀️' },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-[420px] bg-white rounded-3xl shadow-2xl overflow-hidden animate-[fadeInUp_0.3s_ease-out] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="relative px-8 pt-8 pb-4 shrink-0">
          <button
            onClick={onClose}
            className="absolute right-6 top-6 w-8 h-8 flex items-center justify-center rounded-full bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed] transition-colors"
          >
            <X size={16} />
          </button>

          {/* Logo */}
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#1d1d1f] flex items-center justify-center">
              <span className="text-white font-bold text-lg">NF</span>
            </div>
          </div>

          <h2 className="text-center text-2xl font-bold text-[#1d1d1f]">
            {mode === 'login' ? '欢迎回来' : '创建账号'}
          </h2>
          <p className="text-center text-[#86868b] mt-1.5 text-sm">
            {mode === 'login' ? '登录南风石印工坊' : '注册南风石印工坊'}
          </p>
        </div>

        {/* Body - scrollable */}
        <div className="px-8 pb-8 overflow-y-auto">
          {mode === 'login' && (
            <div className="space-y-4">
              {/* Phone */}
              <div className="relative">
                <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="手机号"
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#f5f5f7] border border-transparent text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:outline-none focus:border-[#1d1d1f] focus:bg-white transition-all text-[15px]"
                />
              </div>
              {/* Password */}
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="密码"
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#f5f5f7] border border-transparent text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:outline-none focus:border-[#1d1d1f] focus:bg-white transition-all text-[15px]"
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={submitting}
                className="w-full h-12 rounded-xl bg-[#1d1d1f] text-white font-medium text-[15px] hover:bg-[#333] active:scale-[0.98] transition-all"
              >
                登录
              </button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push('/auth/forgot-password');
                  }}
                  className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] hover:underline"
                >
                  忘记密码
                </button>
              </div>
              {errorMessage ? (
                <p className="text-center text-sm text-[#b42318]">{errorMessage}</p>
              ) : null}
              <div className="flex items-center justify-center gap-1 text-sm">
                <span className="text-[#86868b]">还没有账号？</span>
                <button onClick={() => setMode('register')} className="text-[#1d1d1f] font-medium hover:underline">
                  立即注册
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div className="space-y-4">
              {errorMessage ? (
                <div className="rounded-xl bg-[#fff1f3] px-4 py-3 text-sm text-[#b42318]">
                  {errorMessage}
                </div>
              ) : null}
              {/* 1. Avatar Selection */}
              <div className="flex flex-col items-center gap-2.5">
                <p className="text-sm font-medium text-[#1d1d1f]">选择头像</p>
                {/* Main Avatar Preview */}
                <div className="relative group">
                  <div className="w-20 h-20 rounded-full bg-[#f5f5f7] flex items-center justify-center overflow-hidden border-2 border-[#e5e5ea]">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="头像" className="w-full h-full object-cover" />
                    ) : avatarSeed ? (
                      <div
                        className="w-full h-full flex items-center justify-center text-2xl"
                        style={{ backgroundColor: defaultAvatars[parseInt(avatarSeed)]?.bg || '#1d1d1f' }}
                      >
                        {defaultAvatars[parseInt(avatarSeed)]?.emoji || '🪨'}
                      </div>
                    ) : (
                      <Camera size={28} className="text-[#c7c7cc]" />
                    )}
                  </div>
                  {/* Upload overlay */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-all"
                  >
                    <Upload size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setAvatarUrl(ev.target?.result as string);
                          setAvatarSeed('');
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
                {/* 5 Default avatars + upload */}
                <div className="flex gap-2.5 items-center">
                  {defaultAvatars.map((av, i) => (
                    <button
                      key={i}
                      onClick={() => { setAvatarSeed(String(i)); setAvatarUrl(''); }}
                      className={`w-10 h-10 rounded-full transition-all flex items-center justify-center text-lg ${avatarSeed === String(i) && !avatarUrl ? 'ring-2 ring-[#1d1d1f] ring-offset-2 scale-110' : 'hover:scale-110'}`}
                      style={{ backgroundColor: av.bg }}
                    >
                      {av.emoji}
                    </button>
                  ))}
                  {/* Upload button as 6th circle */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-10 h-10 rounded-full bg-[#f5f5f7] border-2 border-dashed border-[#c7c7cc] flex items-center justify-center hover:border-[#1d1d1f] transition-all ${avatarUrl ? 'ring-2 ring-[#1d1d1f] ring-offset-2' : ''}`}
                  >
                    {avatarUrl ? <Check size={16} className="text-[#1d1d1f]" /> : <Upload size={16} className="text-[#86868b]" />}
                  </button>
                </div>
              </div>

              {/* 2. Nickname */}
              <div className="relative">
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value.slice(0, 12))}
                  placeholder="昵称（2-12个字符，必填）"
                  className="w-full h-12 pl-12 pr-14 rounded-xl bg-[#f5f5f7] border border-transparent text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:outline-none focus:border-[#1d1d1f] focus:bg-white transition-all text-[15px]"
                />
                {nickname.length > 0 && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#86868b]">{nickname.length}/12</span>
                )}
              </div>

              {/* 3. Invite Code */}
              <div className="relative">
                <Ticket size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="text"
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value.slice(0, 20))}
                  placeholder="邀请码（选填）"
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#f5f5f7] border border-transparent text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:outline-none focus:border-[#1d1d1f] focus:bg-white transition-all text-[15px]"
                />
              </div>

              {/* 4. Phone */}
              <div className="relative">
                <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="手机号"
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#f5f5f7] border border-transparent text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:outline-none focus:border-[#1d1d1f] focus:bg-white transition-all text-[15px]"
                />
              </div>

              {/* 5. Password */}
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="设置密码（6-20位）"
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#f5f5f7] border border-transparent text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:outline-none focus:border-[#1d1d1f] focus:bg-white transition-all text-[15px]"
                />
              </div>

              {/* 6. Confirm Password */}
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#86868b]" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="确认密码"
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#f5f5f7] border border-transparent text-[#1d1d1f] placeholder:text-[#c7c7cc] focus:outline-none focus:border-[#1d1d1f] focus:bg-white transition-all text-[15px]"
                />
              </div>
              {confirmPassword && password !== confirmPassword ? (
                <p className="-mt-2 text-xs text-[#b91c1c]">两次输入的密码不一致。</p>
              ) : null}

              {/* 7. Agreement */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-[#c7c7cc] text-[#1d1d1f] accent-[#1d1d1f]"
                />
                <span className="text-xs text-[#86868b] leading-relaxed">
                  我已阅读并同意<span className="text-[#1d1d1f] font-medium">《用户协议》</span>和<span className="text-[#1d1d1f] font-medium">《隐私政策》</span>
                </span>
              </label>

              {/* 8. Register Button */}
              <button
                onClick={handleRegister}
                disabled={!canSubmitPasswordRegistration({ nickname, phone, password, confirmPassword, agreed })}
                className="w-full h-12 rounded-xl bg-[#1d1d1f] text-white font-medium text-[15px] hover:bg-[#333] active:scale-[0.98] transition-all disabled:opacity-40"
              >
                注册
              </button>

              <div className="flex items-center justify-center gap-1 text-sm">
                <span className="text-[#86868b]">已有账号？</span>
                <button onClick={() => setMode('login')} className="text-[#1d1d1f] font-medium hover:underline">
                  去登录
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <HumanVerificationDialog
        open={pendingAuthAction !== null}
        title={pendingAuthAction === 'register' ? '注册验证' : '登录验证'}
        description="输入图中验证码后继续。"
        busy={submitting}
        onCancel={() => {
          if (!submitting) {
            setPendingAuthAction(null);
          }
        }}
        onVerified={handleAuthVerification}
      />
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUserInfo | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const userRef = useRef<AuthUserInfo | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await userApiRequest('/api/auth/me', { cache: 'no-store' });
      const payload = await readJsonResponse(response);

      if (response.ok && payload?.authenticated && payload.user) {
        if (shouldReplaceAuthUser(userRef.current, payload.user)) {
          saveUserToCookie(payload.user);
          setUser(payload.user);
        }
        if (payload.user.mustResetPassword && payload.user.phone) {
          router.push(`/auth/reset-password?phone=${encodeURIComponent(payload.user.phone)}`);
        }
        return payload.user as AuthUserInfo;
      }

      if (response.ok && payload?.authenticated === false) {
        removeUserFromCookie();
        setUser(null);
        return null;
      }

      return userRef.current;
    } catch {
      return userRef.current;
    }
  }, [router]);

  useEffect(() => {
    async function hydrate() {
      const savedUser = getUserFromCookie();
      if (savedUser) {
        setUser(savedUser);
        setMounted(true);
        if (shouldRefreshAuthUserSnapshot(savedUser)) {
          void refreshUser();
        }
        return;
      }

      try {
        await refreshUser();
      } finally {
        setMounted(true);
      }
    }

    void hydrate();
  }, [refreshUser]);

  const login = useCallback((userData: AuthUserInfo) => {
    saveUserToCookie(userData);
    setUser(userData);
    setShowLoginModal(false);
    toast.success('登录成功。');
    if (userData.mustResetPassword && userData.phone) {
      router.push(`/auth/reset-password?phone=${encodeURIComponent(userData.phone)}`);
      return;
    }
    void refreshUser();
    router.refresh();
  }, [refreshUser, router]);

  const logout = useCallback(() => {
    void userApiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    removeUserFromCookie();
    setUser(null);
    toast.success('已退出登录。');
  }, []);

  const updateUser = useCallback((updates: Partial<AuthUserInfo>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      saveUserToCookie(updated);
      return updated;
    });
  }, []);

  const openLoginModal = useCallback(() => setShowLoginModal(true), []);
  const closeLoginModal = useCallback(() => setShowLoginModal(false), []);

  if (!mounted) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: !!user, login, logout, updateUser, refreshUser, showLoginModal, openLoginModal, closeLoginModal }}>
      {children}
      {showLoginModal && (
        <LoginModal
          onClose={closeLoginModal}
          onLogin={login}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
