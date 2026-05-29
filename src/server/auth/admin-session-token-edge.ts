function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

async function signPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  );
  const bytes = Array.from(new Uint8Array(signature))
    .map((byte) => String.fromCharCode(byte))
    .join('');
  return encodeBase64Url(bytes);
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

export type AdminSessionPayload = {
  userId: string;
  username: string;
  expiresAt: string;
  authMode: 'password_whitelist';
};

export async function readAdminSessionTokenEdge(token: string, secret: string) {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await signPayload(encodedPayload, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as AdminSessionPayload;
  if (new Date(payload.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return payload;
}
