import { NextResponse } from 'next/server';
import { z } from 'zod';

import { activateAccountWithToken } from '@/server/auth/account-service';
import { accountErrorToResponse } from '@/server/auth/account-types';

const activateSchema = z.object({
  token: z.string().min(16),
});

export async function POST(request: Request) {
  try {
    const body = activateSchema.parse(await request.json());
    const user = await activateAccountWithToken({ token: body.token });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        accountState: user.accountState,
        activatedAt: user.activatedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Activation request is invalid.',
            issues: error.issues,
          },
        },
        { status: 400 },
      );
    }

    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
