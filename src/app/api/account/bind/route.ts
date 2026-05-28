import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  bindEmailIdentity,
  bindPhoneIdentity,
  bindProviderIdentity,
} from '@/server/auth/account-service';
import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';

const bindSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('email'),
    subject: z.email(),
    label: z.string().max(120).optional(),
  }),
  z.object({
    provider: z.literal('phone'),
    subject: z.string().min(6).max(32),
    label: z.string().max(120).optional(),
  }),
  z.object({
    provider: z.enum(['github', 'google', 'wechat']),
    subject: z.string().min(1).max(240),
    label: z.string().max(120).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export async function POST(request: Request) {
  try {
    const session = await requireActiveAccount();
    const body = bindSchema.parse(await request.json());

    const identity =
      body.provider === 'email'
        ? await bindEmailIdentity({
            userId: session.user.id,
            email: body.subject,
            label: body.label,
          })
        : body.provider === 'phone'
          ? await bindPhoneIdentity({
              userId: session.user.id,
              phone: body.subject,
              label: body.label,
            })
          : await bindProviderIdentity({
              userId: session.user.id,
              provider: body.provider,
              providerSubject: body.subject,
              label: body.label,
              metadata: body.metadata,
            });

    return NextResponse.json({
      ok: true,
      identity: {
        id: identity.id,
        provider: identity.provider,
        label: identity.label,
        isVerified: identity.isVerified,
        verifiedAt: identity.verifiedAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Binding request is invalid.',
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
