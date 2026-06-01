import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { grantCredits } from '@/server/billing/credits';
import {
  buildDailyCheckinKey,
  chooseDailyCheckinReward,
  formatBusinessDateInShanghai,
} from '@/server/points/service';
import {
  createDailyCheckinRecord,
  getTodayDailyCheckin,
  listRecentPointActivity,
} from '@/server/repositories/points';
import { runProtectedMutation } from '@/server/api-request-guard';

function getPreviousBusinessDate(date = new Date()) {
  const previous = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return formatBusinessDateInShanghai(previous);
}

export async function POST(request: Request) {
  try {
    const session = await requireActiveAccount();
    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'POST /api/user/points/checkin',
        actorType: 'user',
        actorId: session.user.id,
        rawBody: '',
        parsedBody: null,
      },
      async () => {
        const businessDate = formatBusinessDateInShanghai(new Date());
        const existing = await getTodayDailyCheckin(session.user.id, businessDate);

        if (existing) {
          const [latestActivity] = existing.rewardLedgerEntryId
            ? (await listRecentPointActivity(session.user.id, 10)).filter((entry) => entry.id === existing.rewardLedgerEntryId)
            : [];

          return NextResponse.json({
            ok: true,
            alreadyCheckedIn: true,
            checkin: {
              businessDate,
              checkedIn: true,
              rewardPoints: latestActivity?.amount ?? null,
              streakCount: existing.streakCount,
              checkedInAt: existing.createdAt instanceof Date ? existing.createdAt.toISOString() : existing.createdAt,
            },
          });
        }

        const previousCheckin = await getTodayDailyCheckin(session.user.id, getPreviousBusinessDate());
        const streakCount = previousCheckin ? previousCheckin.streakCount + 1 : 1;
        const rewardPoints = chooseDailyCheckinReward();
        const rewardResult = await grantCredits({
          userId: session.user.id,
          amount: rewardPoints,
          idempotencyKey: buildDailyCheckinKey(session.user.id, businessDate),
          reason: 'daily check-in',
          metadata: {
            businessDate,
            streakCount,
          },
        });

        const checkin = await createDailyCheckinRecord({
          userId: session.user.id,
          date: businessDate,
          streakCount,
          rewardLedgerEntryId: rewardResult.entryId,
        });

        return NextResponse.json({
          ok: true,
          alreadyCheckedIn: false,
          checkin: {
            businessDate,
            checkedIn: true,
            rewardPoints,
            streakCount: checkin?.streakCount ?? streakCount,
            checkedInAt: checkin?.createdAt instanceof Date ? checkin.createdAt.toISOString() : checkin?.createdAt ?? new Date().toISOString(),
          },
        });
      },
    );
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
