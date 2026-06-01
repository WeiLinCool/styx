import { NextResponse } from 'next/server';

import { encryptResponseBody } from '@/lib/request-encryption';

export async function createEncryptedJsonResponse(
  body: unknown,
  init?: ResponseInit,
) {
  const envelope = await encryptResponseBody(body);
  return NextResponse.json(envelope, init);
}
