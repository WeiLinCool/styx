import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMemoryAgentRunRepository,
  type AgentRunEventInput,
  type AgentRunRepository,
} from '@/server/repositories/agent-runs';
import type { AgentTaskType } from './types';
import { createDeterministicPiRuntime } from './pi-runtime';
import { createAgentRunService } from './run-service';

test('createAndRunAgentRun completes run with deterministic Pi adapter output', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: '帮我设计一个石头印画作品',
    input: {},
  });

  assert.equal(run.status, 'succeeded');
  assert.match(run.finalMessage ?? '', /石头印画作品/);
  assert.equal(run.capabilitySummary.provider, 'pi');
  assert.equal(run.artifacts.length, 1);
});

test('createAndRunAgentRun records failure when runtime throws', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        throw new Error('pi unavailable');
      },
    },
  });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    input: {},
  });

  assert.equal(run.status, 'failed');
  assert.equal(run.errorMessage, 'pi unavailable');
});

test('createAndRunAgentRun keeps completed run succeeded when succeeded event recording fails', async () => {
  const repository: AgentRunRepository = {
    ...createMemoryAgentRunRepository(),
    async recordEvent(_runId: string, input: AgentRunEventInput) {
      if (input.type === 'succeeded') {
        throw new Error('event store unavailable');
      }
    },
  };
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    input: {},
  });

  assert.equal(run.status, 'succeeded');
  assert.equal(run.errorMessage, null);
});

test('createAndRunAgentRun clones runtime request input and capabilities', async () => {
  const repository = createMemoryAgentRunRepository();
  const callerInput = { nested: { value: 'original' } };
  const service = createAgentRunService({
    repository,
    runtime: {
      async run(request) {
        request.input.nested = { value: 'mutated' };
        request.capabilities[0].name = 'Mutated Model';
        request.capabilities[0].config.model = 'mutated-model';

        return {
          finalMessage: 'done',
          artifacts: [],
        };
      },
    },
  });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'chat',
    prompt: 'hello',
    input: callerInput,
  });

  assert.deepEqual(callerInput, { nested: { value: 'original' } });
  assert.equal(run.capabilitySummary.model, 'pi-default');
  assert.equal(run.capabilitySummary.capabilities[0].name, 'Pi 默认模型');
});

test('createAndRunAgentRun returns failed unconfigured run when no default bundle exists', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({ repository, runtime: createDeterministicPiRuntime() });

  const run = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'unsupported' as AgentTaskType,
    prompt: 'hello',
    input: {},
  });

  assert.equal(run.status, 'failed');
  assert.equal(run.capabilitySummary.provider, 'unconfigured');
  assert.equal(run.capabilitySummary.model, 'unconfigured');
  assert.match(run.errorMessage ?? '', /No default agent capability bundle/);
});
