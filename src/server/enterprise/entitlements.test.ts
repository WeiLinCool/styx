import assert from 'node:assert/strict';
import test from 'node:test';

import type { UserRecord } from '@/server/auth/account-types';
import type { PublicChatModelDto } from '@/server/repositories/ai-models';

import { resolveEnterpriseEntitlements } from './entitlements';
import { toEnterpriseUserInfo } from './userinfo';

const now = new Date('2026-06-01T12:00:00.000Z');

function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: overrides.id ?? 'user-1',
    email: 'email' in overrides ? (overrides.email ?? null) : 'alice@example.com',
    phone: 'phone' in overrides ? (overrides.phone ?? null) : '13800138000',
    displayName: overrides.displayName ?? 'Alice Example',
    accountState: overrides.accountState ?? 'active',
    activatedAt: overrides.activatedAt ?? now,
    suspendedAt: overrides.suspendedAt ?? null,
    archivedAt: overrides.archivedAt ?? null,
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

function createModel(id = 'gpt-4o-mini'): PublicChatModelDto {
  return {
    id,
    code: id,
    name: id,
    providerName: 'Enterprise',
    isDefault: id === 'gpt-4o-mini',
    entitlementLabel: 'Enterprise',
    pricingSummary: 'Included',
  };
}

test('toEnterpriseUserInfo maps stable identity claims from user account fields', () => {
  const userInfo = toEnterpriseUserInfo(createUser());

  assert.deepEqual(userInfo, {
    sub: 'user-1',
    email: 'alice@example.com',
    name: 'Alice Example',
    preferred_username: 'alice@example.com',
  });
});

test('toEnterpriseUserInfo falls back from email to phone and user id', () => {
  assert.equal(
    toEnterpriseUserInfo(createUser({ email: null, phone: '13900139000' })).preferred_username,
    '13900139000',
  );
  assert.equal(
    toEnterpriseUserInfo(createUser({ email: null, phone: null })).preferred_username,
    'user-1',
  );
});

test('resolveEnterpriseEntitlements grants models proxy when chat models are available', async () => {
  const result = await resolveEnterpriseEntitlements('user-1', {
    listAvailableChatModelsForUser: async (userId) => {
      assert.equal(userId, 'user-1');
      return [createModel()];
    },
  });

  assert.deepEqual(result, {
    plan: 'enterprise',
    entitlements: ['models:proxy'],
  });
});

test('resolveEnterpriseEntitlements omits models proxy when no chat models are available', async () => {
  const result = await resolveEnterpriseEntitlements('user-1', {
    listAvailableChatModelsForUser: async () => [],
  });

  assert.deepEqual(result, {
    plan: 'enterprise-limited',
    entitlements: [],
  });
});
