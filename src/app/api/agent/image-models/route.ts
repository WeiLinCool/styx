import { NextResponse } from 'next/server';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import {
  listAvailableImageModelsForUser,
  type ImageModelMode,
} from '@/server/repositories/ai-models';

export function parseImageModelMode(value: string | null): ImageModelMode {
  if (value === 'generate' || value === 'edit' || value === 'upscale') {
    return value;
  }

  throw new Error('Invalid image model mode.');
}

export async function GET(request: Request) {
  try {
    const session = await requireActiveAccount();
    const mode = parseImageModelMode(new URL(request.url).searchParams.get('mode'));
    const models = await listAvailableImageModelsForUser(session.user.id, mode);

    return NextResponse.json({ models });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid image model mode.') {
      return NextResponse.json(
        { error: { code: 'invalid_request', message: error.message } },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
