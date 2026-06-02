import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { getCreditBalance } from '@/server/billing/credits';
import { getServerCache } from '@/server/cache/server-cache';
import { buildInviteUrl, formatBusinessDateInShanghai } from '@/server/points/service';
import { resolveSession } from '@/server/auth/session';
import { createJsonResponse } from '@/server/encrypted-response';
import {
  getInviteSummary,
  getTodayDailyCheckin,
  listRecentPointActivity,
} from '@/server/repositories/points';

const RECENT_ACTIVITY_LIMIT = 5;
const POINTS_OVERVIEW_CACHE_TTL_MS = 30 * 1000;

function buildPointsOverviewCacheKey(userId: string) {
  return `user-points-overview:${userId}`;
}

async function getUserPointsOverview(userId: string, origin: string) {
  const cache = getServerCache();
  const cacheKey = buildPointsOverviewCacheKey(userId);
  const cached = await cache.getJson<Awaited<ReturnType<typeof readUserPointsOverview>>>(cacheKey);
  if (cached) {
    return {
      ...cached,
      inviteSummary: {
        ...cached.inviteSummary,
        inviteLink: buildInviteUrl(origin, cached.inviteSummary.inviteCode),
      },
    };
  }

  const overview = await readUserPointsOverview(userId, origin);
  await cache.setJson(cacheKey, overview, POINTS_OVERVIEW_CACHE_TTL_MS);
  return overview;
}

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

    const overview = await getUserPointsOverview(
      session.user.id,
      new URL(request.url).origin,
    );

    return createJsonResponse({
      authenticated: true,
      user: {
        id: session.user.id,
        nickname: session.user.displayName,
        avatar: session.user.phone ?? session.user.email ?? session.user.displayName,
        email: session.user.email ?? '',
        phone: session.user.phone ?? '',
        membershipLevel: 'free',
        membershipExpiry: null,
        userLevel: 'free',
        accountState: session.user.accountState,
        displayName: session.user.displayName,
        mustResetPassword: session.user.metadata?.mustResetPassword === true,
        points: overview.points,
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
