import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { listAvailableVideoModelsForUser } from '@/server/repositories/ai-models';

export function parseVideoModelRequestUrl(_url: string) {
  return {};
}

export async function GET() {
  try {
    const session = await requireActiveAccount();
    const models = await listAvailableVideoModelsForUser(session.user.id);

    return NextResponse.json({ models });
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
