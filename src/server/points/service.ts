export function chooseDailyCheckinReward() {
  return Math.floor(Math.random() * 3) + 1;
}

export function buildReferralRewardKey(referredUserId: string) {
  return `referral-reward:referred-user:${referredUserId}`;
}

export function buildDailyCheckinKey(userId: string, businessDate: string) {
  return `daily-checkin:${userId}:${businessDate}`;
}

export function formatBusinessDateInShanghai(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function buildInviteUrl(origin: string, inviteCode: string) {
  const url = new URL('/home', origin);
  url.searchParams.set('invite', inviteCode);
  return url.toString();
}
