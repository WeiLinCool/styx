import Cookies from 'js-cookie';
import type { AccountState } from '@/server/auth/account-types';
import { getAccountState } from '@/features/account/account-state';
import {
  getScopedAuthCookieName,
  getScopedUserCookieName,
  legacyAuthCookieNames,
} from './auth-cookie-names';

export type UserLevel = 'free' | 'vip' | 'svip' | 'partner' | 'core_partner';

export interface UserInfo {
  id: string;
  nickname: string;
  avatar: string;
  email: string;
  phone: string;
  membershipLevel: 'free' | 'monthly' | 'yearly';
  membershipExpiry: string | null;
  userLevel: UserLevel;
  accountState?: AccountState;
  mustResetPassword?: boolean;
  points: number;
}

const SPLASH_COOKIE_KEY = 'nfai_splash_visited';

function getCurrentCookieScopeHost() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.location.host;
}

export function saveUserToCookie(user: UserInfo): void {
  const scopedUserCookieName = getScopedUserCookieName(getCurrentCookieScopeHost());
  const payload = JSON.stringify({
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    email: user.email,
    phone: user.phone,
    membershipLevel: user.membershipLevel,
    membershipExpiry: user.membershipExpiry,
    userLevel: user.userLevel,
    accountState: getAccountState(user),
    mustResetPassword: user.mustResetPassword,
    points: user.points,
  } satisfies UserInfo);

  Cookies.set(scopedUserCookieName, payload, { expires: 30, sameSite: 'lax' });
  if (scopedUserCookieName !== legacyAuthCookieNames.user) {
    Cookies.remove(legacyAuthCookieNames.user);
  }
}

export function getUserFromCookie(): UserInfo | null {
  const scopedUserCookieName = getScopedUserCookieName(getCurrentCookieScopeHost());
  const data = Cookies.get(scopedUserCookieName) ?? Cookies.get(legacyAuthCookieNames.user);
  if (!data) return null;
  try {
    const user = JSON.parse(data) as UserInfo;
    return { ...user, accountState: getAccountState(user) };
  } catch {
    return null;
  }
}

export function removeUserFromCookie(): void {
  const host = getCurrentCookieScopeHost();
  Cookies.remove(getScopedUserCookieName(host));
  Cookies.remove(getScopedAuthCookieName(host));
  Cookies.remove(legacyAuthCookieNames.user);
  Cookies.remove(legacyAuthCookieNames.auth);
}

export function setAuthToken(token: string): void {
  const scopedAuthCookieName = getScopedAuthCookieName(getCurrentCookieScopeHost());
  Cookies.set(scopedAuthCookieName, token, { expires: 30, sameSite: 'lax' });
  if (scopedAuthCookieName !== legacyAuthCookieNames.auth) {
    Cookies.remove(legacyAuthCookieNames.auth);
  }
}

export function getAuthToken(): string | undefined {
  const host = getCurrentCookieScopeHost();
  return Cookies.get(getScopedAuthCookieName(host)) ?? Cookies.get(legacyAuthCookieNames.auth);
}

export function setSplashVisited(): void {
  Cookies.set(SPLASH_COOKIE_KEY, 'true', { expires: 1, sameSite: 'lax' });
}

export function getSplashVisited(): boolean {
  return Cookies.get(SPLASH_COOKIE_KEY) === 'true';
}
