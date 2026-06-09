import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterWorkflowChatModels,
  getWorkflowChatModelLabel,
  waitForTerminalRun,
} from './workflow-quick-action-dialogs';
import type { AgentRunDetailDto } from '@/server/agent/types';
import type { ChatModelOption } from '@/features/public/agent-runtime-client';

function makeChatModel(overrides: Partial<ChatModelOption> = {}): ChatModelOption {
  return {
    id: 'model-1',
    code: 'chat-1',
    name: 'Chat One',
    providerName: 'Configured Provider',
    isDefault: false,
    entitlementLabel: 'Free',
    pricingSummary: '1 credit minimum',
    ...overrides,
  };
}

test('filterWorkflowChatModels removes development provider chat models', () => {
  const models: ChatModelOption[] = [
    makeChatModel({
      id: 'development-free',
      providerName: 'Development Provider',
      name: 'Development Free Chat',
      isDefault: true,
    }),
    makeChatModel({
      id: 'configured-chat',
      providerName: 'Configured Provider',
      name: 'Configured Chat',
    }),
  ];

  const filtered = filterWorkflowChatModels(models);

  assert.deepEqual(filtered.map((model) => model.id), ['configured-chat']);
});

test('getWorkflowChatModelLabel combines model and provider names', () => {
  assert.equal(
    getWorkflowChatModelLabel(
      makeChatModel({
        name: 'Configured Chat',
        providerName: 'Configured Provider',
      }),
    ),
    'Configured Chat · Configured Provider',
  );
});

test('waitForTerminalRun keeps polling until the run succeeds', async () => {
  let polls = 0;
  const operationRef = { current: 1 };
  const detailByPoll: AgentRunDetailDto[] = [
    { run: { status: 'running', errorMessage: null } as AgentRunDetailDto['run'], events: [] },
    { run: { status: 'running', errorMessage: null } as AgentRunDetailDto['run'], events: [] },
    { run: { status: 'succeeded', errorMessage: null } as AgentRunDetailDto['run'], events: [] },
  ];

  const detail = await waitForTerminalRun({
    runId: 'run-1',
    operationRef,
    operationId: 1,
    getDetail: async () => detailByPoll[polls++] ?? detailByPoll[detailByPoll.length - 1],
    sleep: async () => undefined,
  });

  assert.equal(detail?.run.status, 'succeeded');
  assert.equal(polls, 3);
});
