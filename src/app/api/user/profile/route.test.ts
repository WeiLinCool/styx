import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRawRequestBodyHash,
  buildProtectionHeaders,
} from '@/server/request-security';
import { createUserApiClient } from '@/lib/user-api-client';
import { AccountDomainError } from '@/server/auth/account-types';
import { createProfileRouteHandler } from './route';

test('PUT updates displayName', async () => {
  const receivedInputs: Array<{
    userId: string;
    displayName?: string;
    avatarUrl?: string | null;
  }> = [];
  
  const PUT = createProfileRouteHandler(
    async (userId, input) => {
      receivedInputs.push({ userId, ...input });
      
      const now = new Date('2026-01-01T00:00:00.000Z');
      return {
        id: userId,
        displayName: input.displayName ?? 'Old Name',
        email: null,
        phone: '13800138000',
        avatarUrl: input.avatarUrl ?? null,
        accountState: 'active',
        activatedAt: now,
        suspendedAt: null,
        archivedAt: null,
        storageQuotaBytes: 0,
        storageUsedBytes: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
    },
    async () => ({
      user: {
        id: 'user-1',
      },
    }),
  );
  
  const requestBody = JSON.stringify({
    displayName: 'New Name',
  });
  const headers = buildProtectionHeaders({
    body: null,
    fingerprint: 'route-test-fingerprint',
  });
  headers.set('content-type', 'application/json');
  headers.set('Idempotency-Key', 'test-idempotency-key-1');
  headers.set('x-request-body-hash', buildRawRequestBodyHash(requestBody));
  
  const client = createUserApiClient({
    fetch: async () =>
      PUT(
        new Request('http://localhost/api/user/profile', {
          method: 'PUT',
          headers,
          body: requestBody,
        }),
      ),
    collectBrowserFingerprint: () => null,
  });
  const response = await client.request('/api/user/profile');
  
  const body = await response.json();
  
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.user.displayName, 'New Name');
  assert.equal(receivedInputs[0]?.userId, 'user-1');
  assert.equal(receivedInputs[0]?.displayName, 'New Name');
});

test('PUT updates avatarUrl with data URL', async () => {
  const receivedInputs: Array<{
    userId: string;
    displayName?: string;
    avatarUrl?: string | null;
  }> = [];
  
  const PUT = createProfileRouteHandler(
    async (userId, input) => {
      receivedInputs.push({ userId, ...input });
      
      const now = new Date('2026-01-01T00:00:00.000Z');
      return {
        id: userId,
        displayName: 'Test User',
        email: null,
        phone: '13800138000',
        avatarUrl: input.avatarUrl ?? null,
        accountState: 'active',
        activatedAt: now,
        suspendedAt: null,
        archivedAt: null,
        storageQuotaBytes: 0,
        storageUsedBytes: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
    },
    async () => ({
      user: {
        id: 'user-1',
      },
    }),
  );
  
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const requestBody = JSON.stringify({
    avatarUrl: dataUrl,
  });
  const headers = buildProtectionHeaders({
    body: null,
    fingerprint: 'route-test-fingerprint',
  });
  headers.set('content-type', 'application/json');
  headers.set('Idempotency-Key', 'test-idempotency-key-2');
  headers.set('x-request-body-hash', buildRawRequestBodyHash(requestBody));
  
  const response = await PUT(
    new Request('http://localhost/api/user/profile', {
      method: 'PUT',
      headers,
      body: requestBody,
    }),
  );
  const body = await response.json();
  
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.user.avatarUrl, dataUrl);
  assert.equal(receivedInputs[0]?.avatarUrl, dataUrl);
});

test('PUT updates avatarUrl with remote URL', async () => {
  const receivedInputs: Array<{
    userId: string;
    displayName?: string;
    avatarUrl?: string | null;
  }> = [];
  
  const PUT = createProfileRouteHandler(
    async (userId, input) => {
      receivedInputs.push({ userId, ...input });
      
      const now = new Date('2026-01-01T00:00:00.000Z');
      return {
        id: userId,
        displayName: 'Test User',
        email: null,
        phone: '13800138000',
        avatarUrl: input.avatarUrl ?? null,
        accountState: 'active',
        activatedAt: now,
        suspendedAt: null,
        archivedAt: null,
        storageQuotaBytes: 0,
        storageUsedBytes: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
    },
    async () => ({
      user: {
        id: 'user-1',
      },
    }),
  );
  
  const remoteUrl = 'https://example.com/avatar.png';
  const requestBody = JSON.stringify({
    avatarUrl: remoteUrl,
  });
  const headers = buildProtectionHeaders({
    body: null,
    fingerprint: 'route-test-fingerprint',
  });
  headers.set('content-type', 'application/json');
  headers.set('Idempotency-Key', 'test-idempotency-key-3');
  headers.set('x-request-body-hash', buildRawRequestBodyHash(requestBody));
  
  const response = await PUT(
    new Request('http://localhost/api/user/profile', {
      method: 'PUT',
      headers,
      body: requestBody,
    }),
  );
  const body = await response.json();
  
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.user.avatarUrl, remoteUrl);
  assert.equal(receivedInputs[0]?.avatarUrl, remoteUrl);
});

