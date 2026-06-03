export function shouldReplaceAuthUser<T>(current: T | null, next: T): boolean {
  return JSON.stringify(current) !== JSON.stringify(next);
}

export function hasUserPointsOverview(user: {
  checkinStatus?: unknown;
  recentPointActivities?: unknown;
}): boolean {
  return Boolean(user.checkinStatus && Array.isArray(user.recentPointActivities));
}

export function shouldRefreshAuthUserSnapshot(user: {
  accountState?: string | null;
  checkinStatus?: unknown;
  recentPointActivities?: unknown;
}): boolean {
  // Points, recent activity, and daily check-in state can change outside the current view,
  // so the client snapshot should always revalidate after hydration.
  return true;
}

export function canSubmitPasswordRegistration(input: {
  nickname: string;
  phone: string;
  password: string;
  confirmPassword: string;
  agreed: boolean;
}): boolean {
  return (
    input.agreed &&
    input.nickname.trim().length >= 2 &&
    input.phone.trim().length >= 11 &&
    input.password.length >= 6 &&
    input.password === input.confirmPassword
  );
}
