import assert from 'node:assert/strict';
import test from 'node:test';
import { ZodError } from 'zod';

import { buildStableRequestBodyHash } from '@/server/request-security';

import {
  createAdminVideoGenerationConfigRouteHandlers,
  parseAdminVideoGenerationConfigBody,
} from './route';

const validBody = {
  styles: [
    {
      code: 'stone',
      name: '石头印画',
      prompt: '石头印画动态短片',
      enabled: true,
      sortOrder: 1,
    },
  ],
};

test('parseAdminVideoGenerationConfigBody accepts style preset list', async () => {
  const body = await parseAdminVideoGenerationConfigBody({
    json: async () => validBody,
  });

  assert.deepEqual(body, validBody);
});

test('parseAdminVideoGenerationConfigBody rejects blank style code', async () => {
  await assert.rejects(
    () =>
      parseAdminVideoGenerationConfigBody({
        json: async () => ({
          styles: [{ ...validBody.styles[0], code: '   ' }],
        }),
      }),
    ZodError,
  );
});

test('parseAdminVideoGenerationConfigBody rejects blank style name', async () => {
  await assert.rejects(
    () =>
      parseAdminVideoGenerationConfigBody({
        json: async () => ({
          styles: [{ ...validBody.styles[0], name: '' }],
        }),
      }),
    ZodError,
  );
});

test('parseAdminVideoGenerationConfigBody rejects blank style prompt', async () => {
  await assert.rejects(
    () =>
      parseAdminVideoGenerationConfigBody({
        json: async () => ({
          styles: [{ ...validBody.styles[0], prompt: '  ' }],
        }),
      }),
    ZodError,
  );
});

function createMutationRequest(body: unknown) {
  const rawBody = JSON.stringify(body);
  const headers = new Headers({
    'content-type': 'application/json',
    'Idempotency-Key': `test-${crypto.randomUUID()}`,
    'x-request-id': crypto.randomUUID(),
    'x-request-nonce': crypto.randomUUID(),
    'x-client-timestamp': String(Date.now()),
    'x-request-body-hash': buildStableRequestBodyHash(body),
  });

  return new Request('https://example.com/api/admin/video-generation-config', {
    method: 'PUT',
    headers,
    body: rawBody,
  });
}

test('GET /api/admin/video-generation-config requires admin and returns styles', async () => {
  let requiredAdmin = false;
  let listed = false;
  const handlers = createAdminVideoGenerationConfigRouteHandlers({
    requireAdminSession: async () => {
      requiredAdmin = true;
      return { user: { id: 'admin-1' } };
    },
    listStyles: async () => {
      listed = true;
      return [
        {
          id: 'style-1',
          code: 'stone',
          name: '石头印画',
          prompt: '石头印画动态短片',
          enabled: true,
          sortOrder: 1,
        },
      ];
    },
    upsertStyles: async () => {
      throw new Error('unexpected upsert');
    },
  });

  const response = await handlers.GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(requiredAdmin, true);
  assert.equal(listed, true);
  assert.deepEqual(body.styles.map((style: { code: string }) => style.code), ['stone']);
});

test('PUT /api/admin/video-generation-config batch upserts validated styles', async () => {
  let upserted: unknown = null;
  const handlers = createAdminVideoGenerationConfigRouteHandlers({
    requireAdminSession: async () => ({ user: { id: 'admin-1' } }),
    listStyles: async () => [],
    upsertStyles: async (styles) => {
      upserted = styles;
      return [
        {
          id: 'style-1',
          code: 'stone',
          name: '石头印画',
          prompt: '石头印画动态短片',
          enabled: true,
          sortOrder: 1,
        },
      ];
    },
  });

  const response = await handlers.PUT(createMutationRequest(validBody));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(upserted, validBody.styles);
  assert.equal(body.semantics, 'upsert_only');
  assert.deepEqual(body.styles.map((style: { code: string }) => style.code), ['stone']);
});

test('PUT /api/admin/video-generation-config rejects invalid live request payload', async () => {
  let upsertCalled = false;
  const handlers = createAdminVideoGenerationConfigRouteHandlers({
    requireAdminSession: async () => ({ user: { id: 'admin-1' } }),
    listStyles: async () => [],
    upsertStyles: async () => {
      upsertCalled = true;
      return [];
    },
  });

  const response = await handlers.PUT(
    createMutationRequest({
      styles: [{ ...validBody.styles[0], sortOrder: null }],
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'validation_error');
  assert.equal(upsertCalled, false);
});
