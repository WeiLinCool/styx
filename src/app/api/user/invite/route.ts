import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { buildInviteUrl } from '@/server/points/service';
import { getInviteSummary } from '@/server/repositories/points';

export async function GET(request: Request) {
  try {
    const session = await requireActiveAccount();
    const inviteSummary = await getInviteSummary(session.user.id);
    const origin = new URL(request.url).origin;

    return NextResponse.json({
      inviteSummary: {
        ...inviteSummary,
        inviteLink: buildInviteUrl(origin, inviteSummary.inviteCode),
      },
    });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
