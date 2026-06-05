import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryAgentConversationRepository } from './agent-conversations';

test('memory conversation repository creates folders and lists conversations by owner', async () => {
  const repo = createMemoryAgentConversationRepository();
  const folder = await repo.createFolder({ userId: 'user-alice', name: '  作品灵感  ' });
  const conversation = await repo.createConversation({
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-alice',
    autoTitle: '帮我设计石头印画',
    lastRunAt: '2026-06-05T10:00:00.000Z',
  });
  await repo.createFolder({ userId: 'user-bob', name: 'Bob folder' });
  await repo.createConversation({
    id: '22222222-2222-4222-8222-222222222222',
    userId: 'user-bob',
    autoTitle: 'Bob chat',
    lastRunAt: '2026-06-05T11:00:00.000Z',
  });

  const list = await repo.listForUser('user-alice');

  assert.equal(folder.name, '作品灵感');
  assert.equal(conversation.title, '帮我设计石头印画');
  assert.deepEqual(list.folders.map((item) => item.name), ['作品灵感']);
  assert.deepEqual(list.conversations.map((item) => item.id), ['11111111-1111-4111-8111-111111111111']);
});

test('memory conversation repository renames conversations and restores automatic title', async () => {
  const repo = createMemoryAgentConversationRepository();
  await repo.createConversation({
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-alice',
    autoTitle: '第一条消息',
    lastRunAt: '2026-06-05T10:00:00.000Z',
  });

  const renamed = await repo.updateConversation('11111111-1111-4111-8111-111111111111', 'user-alice', {
    titleOverride: '自定义标题',
  });
  const restored = await repo.updateConversation('11111111-1111-4111-8111-111111111111', 'user-alice', {
    titleOverride: null,
  });

  assert.equal(renamed?.title, '自定义标题');
  assert.equal(renamed?.titleOverride, '自定义标题');
  assert.equal(restored?.title, '第一条消息');
  assert.equal(restored?.titleOverride, null);
});

test('memory conversation repository moves conversations and folder deletion returns them to uncategorized', async () => {
  const repo = createMemoryAgentConversationRepository();
  const folder = await repo.createFolder({ userId: 'user-alice', name: '项目 A' });
  await repo.createConversation({
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-alice',
    autoTitle: '分类对话',
    lastRunAt: '2026-06-05T10:00:00.000Z',
  });

  const moved = await repo.updateConversation('11111111-1111-4111-8111-111111111111', 'user-alice', {
    folderId: folder.id,
  });
  const deletedFolder = await repo.deleteFolder(folder.id, 'user-alice');
  const list = await repo.listForUser('user-alice');

  assert.equal(moved?.folderId, folder.id);
  assert.equal(deletedFolder?.id, folder.id);
  assert.deepEqual(list.folders, []);
  assert.equal(list.conversations[0]?.folderId, null);
});

test('memory conversation repository rejects cross-user folder assignment', async () => {
  const repo = createMemoryAgentConversationRepository();
  const bobFolder = await repo.createFolder({ userId: 'user-bob', name: 'Bob folder' });
  await repo.createConversation({
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-alice',
    autoTitle: 'Alice chat',
    lastRunAt: '2026-06-05T10:00:00.000Z',
  });

  const moved = await repo.updateConversation('11111111-1111-4111-8111-111111111111', 'user-alice', {
    folderId: bobFolder.id,
  });

  assert.equal(moved, null);
  assert.equal((await repo.listForUser('user-alice')).conversations[0]?.folderId, null);
});

test('memory conversation repository soft deletes conversations from user history', async () => {
  const repo = createMemoryAgentConversationRepository();
  await repo.createConversation({
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-alice',
    autoTitle: 'Alice chat',
    lastRunAt: '2026-06-05T10:00:00.000Z',
  });

  assert.equal(await repo.softDeleteConversation('11111111-1111-4111-8111-111111111111', 'user-bob'), null);
  const deleted = await repo.softDeleteConversation(
    '11111111-1111-4111-8111-111111111111',
    'user-alice',
  );

  assert.equal(deleted?.id, '11111111-1111-4111-8111-111111111111');
  assert.deepEqual((await repo.listForUser('user-alice')).conversations, []);
});
