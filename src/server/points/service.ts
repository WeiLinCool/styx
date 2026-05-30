export function chooseDailyCheckinReward() {
  return Math.floor(Math.random() * 3) + 1;
}

export function buildReferralRewardKey(referredUserId: string) {
  return `referral-reward:referred-user:${referredUserId}`;
}

export function buildDailyCheckinKey(userId: string, businessDate: string) {
  return `daily-checkin:${userId}:${businessDate}`;
}
