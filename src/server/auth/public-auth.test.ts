import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashUserPassword,
  verifyStoredUserPassword,
  type UserMetadataWithPassword,
} from './public-auth';

test('hashUserPassword returns deterministic sha256 hash', () => {
  const hash = hashUserPassword('User@123456');
  assert.equal(hash, hashUserPassword('User@123456'));
  assert.notEqual(hash, 'User@123456');
});

test('verifyStoredUserPassword rejects users without stored password hash', () => {
  const metadata: UserMetadataWithPassword = {};
  assert.equal(verifyStoredUserPassword('User@123456', metadata), false);
});

test('verifyStoredUserPassword matches stored password hash only for the right password', () => {
  const metadata: UserMetadataWithPassword = {
    passwordHash: hashUserPassword('User@123456'),
  };

  assert.equal(verifyStoredUserPassword('User@123456', metadata), true);
  assert.equal(verifyStoredUserPassword('wrong-password', metadata), false);
});
