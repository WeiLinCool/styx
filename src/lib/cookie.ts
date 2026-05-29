import Cookies from 'js-cookie';
import type { AccountState } from '@/server/auth/account-types';
import { getAccountState } from '@/features/account/account-state';

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
  points: number;
}

const USER_COOKIE_KEY = 'nfai_user';
const AUTH_COOKIE_KEY = 'nfai_auth_token';
const SPLASH_COOKIE_KEY = 'nfai_splash_visited';

export function saveUserToCookie(user: UserInfo): void {
  Cookies.set(USER_COOKIE_KEY, JSON.stringify({ ...user, accountState: getAccountState(user) }), { expires: 30, sameSite: 'lax' });
}

export function getUserFromCookie(): UserInfo | null {
  const data = Cookies.get(USER_COOKIE_KEY);
  if (!data) return null;
  try {
    const user = JSON.parse(data) as UserInfo;
    return { ...user, accountState: getAccountState(user) };
  } catch {
    return null;
  }
}

export function removeUserFromCookie(): void {
  Cookies.remove(USER_COOKIE_KEY);
  Cookies.remove(AUTH_COOKIE_KEY);
}

export function setAuthToken(token: string): void {
  Cookies.set(AUTH_COOKIE_KEY, token, { expires: 30, sameSite: 'lax' });
}

export function getAuthToken(): string | undefined {
  return Cookies.get(AUTH_COOKIE_KEY);
}

export function setSplashVisited(): void {
  Cookies.set(SPLASH_COOKIE_KEY, 'true', { expires: 1, sameSite: 'lax' });
}

export function getSplashVisited(): boolean {
  return Cookies.get(SPLASH_COOKIE_KEY) === 'true';
}
