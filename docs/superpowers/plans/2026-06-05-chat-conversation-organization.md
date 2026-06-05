# Chat Conversation Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable chat conversation renaming and folder-based organization to the AI chat sidebar.

**Architecture:** Introduce `agent_conversations` and `agent_conversation_folders` as the source of truth for user-facing history organization while keeping `agent_runs` as execution records. API routes validate input and delegate to repositories; the chat page consumes a new conversation-history client API and keeps run loading separate from sidebar organization state.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, Node `test` + `assert`, shadcn/Radix-compatible local UI conventions.

---

### Task 1: Conversation Repository And Types

**Files:**
- Modify: `src/server/agent/types.ts`
- Create: `src/server/repositories/agent-conversations.ts`
- Create: `src/server/repositories/agent-conversations.test.ts`

- [ ] **Step 1: Write failing memory repository tests**

Add tests for folder create/list, conversation create/list, rename/clear title, move to folder, folder delete returning conversations to uncategorized, and cross-user folder assignment rejection.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm exec tsx --test src/server/repositories/agent-conversations.test.ts`

Expected: FAIL because `agent-conversations.ts` does not exist.

- [ ] **Step 3: Implement DTOs and memory repository**

Add `AgentConversationDto`, `AgentConversationFolderDto`, and `AgentConversationListDto` to `src/server/agent/types.ts`. Implement a memory repository with the same ownership and title semantics expected by the tests.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm exec tsx --test src/server/repositories/agent-conversations.test.ts`

Expected: PASS.

### Task 2: Schema And Database Repository

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/repositories/agent-conversations.ts`
- Modify: `src/server/repositories/agent-conversations.test.ts`
- Generated: `drizzle/*`

- [ ] **Step 1: Add schema tables**

Add `agentConversationFolders` and `agentConversations` tables with user ownership, folder relationship, soft delete, title fields, and indexes from the spec.

- [ ] **Step 2: Extend repository tests for database-compatible behavior**

Keep tests repository-factory based so they validate memory behavior and document expected database behavior without requiring a live DB.

- [ ] **Step 3: Implement database repository**

Add Drizzle-backed methods for folder CRUD, conversation CRUD/listing, folder assignment, title updates, folder deletion, ownership validation, and old-run backfill helper.

- [ ] **Step 4: Generate migration**

Run: `pnpm db:generate`

Expected: a migration that creates the two tables and indexes. Do not manually edit generated metadata.

- [ ] **Step 5: Run targeted repository tests**

Run: `pnpm exec tsx --test src/server/repositories/agent-conversations.test.ts`

Expected: PASS.

### Task 3: Run Creation Integration

**Files:**
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`
- Modify: `src/app/api/agent/runs/route.ts`
- Modify: `src/app/api/agent/runs/route.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that a new chat run creates a conversation when `conversationId` is omitted, accepts an owned existing conversation, and rejects stale/wrong-user conversation ids before provider execution.

- [ ] **Step 2: Run tests to verify RED**

Run focused route/service tests with `pnpm exec tsx --test`.

- [ ] **Step 3: Wire conversation repository into run creation**

Validate existing conversation ids and create conversation records for new chat runs. Keep non-chat behavior unchanged.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run the same focused tests.

### Task 4: Conversation And Folder API Routes

**Files:**
- Create: `src/app/api/agent/conversations/route.ts`
- Create: `src/app/api/agent/conversations/[conversationId]/route.ts`
- Create: `src/app/api/agent/conversation-folders/route.ts`
- Create: `src/app/api/agent/conversation-folders/[folderId]/route.ts`
- Create or modify route tests under matching `src/app/api/agent/**`

- [ ] **Step 1: Write failing API tests**

Cover list, create folder, rename folder, delete folder, rename conversation, clear title, move conversation, and wrong-user/not-found response mapping.

- [ ] **Step 2: Run tests to verify RED**

Run focused API tests with `pnpm exec tsx --test`.

- [ ] **Step 3: Implement routes with zod validation**

Routes require active account, use protected mutation guards for mutations, and return stable JSON shapes.

- [ ] **Step 4: Run tests to verify GREEN**

Run focused API tests.

### Task 5: Client API And Chat Sidebar UI

**Files:**
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Write failing client tests**

Test parsing/listing conversation organization payloads and mutation calls.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 3: Implement client helpers**

Add `listAgentConversations`, `createConversationFolder`, `updateConversationFolder`, `deleteConversationFolder`, and `updateAgentConversation`.

- [ ] **Step 4: Refactor chat sidebar state**

Load folders/conversations from the new endpoint. Render uncategorized and folder groups. Add inline/menu actions for new folder, folder rename/delete, conversation rename/move/delete. Keep message loading through run details.

- [ ] **Step 5: Run client tests to verify GREEN**

Run the client tests.

### Task 6: Final Verification

**Files:**
- All changed files.

- [ ] **Step 1: Run targeted tests**

Run repository, route, service, and client focused tests added or modified in this plan.

- [ ] **Step 2: Run validation**

Run: `pnpm validate`

- [ ] **Step 3: Run build**

Run: `pnpm build`

- [ ] **Step 4: Browser verification when local dependencies allow**

Run the dev server and verify the chat sidebar if auth/database are available. If blocked, record the exact blocker.
