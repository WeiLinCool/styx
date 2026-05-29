import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AccountDomainError,
  assertActivationTokenUsable,
  assertIdentityCanBind,
  hashSecret,
} from './account-types';

test('hashSecret returns a stable sha256 hash without exposing the token', () => {
  const token = 'activation-token-123';

  const hash = hashSecret(token);

  assert.equal(hash, hashSecret(token));
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
});

test('assertActivationTokenUsable rejects expired and consumed tokens', () => {
  const now = new Date('2026-05-29T00:00:00.000Z');

  assert.throws(
    () =>
      assertActivationTokenUsable(
        {
          consumedAt: null,
          expiresAt: new Date('2026-05-28T23:59:59.000Z'),
        },
        now,
      ),
    (error) =>
      error instanceof AccountDomainError &&
      error.code === 'activation_token_expired',
  );

  assert.throws(
    () =>
      assertActivationTokenUsable(
        {
          consumedAt: new Date('2026-05-28T00:00:00.000Z'),
          expiresAt: new Date('2026-05-30T00:00:00.000Z'),
        },
        now,
      ),
    (error) =>
      error instanceof AccountDomainError &&
      error.code === 'activation_token_consumed',
  );
});

test('assertIdentityCanBind rejects verified identity owned by another user', () => {
  assert.throws(
    () =>
      assertIdentityCanBind({
        requestedUserId: 'user_1',
        existingIdentity: {
          userId: 'user_2',
          isVerified: true,
        },
      }),
    (error) =>
      error instanceof AccountDomainError &&
      error.code === 'identity_conflict',
  );
});
