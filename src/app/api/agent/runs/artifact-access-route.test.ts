import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentRunDetailDto } from '@/server/agent/types';
import {
  createGeneratedRunArtifactAccessRouteHandlers,
  parseArtifactAccessDisposition,
} from './[runId]/artifacts/[artifactId]/access/route';

const runDetail: AgentRunDetailDto = {
  run: {
    id: 'run-1',
    conversationId: 'run-1',
    taskType: 'image',
    status: 'succeeded',
    prompt: '山水',
    finalMessage: '完成',
    errorMessage: null,
    capabilitySummary: { provider: 'doubao', model: 'seedream', capabilities: [] },
    selectedModel: null,
    usage: null,
    billing: null,
    artifacts: [
      {
        id: 'artifact-1',
        kind: 'image',
        title: '生成图片',
        status: 'ready',
        body: null,
        url: null,
        metadata: {
          storageStatus: 'cached',
          cacheStatus: 'available',
          cacheObjectKey: 'cache/run-1/artifact-1.png',
          cacheExpiresAt: '2026-06-13T00:00:00.000Z',
          mimeType: 'image/png',
        },
        createdAt: '2026-06-06T00:00:00.000Z',
      },
    ],
    createdAt: '2026-06-06T00:00:00.000Z',
    updatedAt: '2026-06-06T00:00:00.000Z',
  },
  events: [],
};

test('parseArtifactAccessDisposition accepts preview and download', () => {
  assert.equal(parseArtifactAccessDisposition(null), 'preview');
  assert.equal(parseArtifactAccessDisposition('preview'), 'preview');
  assert.equal(parseArtifactAccessDisposition('download'), 'download');
  assert.throws(() => parseArtifactAccessDisposition('inline'), /Invalid disposition/);
});

test('generated run artifact access route signs cached artifact for run owner', async () => {
  const handlers = createGeneratedRunArtifactAccessRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getRunDetail: async (runId, userId) => {
      assert.equal(runId, 'run-1');
      assert.equal(userId, 'user-1');
      return runDetail;
    },
    createCachedAccess: async ({ objectKey, expiresInSeconds }) => ({
      url: `https://signed.example/${objectKey}?expires=${expiresInSeconds}`,
      expiresAt: '2026-06-06T00:10:00.000Z',
    }),
    now: () => new Date('2026-06-06T00:00:00.000Z'),
  });

  const response = await handlers.GET(
    new Request('https://example.com/api/agent/runs/run-1/artifacts/artifact-1/access?disposition=download'),
    { params: Promise.resolve({ runId: 'run-1', artifactId: 'artifact-1' }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.access.runId, 'run-1');
  assert.equal(payload.access.artifactId, 'artifact-1');
  assert.equal(payload.access.disposition, 'download');
  assert.equal(payload.access.mimeType, 'image/png');
  assert.equal(payload.access.url, 'https://signed.example/cache/run-1/artifact-1.png?expires=600');
});

test('generated run artifact access route rejects expired cache', async () => {
  const handlers = createGeneratedRunArtifactAccessRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getRunDetail: async () => runDetail,
    createCachedAccess: async () => {
      throw new Error('sign should not be called');
    },
    now: () => new Date('2026-06-14T00:00:00.000Z'),
  });

  const response = await handlers.GET(
    new Request('https://example.com/api/agent/runs/run-1/artifacts/artifact-1/access'),
    { params: Promise.resolve({ runId: 'run-1', artifactId: 'artifact-1' }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 410);
  assert.equal(payload.error.code, 'cache_expired');
});

test('generated run artifact access route returns not found for missing run or artifact', async () => {
  const handlers = createGeneratedRunArtifactAccessRouteHandlers({
    requireSession: async () => ({ user: { id: 'user-1' } }),
    getRunDetail: async () => null,
    createCachedAccess: async () => {
      throw new Error('unused');
    },
  });

  const response = await handlers.GET(
    new Request('https://example.com/api/agent/runs/run-1/artifacts/artifact-1/access'),
    { params: Promise.resolve({ runId: 'run-1', artifactId: 'artifact-1' }) },
  );
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.error.code, 'run_not_found');
});
