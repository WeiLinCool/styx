export type ReferralQualificationSource =
  | 'order_paid'
  | 'membership_activated';

export type InviteSummary = {
  code: string;
  inviteUrl: string;
  invitedCount: number;
  qualifiedCount: number;
  rewardedPoints: number;
};

export type RecentPointActivity = {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
};
