import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdminSessionToken,
  getAdminWhitelistConfig,
  hashAdminPassword,
  parseAdminAccountsConfig,
  readAdminSessionToken,
  verifyAdminPassword,
} from './admin-auth';

test('parseAdminAccountsConfig returns configured admin accounts', () => {
  const accounts = parseAdminAccountsConfig(
    JSON.stringify([
      {
        userId: '00000000-0000-4000-8000-000000000001',
        username: 'root',
        passwordHash: hashAdminPassword('secret-123'),
        phone: '13800000000',
      },
    ]),
  );

  assert.equal(accounts.length, 1);
  assert.equal(accounts[0]?.username, 'root');
  assert.equal(accounts[0]?.phone, '13800000000');
});

test('verifyAdminPassword matches hashed password inputs', () => {
  const passwordHash = hashAdminPassword('secret-123');

  assert.equal(verifyAdminPassword('secret-123', passwordHash), true);
  assert.equal(verifyAdminPassword('wrong', passwordHash), false);
});

test('admin session token round-trips with signing secret', () => {
  const token = createAdminSessionToken(
    {
      userId: '00000000-0000-4000-8000-000000000001',
      username: 'root',
      authMode: 'password_whitelist',
      expiresAt: new Date('2099-01-01T00:00:00.000Z').toISOString(),
    },
    'secret',
  );

  const payload = readAdminSessionToken(token, 'secret');

  assert.equal(payload?.username, 'root');
  assert.equal(payload?.authMode, 'password_whitelist');
});

test('getAdminWhitelistConfig resolves enabled accounts from admin config', () => {
  const config = getAdminWhitelistConfig([
    {
      userId: '00000000-0000-4000-8000-000000000001',
      username: 'root',
      passwordHash: hashAdminPassword('secret-123'),
      phone: '13800000000',
      allowWhitelistBypass: true,
    },
    {
      userId: '00000000-0000-4000-8000-000000000002',
      username: 'ops',
      passwordHash: hashAdminPassword('secret-456'),
      phone: '13900000000',
      allowWhitelistBypass: false,
    },
  ]);

  assert.equal(config.enabled, true);
  assert.deepEqual(config.accountIds, ['00000000-0000-4000-8000-000000000001']);
});
