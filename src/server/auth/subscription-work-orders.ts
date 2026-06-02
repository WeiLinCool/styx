import { AccountDomainError } from './account-types';

export type SubscriptionWorkOrderStatus = 'pending' | 'processing' | 'closed' | 'archived';
export type SubscriptionWorkOrderResult = 'approved' | 'rejected';
export type MembershipBillingPeriod = 'month' | 'year' | 'one_time';

export function assertSubscriptionWorkOrderTransition(
  currentStatus: SubscriptionWorkOrderStatus,
  nextStatus: SubscriptionWorkOrderStatus,
) {
  const allowed: Record<SubscriptionWorkOrderStatus, SubscriptionWorkOrderStatus[]> = {
    pending: ['processing'],
    processing: ['closed'],
    closed: ['archived'],
    archived: [],
  };

  if (!allowed[currentStatus].includes(nextStatus)) {
    throw new AccountDomainError(
      'invalid_subscription_work_order_transition',
      `Invalid subscription work order transition: ${currentStatus} -> ${nextStatus}.`,
      409,
    );
  }
}

export function addMembershipPeriod(base: Date, billingPeriod: MembershipBillingPeriod) {
  const next = new Date(base);

  if (billingPeriod === 'month') {
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  if (billingPeriod === 'year') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next;
  }

  throw new AccountDomainError(
    'unsupported_membership_billing_period',
    `Unsupported membership billing period: ${billingPeriod}.`,
    400,
  );
}

export function getEntitlementWindow(input: {
  approvalTime: Date;
  billingPeriod: MembershipBillingPeriod;
  currentExpiresAt?: Date | null;
}) {
  const base =
    input.currentExpiresAt && input.currentExpiresAt.getTime() > input.approvalTime.getTime()
      ? input.currentExpiresAt
      : input.approvalTime;

  return {
    startsAt: input.approvalTime,
    expiresAt: addMembershipPeriod(base, input.billingPeriod),
  };
}
