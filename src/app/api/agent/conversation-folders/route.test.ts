import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentConversationFolderResponse,
  parseCreateAgentConversationFolderBody,
  parseUpdateAgentConversationFolderBody,
} from './route-helpers';

test('parseCreateAgentConversationFolderBody trims folder name', () => {
  assert.deepEqual(parseCreateAgentConversationFolderBody({ name: '  项目 A  ' }), {
    name: '项目 A',
  });
});

test('parseCreateAgentConversationFolderBody rejects empty folder name', () => {
  assert.throws(() => parseCreateAgentConversationFolderBody({ name: '   ' }), /Folder name is required/);
});

test('parseUpdateAgentConversationFolderBody trims folder name', () => {
  assert.deepEqual(parseUpdateAgentConversationFolderBody({ name: '  新名字  ' }), {
    name: '新名字',
  });
});

test('createAgentConversationFolderResponse returns not found for missing folder', async () => {
  const response = createAgentConversationFolderResponse(null);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'folder_not_found');
});
