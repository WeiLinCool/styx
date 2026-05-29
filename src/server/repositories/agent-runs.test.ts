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

test('memory agent run repository lifecycle methods fail runs', async () => {
  const repo = createMemoryAgentRunRepository();
  const run = await createChatRun(repo);

  const failed = await repo.failRun(run.id, 'runtime failed');

  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.errorMessage, 'runtime failed');
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
