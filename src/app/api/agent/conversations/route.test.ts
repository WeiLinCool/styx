import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentConversationListResponse,
  createAgentConversationUpdateResponse,
  parseUpdateAgentConversationBody,
} from './route-helpers';

test('createAgentConversationListResponse returns folders and conversations', async () => {
  const response = createAgentConversationListResponse({
    folders: [
      {
        id: 'folder-1',
        name: '项目',
        sortOrder: 0,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    ],
    conversations: [
      {
        id: 'conversation-1',
        folderId: 'folder-1',
        title: '自定义标题',
        autoTitle: '自动标题',
        titleOverride: '自定义标题',
        lastRunAt: '2026-06-05T00:00:00.000Z',
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z',
      },
    ],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.folders[0].name, '项目');
  assert.equal(body.conversations[0].title, '自定义标题');
});

test('parseUpdateAgentConversationBody trims title and accepts null folder', () => {
  assert.deepEqual(
    parseUpdateAgentConversationBody({
      titleOverride: '  新标题  ',
      folderId: null,
    }),
    {
      titleOverride: '新标题',
      folderId: null,
    },
  );
});

test('parseUpdateAgentConversationBody rejects empty patch body', () => {
  assert.throws(() => parseUpdateAgentConversationBody({}), /at least one field/);
});

test('createAgentConversationUpdateResponse returns not found for missing conversation', async () => {
  const response = createAgentConversationUpdateResponse(null);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'conversation_not_found');
});
