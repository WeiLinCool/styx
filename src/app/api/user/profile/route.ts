import { NextResponse } from 'next/server';
import { z } from 'zod';

import { accountErrorToResponse } from '@/server/auth/account-types';
import { requireActiveAccount } from '@/server/auth/guards';
import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { updateUserProfile } from '@/server/repositories/users';

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().or(z.string().startsWith('data:')).nullable().optional(),
});

type UpdateUserProfileInput = Parameters<typeof updateUserProfile>[1];
type UpdateUserProfileResult = Awaited<ReturnType<typeof updateUserProfile>>;

export function createProfileRouteHandler(
  implementation: (userId: string, input: UpdateUserProfileInput) => Promise<UpdateUserProfileResult>,
  requireSession: () => Promise<{ user: { id: string } }> = requireActiveAccount,
) {
  return async function PUT(request: Request) {
    try {
      const session = await requireSession();
      
      const { rawBody, decryptedRawBody, body: parsedBody } = await readJsonBody(request);
      const validated = updateProfileSchema.parse(parsedBody);
      
      // 至少需要一个字段
      if (!validated.displayName && validated.avatarUrl === undefined) {
        return NextResponse.json(
          { error: { code: 'invalid_request', message: '至少需要提供displayName或avatarUrl字段。' } },
          { status: 400 }
        );
      }
      
      return await runProtectedMutation(
        {
          request,
          routeKind: 'user-mutation',
          operation: 'PUT /api/user/profile',
          actorType: 'user',
          actorId: session.user.id,
          rawBody,
          decryptedRawBody,
          parsedBody: validated,
        },
        async () => {
          const updatedUser = await implementation(session.user.id, validated);
          
          return NextResponse.json({
            success: true,
            user: {
              id: updatedUser.id,
              displayName: updatedUser.displayName,
              avatarUrl: updatedUser.avatarUrl,
              email: updatedUser.email,
              phone: updatedUser.phone,
            },
          });
        },
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: { code: 'invalid_request', message: error.issues[0]?.message ?? '输入参数无效。' } },
          { status: 400 }
        );
      }
      
      const response = accountErrorToResponse(error);
      return NextResponse.json(response.body, { status: response.status });
    }
  };
}

export const PUT = createProfileRouteHandler(updateUserProfile);