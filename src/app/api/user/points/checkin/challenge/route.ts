import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { runProtectedMutation } from '@/server/api-request-guard';
import { createHumanVerificationToken } from '@/server/points/checkin-challenge';

export async function PUT(request: Request) {
  try {
    const session = await requireActiveAccount();

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'PUT /api/user/points/checkin/challenge',
        actorType: 'user',
        actorId: session.user.id,
        rawBody: '',
        parsedBody: null,
      },
      async () => {
        const token = await createHumanVerificationToken({
          userId: session.user.id,
        });
        return NextResponse.json({ ok: true, verificationToken: token });
      },
    );
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
