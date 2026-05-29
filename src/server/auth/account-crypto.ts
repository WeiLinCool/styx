import { createHash, randomBytes } from 'node:crypto';

export function hashSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

export function createOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}
