import { createHmac } from 'node:crypto';

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

export type SignedAdminPayload = {
  userId: string;
  username: string;
  expiresAt: string;
};

export type AdminSessionPayload = SignedAdminPayload & {
  authMode: 'password_whitelist';
};

export function createAdminSessionToken(payload: AdminSessionPayload, secret: string) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function readAdminSessionToken(token: string, secret: string): AdminSessionPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as AdminSessionPayload;
  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return payload;
}
