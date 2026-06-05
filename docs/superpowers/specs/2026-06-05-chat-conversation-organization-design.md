# AI Chat Conversation Organization Design

Date: 2026-06-05
Status: Proposed

## Context

The current chat sidebar groups history by `agent_runs.conversation_id`. There is no durable conversation record or folder record. Conversation titles are derived in the client from the prompt of the newest visible run, and deleting a history item soft-deletes every run in that conversation.

Users need to rename conversations and organize them into folders so that chat history can be classified and found later. Classification must not change the chat content, billing state, generated artifacts, or AI context.

## Goals

- Let users create permanent folders in the AI chat sidebar.
- Let users rename folders.
- Let users delete folders without deleting conversations; affected conversations move back to uncategorized.
- Let users rename conversations.
- Let users move conversations between folders and uncategorized.
- Preserve existing chat execution and conversation context behavior.
- Keep all conversation and folder ownership user-scoped and fail closed at API boundaries.

## Non-Goals

- Folder-specific AI instructions, knowledge bases, project memory, or model defaults.
- Drag-and-drop sorting.
- Shared folders or cross-user collaboration.
- Multi-level nested folders.
- Full-text search.
- Hard deletion of conversations through folder deletion.

## Selected Approach

Use separate durable records for conversations and folders:

- `agent_conversations` owns user-facing conversation metadata.
- `agent_conversation_folders` owns user-created classification folders.
- `agent_runs.conversation_id` remains the run-to-conversation linkage.

This avoids duplicating title and folder metadata across runs, keeps classification independent from run execution, and leaves room for future history features without changing provider/runtime behavior.

## Data Model

### `agent_conversation_folders`

- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `name text not null`
- `sort_order integer not null default 0`
- `deleted_at timestamp with time zone null`
- `created_at timestamp with time zone not null`
- `updated_at timestamp with time zone not null`

Indexes:

- `(user_id, deleted_at)`
- `(user_id, sort_order)`

Folder names are trimmed. Empty names are rejected. Very long names are capped by API validation.

### `agent_conversations`

- `id uuid primary key`
- `user_id uuid not null references users(id) on delete cascade`
- `folder_id uuid null references agent_conversation_folders(id) on delete set null`
- `auto_title text not null`
- `title_override text null`
- `last_run_at timestamp with time zone not null`
- `deleted_at timestamp with time zone null`
- `created_at timestamp with time zone not null`
- `updated_at timestamp with time zone not null`

Indexes:

- `(user_id, deleted_at)`
- `(user_id, folder_id)`
- `(user_id, last_run_at)`

The display title is `title_override` when it is non-empty; otherwise it is `auto_title`.

## Migration Strategy

For existing chat run groups:

1. Group non-deleted `agent_runs` with `task_type = 'chat'` by `(user_id, conversation_id)`.
2. Create one `agent_conversations` record per group.
3. Use the earliest run prompt as `auto_title`.
4. Use the newest run `created_at` or `updated_at` as `last_run_at`.
5. Leave `folder_id` and `title_override` null.

Runs whose `conversation_id` is null are treated as their own run id, matching current DTO behavior.

## Repository Ownership

Add a conversation repository under `src/server/repositories`, or extend the existing agent run repository only if the code stays cohesive. The repository owns:

- folder CRUD and soft delete;
- conversation metadata lookup;
- title rename and clear operations;
- folder assignment;
- list shape for the sidebar;
- validating that selected folders and conversations belong to the same user.

The agent run service still owns creating and executing runs. When a new chat run starts without a `conversationId`, the service or route creates a conversation first and uses its id as `conversationId`. When a chat run completes or is created, `lastRunAt` is updated.

## API Design

### `GET /api/agent/conversations`

Returns folders and conversations for the current active account.

Shape:

```ts
{
  folders: Array<{
    id: string;
    name: string;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
  }>;
  conversations: Array<{
    id: string;
    folderId: string | null;
    title: string;
    autoTitle: string;
    titleOverride: string | null;
    lastRunAt: string;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

### `PATCH /api/agent/conversations/[conversationId]`

Supports:

- `titleOverride: string | null` to rename or restore automatic title;
- `folderId: string | null` to move the conversation.

The route validates input before repository calls and rejects unknown conversations or folders with 404.

### `POST /api/agent/conversation-folders`

Creates a folder for the current user.

Body:

```ts
{ name: string }
```

### `PATCH /api/agent/conversation-folders/[folderId]`

Renames a folder.

Body:

```ts
{ name: string }
```

### `DELETE /api/agent/conversation-folders/[folderId]`

Soft-deletes the folder and sets `folderId` to null for its conversations. It does not delete runs or conversations.

## Run Creation Behavior

`POST /api/agent/runs` keeps accepting `conversationId` for chat requests.

- If `conversationId` is present, the route validates that the conversation belongs to the current user and is not deleted.
- If absent for a chat request, a new conversation is created with `autoTitle` derived from the prompt.
- The run is created with the conversation id.
- Non-chat tasks keep their current behavior unless a later feature decides to organize media tasks in the same sidebar.

## UI Design

The AI chat page sidebar becomes a grouped operational surface:

- Header actions: `New chat`, `New folder`.
- `Uncategorized` group shows conversations with `folderId = null`.
- Each folder renders a collapsible group with its conversations.
- Conversation row actions:
  - rename;
  - move to folder;
  - delete conversation.
- Folder row actions:
  - rename;
  - delete folder.

The default title remains the first prompt. Once a user renames a conversation, `titleOverride` is used permanently. Clearing the custom title restores the automatic title.

Move operations use a menu or lightweight dialog instead of drag-and-drop in the first version.

## Error Handling

- API routes return 400 for invalid names or malformed ids.
- API routes return 404 for conversations or folders that do not belong to the current user.
- Folder deletion is idempotent from the user's point of view: after deletion, the folder disappears and its conversations appear in uncategorized.
- Sidebar mutation errors show inline feedback and preserve the current local state until a successful refresh.
- Creating a run with a stale or deleted conversation id fails before provider execution.

## Security and Ownership

- All conversation and folder APIs require an active account.
- Repository queries always filter by `userId`.
- Moving a conversation into a folder validates both records share the same user.
- Folder deletion must not affect another user's conversations, even if ids are guessed.
- Middleware remains unchanged and Edge-safe.

## Testing Strategy

Repository tests:

- create/list folders and conversations per user;
- rename conversation and restore auto title;
- move conversation to a folder and back to uncategorized;
- delete folder moves conversations to uncategorized;
- reject cross-user folder assignment.

API route tests:

- validate folder and conversation mutation bodies;
- fail closed for missing or wrong-user records;
- run creation rejects stale conversation ids.

UI tests or focused component tests:

- sidebar groups conversations by folder;
- rename updates the displayed title;
- deleting a folder keeps conversations visible under uncategorized.

Verification:

- `pnpm validate`
- focused route/repository tests
- `pnpm build`
- browser verification of the chat sidebar if local auth/database setup is available.

## Open Decisions Resolved

- Folder deletion does not delete conversations.
- Folder organization does not change AI context semantics.
- Custom conversation titles override automatic titles until cleared.
- First version does not include drag-and-drop, nested folders, shared folders, or folder-specific AI behavior.
