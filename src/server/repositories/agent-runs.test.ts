import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryAgentRunRepository, getAgentRunRepository } from './agent-runs';

async function createChatRun(repo: ReturnType<typeof createMemoryAgentRunRepository>) {
  return repo.createRun({
    userId: 'user-alice',
    taskType: 'chat',
    prompt: '帮我写提示词',
    provider: 'pi',
    model: 'pi-default',
    capabilitySnapshot: {
      bundleId: 'bundle-chat',
      bundleCode: 'chat-default',
      provider: 'pi',
      model: 'pi-default',
      capabilities: [
        {
          id: 'model-1',
          kind: 'model',
          code: 'pi-chat',
          name: 'Pi Chat',
          config: { provider: 'pi', model: 'pi-default' },
        },
      ],
    },
    input: {},
  });
}

test('memory agent run repository returns only runs owned by the requesting user', async () => {
  const repo = createMemoryAgentRunRepository();
  const aliceRun = await createChatRun(repo);
  await repo.createRun({
    userId: 'user-bob',
    taskType: 'chat',
    prompt: 'Bob prompt',
    provider: 'pi',
    model: 'pi-default',
    capabilitySnapshot: {
      bundleId: 'bundle-chat',
      bundleCode: 'chat-default',
      provider: 'pi',
      model: 'pi-default',
      capabilities: [],
    },
    input: {},
  });

  assert.equal((await repo.getRunForUser(aliceRun.id, 'user-alice'))?.id, aliceRun.id);
  assert.equal(await repo.getRunForUser(aliceRun.id, 'user-bob'), null);
  assert.equal((await repo.listRunsForUser('user-alice')).length, 1);
});

test('memory agent run repository filters runs by task type for user history', async () => {
  const repo = createMemoryAgentRunRepository();
  await createChatRun(repo);
  await repo.createRun({
    userId: 'user-alice',
    taskType: 'image',
    prompt: '山水图',
    provider: 'doubao',
    model: 'seedream',
    capabilitySnapshot: {
      bundleId: 'image',
      bundleCode: 'image',
      provider: 'doubao',
      model: 'seedream',
      capabilities: [],
    },
    input: { mode: 'generate' },
  });
  await repo.createRun({
    userId: 'user-alice',
    taskType: 'video',
    prompt: '山水视频',
    provider: 'doubao',
    model: 'seedance',
    capabilitySnapshot: {
      bundleId: 'video',
      bundleCode: 'video',
      provider: 'doubao',
      model: 'seedance',
      capabilities: [],
    },
    input: { durationSeconds: 5 },
  });
  await repo.createRun({
    userId: 'user-bob',
    taskType: 'image',
    prompt: 'Bob image',
    provider: 'doubao',
    model: 'seedream',
    capabilitySnapshot: {
      bundleId: 'image',
      bundleCode: 'image',
      provider: 'doubao',
      model: 'seedream',
      capabilities: [],
    },
    input: { mode: 'generate' },
  });

  const imageRuns = await repo.listRunsForUser('user-alice', { taskType: 'image' });
  const videoRuns = await repo.listRunsForUser('user-alice', { taskType: 'video' });
  const allRuns = await repo.listRunsForUser('user-alice');

  assert.equal(imageRuns.length, 1);
  assert.equal(imageRuns[0]?.taskType, 'image');
  assert.equal(imageRuns[0]?.prompt, '山水图');
  assert.equal(videoRuns.length, 1);
  assert.equal(videoRuns[0]?.taskType, 'video');
  assert.equal(allRuns.length, 3);
});

test('memory agent run repository protects stored state from returned DTO mutation', async () => {
  const repo = createMemoryAgentRunRepository();
  const run = await createChatRun(repo);

  run.capabilitySummary.capabilities[0].name = 'Mutated';
  run.artifacts.push({
    id: 'artifact-1',
    kind: 'text',
    title: 'Mutated Artifact',
    status: 'ready',
    body: 'mutated',
    url: null,
    metadata: { nested: { mutated: true } },
    createdAt: new Date().toISOString(),
  });

  const stored = await repo.getRunForUser(run.id, 'user-alice');

  assert.equal(stored?.capabilitySummary.capabilities[0].name, 'Pi Chat');
  assert.equal(stored?.artifacts.length, 0);
});

test('memory agent run repository lifecycle methods mark running and complete with artifact', async () => {
  const repo = createMemoryAgentRunRepository();
  const run = await createChatRun(repo);

  await repo.recordEvent(run.id, { type: 'started', metadata: { phase: 'runtime' } });
  const running = await repo.markRunRunning(run.id);
  const completed = await repo.completeRun(run.id, {
    finalMessage: '完成',
    artifacts: [
      {
        kind: 'text',
        title: 'AI 回复',
        body: '完成',
        metadata: { source: 'test' },
      },
    ],
  });

  assert.equal(running?.status, 'running');
  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.finalMessage, '完成');
  assert.equal(completed?.artifacts.length, 1);
  assert.equal(completed?.artifacts[0].metadata.source, 'test');
});

test('memory agent run repository updates artifact save metadata without changing run status', async () => {
  const repo = createMemoryAgentRunRepository();
  const run = await repo.createRun({
    userId: 'user-alice',
    taskType: 'image',
    prompt: '山水海报',
    provider: 'doubao',
    model: 'seedream-3',
    capabilitySnapshot: {
      bundleId: 'bundle-image',
      bundleCode: 'image-default',
      provider: 'doubao',
      model: 'seedream-3',
      capabilities: [],
    },
    input: {},
  });

  const completed = await repo.completeRun(run.id, {
    finalMessage: '生成完成',
    artifacts: [
      {
        kind: 'image',
        title: '生成图片',
        metadata: {
          saveStatus: 'not_saved',
          providerExpiresAt: '2026-06-03T12:00:00.000Z',
        },
      },
    ],
  });

  const artifactId = completed?.artifacts[0]?.id;
  assert.ok(artifactId);

  const updated = await repo.updateArtifactSaveState(run.id, artifactId, {
    saveStatus: 'saved',
    savedAssetId: 'asset-1',
  });

  assert.equal(updated?.status, 'succeeded');
  assert.equal(updated?.artifacts[0]?.metadata.saveStatus, 'saved');
  assert.equal(updated?.artifacts[0]?.metadata.savedAssetId, 'asset-1');
});

