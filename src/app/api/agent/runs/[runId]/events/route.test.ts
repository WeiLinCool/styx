import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentRunDetailDto } from '@/server/agent/types';

import { createAgentRunEventsStream } from './route';

function createRunDetail(overrides: Partial<AgentRunDetailDto> = {}): AgentRunDetailDto {
  return {
    run: {
      id: 'run-1',
      conversationId: 'run-1',
      taskType: 'image',
      status: 'running',
      prompt: '山水',
      finalMessage: null,
      errorMessage: null,
      capabilitySummary: { provider: 'doubao', model: 'seedream', capabilities: [] },
      selectedModel: null,
      usage: null,
      billing: null,
      artifacts: [],
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    events: [],
    ...overrides,
  };
}

async function readStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    output += decoder.decode(value, { stream: true });
  }

  return output + decoder.decode();
}

test('createAgentRunEventsStream emits initial events', async () => {
  const output = await readStream(
    createAgentRunEventsStream({
      runId: 'run-1',
      userId: 'user-1',
      detail: createRunDetail({
        events: [
          {
            id: 'event-1',
            runId: 'run-1',
            sequence: 1,
            eventType: 'run_started',
            payload: { taskType: 'image' },
            createdAt: '2026-06-05T00:00:00.000Z',
          },
        ],
      }),
      repository: {
        async getRunDetailForUser() {
          return null;
        },
      },
      pollIntervalMs: 5,
    }),
  );

  assert.match(output, /event: connected/);
  assert.match(output, /event: run_started/);
});

test('createAgentRunEventsStream does not reject after consumer cancellation', async () => {
  let releaseDetail: ((value: AgentRunDetailDto | null) => void) | undefined;
  let callCount = 0;
  const unhandledRejections: unknown[] = [];

  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const stream = createAgentRunEventsStream({
      runId: 'run-1',
      userId: 'user-1',
      detail: createRunDetail({
        events: [
          {
            id: 'event-1',
            runId: 'run-1',
            sequence: 1,
            eventType: 'run_started',
            payload: { taskType: 'image' },
            createdAt: '2026-06-05T00:00:00.000Z',
          },
        ],
      }),
      repository: {
        async getRunDetailForUser() {
          callCount += 1;
          return await new Promise<AgentRunDetailDto | null>((resolve) => {
            releaseDetail = resolve;
          });
        },
      },
      pollIntervalMs: 5,
    });

    const reader = stream.getReader();
    const first = await reader.read();
    assert.equal(first.done, false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await reader.cancel();
    const resolver = releaseDetail;
    releaseDetail = undefined;
    resolver?.(
      createRunDetail({
        run: {
          ...createRunDetail().run,
          status: 'succeeded',
          finalMessage: '完成',
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(callCount >= 1, true);
    assert.deepEqual(unhandledRejections, []);
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
});

test('createAgentRunEventsStream cancels without rejecting when pending detail resolves late', async () => {
  let releaseDetail: ((value: AgentRunDetailDto | null) => void) | undefined;
  const unhandledRejections: unknown[] = [];

  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const stream = createAgentRunEventsStream({
      runId: 'run-1',
      userId: 'user-1',
      detail: createRunDetail({
        events: [
          {
            id: 'event-1',
            runId: 'run-1',
            sequence: 1,
            eventType: 'run_started',
            payload: { taskType: 'image' },
            createdAt: '2026-06-05T00:00:00.000Z',
          },
        ],
      }),
      repository: {
        async getRunDetailForUser() {
          return await new Promise<AgentRunDetailDto | null>((resolve) => {
            releaseDetail = resolve;
          });
        },
      },
      pollIntervalMs: 5,
    });

    const reader = stream.getReader();
    const first = await reader.read();
    assert.equal(first.done, false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await reader.cancel();
    const resolver = releaseDetail;
    releaseDetail = undefined;
    resolver?.(
      createRunDetail({
        run: {
          ...createRunDetail().run,
          status: 'succeeded',
          finalMessage: '完成',
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(unhandledRejections, []);
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
});
