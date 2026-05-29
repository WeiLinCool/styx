import { createHash, timingSafeEqual } from 'node:crypto';

export type UserMetadataWithPassword = {
  passwordHash?: string;
  [key: string]: unknown;
};

export function hashUserPassword(password: string) {
  return createHash('sha256').update(password).digest('hex');
}

export function verifyStoredUserPassword(
  password: string,
  metadata: UserMetadataWithPassword | null | undefined,
) {
  const passwordHash = metadata?.passwordHash;
  if (!passwordHash) {
    return false;
  }

  return timingSafeEqual(Buffer.from(hashUserPassword(password)), Buffer.from(passwordHash));
}