test('memory agent run repository extracts selected model, usage, and billing metadata', async () => {
  const repo = createMemoryAgentRunRepository();
  const run = await repo.createRun({
    userId: 'user-alice',
    taskType: 'chat',
    prompt: 'hello',
    provider: 'development',
    model: 'development-free-chat',
    capabilitySnapshot: {
      bundleId: 'chat-model-model-1',
      bundleCode: 'chat-dev-free-chat',
      provider: 'development',
      model: 'development-free-chat',
      capabilities: [],
      modelId: 'model-1',
      modelCode: 'dev-free-chat',
      modelName: 'Development Free Chat',
      providerCode: 'development',
      entitlement: { label: 'Free' },
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
      billing: { status: 'billed', creditCost: 1, ledgerEntryId: 'ledger-1' },
    },
    input: {},
  });

  assert.equal(run.selectedModel?.id, 'model-1');
  assert.equal(run.selectedModel?.code, 'dev-free-chat');
  assert.deepEqual(run.usage, { promptTokens: 3, completionTokens: 4, totalTokens: 7 });
  assert.deepEqual(run.billing, {
    status: 'billed',
    creditCost: 1,
    ledgerEntryId: 'ledger-1',
  });
});

test('memory agent run repository lifecycle methods fail runs', async () => {
  const repo = createMemoryAgentRunRepository();
  const run = await createChatRun(repo);

  const failed = await repo.failRun(run.id, 'runtime failed');

  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.errorMessage, 'runtime failed');
});

test('memory agent run repository lists stream events in sequence and exposes run detail', async () => {
  const repo = createMemoryAgentRunRepository();
  const run = await createChatRun(repo);

  await repo.appendRunEvent(run.id, {
    eventType: 'assistant_message_started',
    payload: { messageId: `${run.id}-assistant`, role: 'assistant' },
  });
  await repo.appendRunEvent(run.id, {
    eventType: 'assistant_delta',
    payload: { messageId: `${run.id}-assistant`, delta: 'hello' },
  });

  const events = await repo.listRunEvents(run.id);
  const detail = await repo.getRunDetailForUser(run.id, 'user-alice');

  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => [event.sequence, event.eventType]),
    [
      [1, 'assistant_message_started'],
      [2, 'assistant_delta'],
    ],
  );
  assert.ok(detail);
  assert.equal(detail?.events.length, 2);
  assert.equal(detail?.events[1]?.payload.delta, 'hello');
});

test('memory agent run repository soft deletes runs from user-visible history', async () => {
  const repo = createMemoryAgentRunRepository();
  const aliceRun = await createChatRun(repo);
  const aliceFollowUp = await repo.createRun({
    userId: 'user-alice',
    conversationId: aliceRun.conversationId,
    taskType: 'chat',
    prompt: '继续',
    provider: 'pi',
    model: 'pi-default',
    capabilitySnapshot: {
      bundleId: 'bundle-chat',
      bundleCode: 'chat-default',
      provider: 'pi',
      model: 'pi-default',
      capabilities: [],
    },
    input: {},
  });
  const bobRun = await repo.createRun({
    userId: 'user-bob',
    taskType: 'chat',
    prompt: 'Bob prompt',
    provider: 'pi',
    model: 'pi-default',
    capabilitySnapshot: {
      bundleId: 'bundle-chat',
      bundleCode: 'chat-default',
      provider: 'pi',
      model: 'pi-default',
      capabilities: [],
    },
    input: {},
  });

  const wrongUserDelete = await repo.softDeleteRunForUser(aliceRun.id, 'user-bob');
  const deleted = await repo.softDeleteRunForUser(aliceRun.id, 'user-alice');

  assert.equal(wrongUserDelete, null);
  assert.equal(deleted?.id, aliceRun.id);
  assert.deepEqual(await repo.listRunsForUser('user-alice'), []);
  assert.equal(await repo.getRunForUser(aliceRun.id, 'user-alice'), null);
  assert.equal(await repo.getRunForUser(aliceFollowUp.id, 'user-alice'), null);
  assert.equal(await repo.getRunDetailForUser(aliceRun.id, 'user-alice'), null);
  assert.equal((await repo.listRunsForUser('user-bob')).length, 1);
  assert.equal((await repo.getRunForUser(bobRun.id, 'user-bob'))?.id, bobRun.id);
  assert.equal(await repo.softDeleteRunForUser(aliceRun.id, 'user-alice'), null);
});

test('agent run repository fails closed in production without database config', () => {
  const writableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = writableEnv.NODE_ENV;
  const originalDatabaseUrl = writableEnv.DATABASE_URL;

  writableEnv.NODE_ENV = 'production';
  delete writableEnv.DATABASE_URL;

  try {
    assert.throws(
      () => getAgentRunRepository(),
      /DATABASE_URL is required for agent run repository in production/,
    );
  } finally {
    if (originalNodeEnv === undefined) {
      delete writableEnv.NODE_ENV;
    } else {
      writableEnv.NODE_ENV = originalNodeEnv;
    }

    if (originalDatabaseUrl === undefined) {
      delete writableEnv.DATABASE_URL;
    } else {
      writableEnv.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
