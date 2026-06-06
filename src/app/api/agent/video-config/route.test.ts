import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountDomainError } from '@/server/auth/account-types';
import type { ActiveUserEntitlement } from '@/server/ai/model-entitlements';
import type { VideoModelOption } from '@/features/public/agent-runtime-client';
import type { VideoPlanConfig, VideoStylePreset } from '@/server/video/video-generation-policy';
import { createAgentVideoConfigRouteHandlers } from './route';

const memberEntitlement: ActiveUserEntitlement = {
  planCode: 'pro-monthly',
  planVersionId: 'version-1',
  benefitCode: null,
  source: 'membership',
  startsAt: '2026-06-01T00:00:00.000Z',
  expiresAt: null,
};

const styles: VideoStylePreset[] = [
  {
    id: 'style-1',
    code: 'stone',
    name: 'Stone Print',
    prompt: 'stone print video prompt',
    enabled: true,
    sortOrder: 2,
  },
  {
    id: 'style-2',
    code: 'ink',
    name: 'Ink',
    prompt: 'ink video prompt',
    enabled: true,
    sortOrder: 1,
  },
];

const planConfig: VideoPlanConfig = {
  enabled: true,
  allowedDurations: [5, 10],
  allowedResolutions: ['720p', '1080p'],
  defaultDuration: 5,
  defaultResolution: '720p',
};

const videoModels: VideoModelOption[] = [
  {
    id: 'model-video',
    code: 'doubao-seedance',
    name: 'Doubao Seedance',
    providerName: 'Doubao',
    isDefault: true,
    entitlementLabel: 'Pro',
    pricingSummary: '3 credits minimum',
  },
];

function createHandlers(overrides: Partial<Parameters<typeof createAgentVideoConfigRouteHandlers>[0]> = {}) {
  return createAgentVideoConfigRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    listEntitlements: async () => [],
    resolvePlanVersion: async () => null,
    getVideoPlanConfigByVersionId: async () => null,
    listStyles: async () => styles,
    listVideoModels: async () => videoModels,
    ...overrides,
  });
}

test('GET /api/agent/video-config returns disabled upgrade response for free users', async () => {
  const handlers = createHandlers();

  const response = await handlers.GET();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.enabled, false);
  assert.equal(payload.upgradeRequired, true);
  assert.deepEqual(payload.styles, []);
  assert.deepEqual(payload.durations, []);
  assert.deepEqual(payload.resolutions, []);
  assert.deepEqual(payload.models, []);
  assert.deepEqual(payload.defaults, {
    styleCode: null,
    durationSeconds: null,
    resolution: null,
  });
});

test('GET /api/agent/video-config returns resolved member config and video models', async () => {
  const handlers = createHandlers({
    listEntitlements: async () => [memberEntitlement],
    getVideoPlanConfigByVersionId: async (versionId) =>
      versionId === 'version-1' ? planConfig : null,
  });

  const response = await handlers.GET();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.enabled, true);
  assert.equal(payload.upgradeRequired, false);
  assert.deepEqual(
    payload.styles.map((style: { code: string }) => style.code),
    ['ink', 'stone'],
  );
  assert.deepEqual(payload.durations, [5, 10]);
  assert.deepEqual(payload.resolutions, [
    { value: '720p', label: '720P' },
    { value: '1080p', label: '1080P' },
  ]);
  assert.deepEqual(payload.defaults, {
    styleCode: 'ink',
    durationSeconds: 5,
    resolution: '720p',
  });
  assert.deepEqual(payload.models, videoModels);
});

test('GET /api/agent/video-config disables member access when video plan config is missing', async () => {
  const handlers = createHandlers({
    listEntitlements: async () => [memberEntitlement],
    getVideoPlanConfigByVersionId: async () => null,
  });

  const response = await handlers.GET();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.enabled, false);
  assert.equal(payload.upgradeRequired, false);
  assert.match(payload.message, /not configured/i);
  assert.deepEqual(payload.durations, []);
  assert.deepEqual(payload.resolutions, []);
  assert.deepEqual(payload.models, []);
});

test('GET /api/agent/video-config maps account errors through route response style', async () => {
  const handlers = createHandlers({
    requireSession: async () => {
      throw new AccountDomainError('session_required', '需要登录后才能继续。', 401);
    },
  });

  const response = await handlers.GET();
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, {
    error: {
      code: 'session_required',
      message: '需要登录后才能继续。',
    },
  });
});
