import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { readJsonBody } from '@/server/api-request-guard';
import { grantCredits } from '@/server/billing/credits';
import { getServerCache } from '@/server/cache/server-cache';
import { consumeCheckinVerificationToken } from '@/server/points/checkin-challenge';
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

const dailyCheckinBodySchema = z.object({
  verificationToken: z.string().min(1, 'verificationToken is required.'),
});

export type DailyCheckinBody = z.infer<typeof dailyCheckinBodySchema>;

export function parseDailyCheckinBody(body: unknown): DailyCheckinBody {
  return dailyCheckinBodySchema.parse(body);
}

function getPreviousBusinessDate(date = new Date()) {
  const previous = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return formatBusinessDateInShanghai(previous);
}

export async function POST(request: Request) {
  try {
    const session = await requireActiveAccount();
    const parsed = await readJsonBody(request);
    const body = parseDailyCheckinBody(parsed.body);

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'POST /api/user/points/checkin',
        actorType: 'user',
        actorId: session.user.id,
        rawBody: parsed.rawBody,
        decryptedRawBody: parsed.decryptedRawBody,
        parsedBody: body,
      },
      async () => {
        const cache = getServerCache();
        const verified = await consumeCheckinVerificationToken({
          cache,
          userId: session.user.id,
          token: body.verificationToken,
        });
        if (!verified) {
          return NextResponse.json(
            {
              error: {
                code: 'checkin_verification_required',
                message: '请先完成签到验证。',
              },
            },
            { status: 400 },
          );
        }

        const businessDate = formatBusinessDateInShanghai(new Date());
        const lock = await cache.acquireLock(
          `daily-checkin-lock:${session.user.id}:${businessDate}`,
          10 * 1000,
        );
        if (!lock.acquired) {
          return NextResponse.json(
            {
              error: {
                code: 'checkin_request_processing',
                message: '签到请求处理中，请稍后重试。',
              },
            },
            { status: 409 },
          );
        }

        try {
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
        } finally {
          await lock.release();
          await cache.delete(`user-points-overview:${session.user.id}`);
        }
      },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'invalid_checkin_request',
            message: '签到请求格式不正确。',
          },
        },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