test('PUT allows setting avatarUrl to null', async () => {
  const receivedInputs: Array<{
    userId: string;
    displayName?: string;
    avatarUrl?: string | null;
  }> = [];
  
  const PUT = createProfileRouteHandler(
    async (userId, input) => {
      receivedInputs.push({ userId, ...input });
      
      const now = new Date('2026-01-01T00:00:00.000Z');
      return {
        id: userId,
        displayName: 'Test User',
        email: null,
        phone: '13800138000',
        avatarUrl: input.avatarUrl ?? null,
        accountState: 'active',
        activatedAt: now,
        suspendedAt: null,
        archivedAt: null,
        storageQuotaBytes: 0,
        storageUsedBytes: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
    },
    async () => ({
      user: {
        id: 'user-1',
      },
    }),
  );
  
  const requestBody = JSON.stringify({
    avatarUrl: null,
  });
  const headers = buildProtectionHeaders({
    body: null,
    fingerprint: 'route-test-fingerprint',
  });
  headers.set('content-type', 'application/json');
  headers.set('Idempotency-Key', 'test-idempotency-key-4');
  headers.set('x-request-body-hash', buildRawRequestBodyHash(requestBody));
  
  const response = await PUT(
    new Request('http://localhost/api/user/profile', {
      method: 'PUT',
      headers,
      body: requestBody,
    }),
  );
  const body = await response.json();
  
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.user.avatarUrl, null);
  assert.equal(receivedInputs[0]?.avatarUrl, null);
});

test('PUT rejects invalid avatarUrl', async () => {
  const PUT = createProfileRouteHandler(
    async () => {
      throw new Error('Should not be called');
    },
    async () => ({
      user: {
        id: 'user-1',
      },
    }),
  );
  
  const requestBody = JSON.stringify({
    avatarUrl: 'invalid-url',
  });
  const headers = buildProtectionHeaders({
    body: null,
    fingerprint: 'route-test-fingerprint',
  });
  headers.set('content-type', 'application/json');
  headers.set('Idempotency-Key', 'test-idempotency-key-5');
  headers.set('x-request-body-hash', buildRawRequestBodyHash(requestBody));
  
  const response = await PUT(
    new Request('http://localhost/api/user/profile', {
      method: 'PUT',
      headers,
      body: requestBody,
    }),
  );
  const body = await response.json();
  
  assert.equal(response.status, 400);
  assert.equal(body.error?.code, 'invalid_request');
});

test('PUT returns 401 for unauthenticated user', async () => {
  const PUT = createProfileRouteHandler(
    async () => {
      throw new Error('Should not be called');
    },
    async () => {
      throw new AccountDomainError('session_required', '需要登录后才能继续。', 401);
    },
  );
  
  const requestBody = JSON.stringify({
    displayName: 'New Name',
  });
  const headers = buildProtectionHeaders({
    body: null,
    fingerprint: 'route-test-fingerprint',
  });
  headers.set('content-type', 'application/json');
  headers.set('Idempotency-Key', 'test-idempotency-key-6');
  headers.set('x-request-body-hash', buildRawRequestBodyHash(requestBody));
  
  const response = await PUT(
    new Request('http://localhost/api/user/profile', {
      method: 'PUT',
      headers,
      body: requestBody,
    }),
  );
  const body = await response.json();
  
  assert.equal(response.status, 401);
  assert.equal(body.error?.code, 'session_required');
});

test('PUT returns 400 if no fields provided', async () => {
  const PUT = createProfileRouteHandler(
    async () => {
      throw new Error('Should not be called');
    },
    async () => ({
      user: {
        id: 'user-1',
      },
    }),
  );
  
  const requestBody = JSON.stringify({});
  const headers = buildProtectionHeaders({
    body: null,
    fingerprint: 'route-test-fingerprint',
  });
  headers.set('content-type', 'application/json');
  headers.set('Idempotency-Key', 'test-idempotency-key-7');
  headers.set('x-request-body-hash', buildRawRequestBodyHash(requestBody));
  
  const response = await PUT(
    new Request('http://localhost/api/user/profile', {
      method: 'PUT',
      headers,
      body: requestBody,
    }),
  );
  const body = await response.json();
  
  assert.equal(response.status, 400);
  assert.equal(body.error?.code, 'invalid_request');
  assert.match(body.error?.message ?? '', /至少需要提供displayName或avatarUrl字段/);
});
