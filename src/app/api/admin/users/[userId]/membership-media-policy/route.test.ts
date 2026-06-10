import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminMembershipMediaPolicyRouteHandlers } from './route';

test('POST /api/admin/users/[userId]/membership-media-policy resyncs quota and entitlement version', async () => {
  const auditCalls: Array<Record<string, unknown>> = [];
  const resyncCalls: string[] = [];

  const handlers = createAdminMembershipMediaPolicyRouteHandlers({
    requireAdminSession: async () => ({
      authenticated: true,
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        phone: null,
        displayName: 'Admin',
        avatarUrl: null,
        accountState: 'active',
        activatedAt: new Date('2026-06-01T00:00:00.000Z'),
        suspendedAt: null,
        archivedAt: null,
        metadata: {},
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        adminRoles: ['admin'],
        storageUsedBytes: 0,
        storageQuotaBytes: 0,
      },
      sessionId: null,
      source: 'development',
    }),
    readBody: async () => ({
      rawBody: '{}',
      decryptedRawBody: '{}',
      body: {},
    }),
    resyncMediaPolicy: async (userId) => {
      resyncCalls.push(userId);
      return {
        quota: {
          storageQuotaBytes: 5 * 1024 * 1024 * 1024,
          storageUsedBytes: 1024,
        },
        policy: {
          storageQuotaBytes: 5 * 1024 * 1024 * 1024,
          allowUserUpload: true,
          allowPublicSharing: false,
        },
        sourcePlanCode: 'pro-monthly',
        sourceVersionId: 'version-pro-v2',
        sourceVersionNumber: 2,
        updatedEntitlementCount: 1,
      };
    },
    recordAudit: async (input) => {
      auditCalls.push(input as Record<string, unknown>);
      return {} as never;
    },
  });

  const response = await handlers.POST(new Request('http://localhost/api/admin/users/id/membership-media-policy', {
    method: 'POST',
    body: '{}',
    headers: {
      'content-type': 'application/json',
    },
  }), {
    params: Promise.resolve({
      userId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(resyncCalls, ['5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4']);

  const payload = await response.json();
  assert.deepEqual(payload, {
    ok: true,
    quota: {
      storageQuotaBytes: 5 * 1024 * 1024 * 1024,
      storageUsedBytes: 1024,
    },
  });

  assert.equal(auditCalls.length, 1);
  assert.deepEqual(auditCalls[0], {
    actorId: 'admin-1',
    targetId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
    type: 'user.membership_media_quota_resynced',
    entityType: 'user',
    entityId: '5b8dc749-b1f8-4a64-9bb9-c8aa4ad1d5f4',
    metadata: {
      sourcePlanCode: 'pro-monthly',
      sourceVersionId: 'version-pro-v2',
      sourceVersionNumber: 2,
      storageQuotaBytes: 5 * 1024 * 1024 * 1024,
      allowUserUpload: true,
      allowPublicSharing: false,
      updatedEntitlementCount: 1,
    },
  });
});
