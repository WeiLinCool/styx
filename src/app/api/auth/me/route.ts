import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { listActiveUserEntitlementsAt } from '@/server/ai/model-entitlements';
import { resolveUserMembershipSnapshot } from '@/server/auth/membership-snapshot';
import { listUserPermissionCodes } from '@/server/auth/permission-service';
import { getCreditBalance } from '@/server/billing/credits';
import { buildInviteUrl, formatBusinessDateInShanghai } from '@/server/points/service';
import { resolveSession } from '@/server/auth/session';
import { createJsonResponse } from '@/server/encrypted-response';
import {
  getInviteSummary,
  getTodayDailyCheckin,
  listRecentPointActivity,
} from '@/server/repositories/points';

const RECENT_ACTIVITY_LIMIT = 5;

async function readUserPointsOverview(userId: string, origin: string) {
  const [points, inviteSummary, recentPointActivities] = await Promise.all([
    getCreditBalance(userId),
    getInviteSummary(userId),
    listRecentPointActivity(userId, RECENT_ACTIVITY_LIMIT),
  ]);

  const businessDate = formatBusinessDateInShanghai(new Date());
  const todayCheckin = await getTodayDailyCheckin(userId, businessDate);

  return {
    points,
    inviteSummary: {
      ...inviteSummary,
      inviteLink: buildInviteUrl(origin, inviteSummary.inviteCode),
    },
    checkinStatus: {
      businessDate,
      checkedIn: Boolean(todayCheckin),
      rewardPoints:
        todayCheckin && todayCheckin.rewardLedgerEntryId
          ? recentPointActivities.find((entry) => entry.id === todayCheckin.rewardLedgerEntryId)?.amount ?? null
          : null,
      streakCount: todayCheckin?.streakCount ?? null,
      checkedInAt: todayCheckin?.createdAt instanceof Date ? todayCheckin.createdAt.toISOString() : todayCheckin?.createdAt ?? null,
    },
    recentPointActivities,
  };
}

export async function GET(request: Request) {
  try {
    const session = await resolveSession();

    if (!session.authenticated) {
      return createJsonResponse({
        authenticated: false,
        user: null,
      });
    }

    const overview = await readUserPointsOverview(
      session.user.id,
      new URL(request.url).origin,
    );
    const now = new Date();
    const entitlements = await listActiveUserEntitlementsAt(session.user.id, now);
    const permissionCodes = await listUserPermissionCodes(session.user.id, {
      now,
      entitlements,
    });
    const membershipSnapshot = resolveUserMembershipSnapshot({
      entitlements,
      now,
    });

    return createJsonResponse({
      authenticated: true,
      user: {
        id: session.user.id,
        nickname: session.user.displayName,
        avatar: session.user.phone ?? session.user.email ?? session.user.displayName,
        email: session.user.email ?? '',
        phone: session.user.phone ?? '',
        membershipLevel: membershipSnapshot.membershipLevel,
        membershipExpiry: membershipSnapshot.membershipExpiry,
        userLevel: membershipSnapshot.userLevel,
        accountState: session.user.accountState,
        displayName: session.user.displayName,
        mustResetPassword: session.user.metadata?.mustResetPassword === true,
        points: overview.points,
        storageUsedBytes: session.user.storageUsedBytes,
        storageQuotaBytes: session.user.storageQuotaBytes,
        permissionCodes,
        inviteSummary: overview.inviteSummary,
        checkinStatus: overview.checkinStatus,
        recentPointActivities: overview.recentPointActivities,
      },
    });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
