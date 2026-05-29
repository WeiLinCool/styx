import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { listAvailableChatModelsForUser } from '@/server/repositories/ai-models';

export async function GET() {
  try {
    const session = await requireActiveAccount();
    const models = await listAvailableChatModelsForUser(session.user.id);

    return NextResponse.json({ models });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
