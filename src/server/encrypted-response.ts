import { NextResponse } from 'next/server';

import { encryptResponseBody } from '@/lib/request-encryption';
import { readConfiguredTransportSecurityMode } from './request-security';

export async function createJsonResponse(body: unknown, init?: ResponseInit) {
  if (readConfiguredTransportSecurityMode() === 'insecure') {
    return NextResponse.json(body, init);
  }

  return createEncryptedJsonResponse(body, init);
}

export async function createEncryptedJsonResponse(
  body: unknown,
  init?: ResponseInit,
) {
  const envelope = await encryptResponseBody(body);
  return NextResponse.json(envelope, init);
}
