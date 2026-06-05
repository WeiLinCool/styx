import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticateExistingUserWithPassword,
  setExistingUserPasswordAuthDepsForTesting,
  type ExistingUserPasswordAuthDeps,
} from './account-service';
import { AccountDomainError, type UserRecord } from './account-types';
import { hashUserPassword } from './public-auth';

function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: overrides.id ?? 'user_1',
    email: overrides.email ?? 'user@example.com',
    phone: overrides.phone ?? '13800138000',
    displayName: overrides.displayName ?? 'Test User',
    accountState: overrides.accountState ?? 'active',
    activatedAt: overrides.activatedAt ?? new Date('2026-06-01T00:00:00.000Z'),
    suspendedAt: overrides.suspendedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
    metadata: overrides.metadata ?? {
      passwordHash: hashUserPassword('User@123456'),
    },
    createdAt: overrides.createdAt ?? new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-06-01T00:00:00.000Z'),
  };
}

function createDeps(users: {
  byEmail?: UserRecord | null;
  byPhone?: UserRecord | null;
}): ExistingUserPasswordAuthDeps & {
  emailLookups: string[];
  phoneLookups: string[];
  passwordChecks: Array<{
    password: string;
    metadata: Record<string, unknown> | null | undefined;
  }>;
} {
  const emailLookups: string[] = [];
  const phoneLookups: string[] = [];
  const passwordChecks: Array<{
    password: string;
    metadata: Record<string, unknown> | null | undefined;
  }> = [];

  return {
    emailLookups,
    phoneLookups,
    passwordChecks,
    async getUserByEmail(email) {
      emailLookups.push(email);
      return users.byEmail ?? null;
    },
    async getUserByPhone(phone) {
      phoneLookups.push(phone);
      return users.byPhone ?? null;
    },
    verifyPassword(password, metadata) {
      passwordChecks.push({ password, metadata });
      return metadata?.passwordHash === hashUserPassword(password);
    },
  };
}

test('authenticateExistingUserWithPassword returns existing user for phone and valid password', async () => {
  const user = createUser({ id: 'phone_user' });
  const deps = createDeps({ byPhone: user });

  const result = await authenticateExistingUserWithPassword(
    { login: ' 13800138000 ', password: 'User@123456' },
    deps,
  );

  assert.equal(result, user);
  assert.deepEqual(deps.phoneLookups, ['13800138000']);
  assert.deepEqual(deps.emailLookups, []);
  assert.equal(deps.passwordChecks.length, 1);
});

test('authenticateExistingUserWithPassword returns existing user for email and valid password', async () => {
  const user = createUser({ id: 'email_user', email: 'user@example.com' });
  const deps = createDeps({ byEmail: user });

  const result = await authenticateExistingUserWithPassword(
    { login: ' User@Example.COM ', password: 'User@123456' },
    deps,
  );

  assert.equal(result, user);
  assert.deepEqual(deps.emailLookups, ['user@example.com']);
  assert.deepEqual(deps.phoneLookups, []);
  assert.equal(deps.passwordChecks.length, 1);
});

test('authenticateExistingUserWithPassword rejects existing user without password setup', async () => {
  const user = createUser({ metadata: {} });
  const deps = createDeps({ byPhone: user });

  await assert.rejects(
    () =>
      authenticateExistingUserWithPassword(
        { login: '13800138000', password: 'User@123456' },
        deps,
      ),
    (error) =>
      error instanceof AccountDomainError &&
      error.code === 'password_setup_required' &&
      error.status === 403,
  );

  assert.equal(deps.passwordChecks.length, 0);
});

test('authenticateExistingUserWithPassword rejects wrong password', async () => {
  const user = createUser();
  const deps = createDeps({ byPhone: user });

  await assert.rejects(
    () =>
      authenticateExistingUserWithPassword(
        { login: '13800138000', password: 'wrong-password' },
        deps,
      ),
    (error) => {
      assert.equal(error instanceof AccountDomainError, true);
      assert.equal((error as AccountDomainError).code, 'session_required');
      assert.equal((error as AccountDomainError).status, 401);
      assert.equal((error as AccountDomainError).message, '账号或密码错误。');
      return true;
    },
  );
});

test('authenticateExistingUserWithPassword converts malformed password hash to auth failure', async () => {
  const user = createUser({ metadata: { passwordHash: 'malformed-hash' } });
  const restore = setExistingUserPasswordAuthDepsForTesting({
    async getUserByEmail() {
      return null;
    },
    async getUserByPhone() {
      return user;
    },
  });

  try {
    await assert.rejects(
      () =>
        authenticateExistingUserWithPassword({
          login: '13800138000',
          password: 'User@123456',
        }),
      (error) => {
        assert.equal(error instanceof AccountDomainError, true);
        assert.equal((error as AccountDomainError).code, 'session_required');
        assert.equal((error as AccountDomainError).status, 401);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('authenticateExistingUserWithPassword rejects missing user without registering or creating a session', async () => {
  const deps = createDeps({ byPhone: null });

  await assert.rejects(
    () =>
      authenticateExistingUserWithPassword(
        { login: '13800138000', password: 'User@123456' },
        deps,
      ),
    (error) =>
      error instanceof AccountDomainError &&
      error.code === 'session_required' &&
      error.status === 401,
  );

  assert.deepEqual(deps.phoneLookups, ['13800138000']);
  assert.deepEqual(deps.emailLookups, []);
  assert.equal(deps.passwordChecks.length, 0);
});
