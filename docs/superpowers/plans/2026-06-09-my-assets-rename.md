# My Assets Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to rename their own saved media assets from the `我的资料` page for both AI-generated and uploaded assets.

**Architecture:** Add a single owner-scoped title update capability at the saved media asset boundary, exposed as `PATCH /api/user/media-assets/[assetId]`, then consume it from the existing preview dialog in `my-assets-page.tsx`. Keep durable truth in the repository and update UI state optimistically from the returned DTO.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Drizzle repository pattern, node:test

---

### Task 1: Add repository rename support

**Files:**
- Modify: `src/server/repositories/generated-media-assets.ts`
- Test: `src/server/repositories/generated-media-assets.test.ts`

- [ ] Add repository method and tests for owner-only title updates, preserving non-title fields.

### Task 2: Add PATCH route for single asset rename

**Files:**
- Modify: `src/app/api/user/media-assets/[assetId]/route.ts`
- Test: `src/app/api/user/media-assets/[assetId]/route.test.ts`

- [ ] Add input validation and `PATCH` handler that trims and validates title, updates only owner-owned ready assets, and returns the updated asset.

### Task 3: Expose client helper for renaming assets

**Files:**
- Modify: `src/features/public/agent-runtime-client.ts`

- [ ] Add a focused helper that calls `PATCH /api/user/media-assets/[assetId]` and returns the updated asset DTO or throws the parsed API error.

### Task 4: Add rename UI to my-assets preview dialog

**Files:**
- Modify: `src/features/public/my-assets-page.tsx`

- [ ] Add preview-dialog rename state, edit/save/cancel controls, duplicate-submit guard, and local asset list synchronization after a successful rename.

### Task 5: Verify targeted behavior

**Files:**
- No code changes required

- [ ] Run targeted tests for repository and route.
- [ ] Run `pnpm validate` if feasible for the changed surface.
