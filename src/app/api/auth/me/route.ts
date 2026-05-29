import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { resolveSession } from '@/server/auth/session';

export async function GET() {
  try {
    const session = await resolveSession();

    return NextResponse.json({
      authenticated: session.authenticated,
      user: session.authenticated
        ? {
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
            points: 0,
          }
        : null,
    });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
