import { NextResponse } from 'next/server';

import { readJsonBody, runProtectedMutation } from '@/server/api-request-guard';
import { createHumanVerificationToken } from '@/server/points/checkin-challenge';
import { accountErrorToResponse } from '@/server/auth/account-types';

export async function POST(request: Request) {
  try {
    const parsed = await readJsonBody(request);
    const actorId = readActorId(parsed.body);

    return runProtectedMutation(
      {
        request,
        routeKind: 'user-mutation',
        operation: 'POST /api/auth/human-verification',
        actorType: 'anonymous',
        actorId,
        rawBody: parsed.rawBody,
        decryptedRawBody: parsed.decryptedRawBody,
        parsedBody: parsed.body,
      },
      async () => {
        const token = await createHumanVerificationToken({
          userId: actorId,
        });
        return NextResponse.json({ ok: true, verificationToken: token });
      },
    );
  } catch (error) {
    const response = accountErrorToResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function readActorId(body: unknown) {
  if (
    typeof body === 'object' &&
    body !== null &&
    'phone' in body &&
    typeof body.phone === 'string' &&
    body.phone.trim()
  ) {
    return body.phone.trim();
  }

  return 'anonymous';
}
