# Workflow AI Image Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `AI 生图` shortcut to `/workflow` that generates a workflow image through the existing AI runtime, reuses the prompt-optimization-style modal flow, and only replaces a manually uploaded image after explicit confirmation.

**Architecture:** Keep workflow image source ownership in `src/app/workflow/page.tsx`. Add one new prompt builder in `workflow-quick-actions.ts`, one new modal in `workflow-quick-action-dialogs.tsx`, and a small state handoff from the modal back to the page. The modal generates a preview image through `POST /api/agent/runs`, but the page decides whether the preview becomes the current workflow image immediately or only after confirmation.

**Tech Stack:** Next.js App Router, React client state, existing AI runtime client, node:test, TypeScript.

---

### Task 1: Add the AI image prompt helper and coverage

**Files:**
- Modify: `src/app/workflow/workflow-quick-actions.ts`
- Modify: `src/app/workflow/workflow-quick-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildImageGenerationPrompt } from './workflow-quick-actions';

test('buildImageGenerationPrompt asks for a workflow-ready stone-print image and preserves the current prompt', () => {
  const prompt = '石纹更柔和';
  const built = buildImageGenerationPrompt(prompt);

  assert.match(built, /请根据下面这段 AI 视频工作流提示词生成一张适合当前工作流的参考图/);
  assert.match(built, /石纹更柔和/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/workflow/workflow-quick-actions.test.ts`
Expected: FAIL because `buildImageGenerationPrompt` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildImageGenerationPrompt(currentPrompt: string) {
  return [
    '请根据下面这段 AI 视频工作流提示词生成一张适合当前工作流的参考图。',
    '只返回生成目标所需的图像描述，不要加解释。',
    '',
    currentPrompt.trim(),
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/workflow/workflow-quick-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/workflow/workflow-quick-actions.ts src/app/workflow/workflow-quick-actions.test.ts
git commit -m "test: add workflow image prompt helper"
```

### Task 2: Add the AI image generation modal and coverage

**Files:**
- Modify: `src/app/workflow/workflow-quick-action-dialogs.tsx`
- Modify: `src/app/workflow/workflow-quick-action-dialogs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildImageGenerationPrompt } from './workflow-quick-actions';
import { readGeneratedImageResultMessage } from './workflow-quick-action-dialogs';

test('readGeneratedImageResultMessage trims assistant output and falls back to null for empty runs', () => {
  assert.equal(readGeneratedImageResultMessage({ finalMessage: '  已生成图案  ' }), '已生成图案');
  assert.equal(readGeneratedImageResultMessage({ finalMessage: '   ' }), null);
});
```

Add a focused component-level test that renders the new dialog only if the repo already has a lightweight pattern for client component tests; otherwise keep this task limited to pure helper coverage and add the component coverage in Task 4 browser verification.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/workflow/workflow-quick-action-dialogs.test.ts`
Expected: FAIL because the new helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function readGeneratedImageResultMessage(input: { finalMessage: string | null }) {
  const message = input.finalMessage?.trim() ?? '';
  return message.length > 0 ? message : null;
}
```

Add `ImageGenerationDialog` beside `PromptOptimizationDialog` and `ReferenceImageDialog`. The dialog should:
- load generate-capable image models with `listImageModels('generate')`
- call `createAgentRun({ taskType: 'image', prompt: buildImageGenerationPrompt(draftPrompt), modelId, input: { mode: 'generate' } })`
- poll with `waitForTerminalRun`
- fetch the resulting image artifact access URL
- render a preview and expose an `onApply` callback with the preview URL

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/workflow/workflow-quick-action-dialogs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/workflow/workflow-quick-action-dialogs.tsx src/app/workflow/workflow-quick-action-dialogs.test.ts
git commit -m "feat: add workflow ai image dialog"
```

### Task 3: Wire workflow state transitions and the shortcut button

**Files:**
- Modify: `src/app/workflow/page.tsx`
- Modify: `src/app/workflow/workflow-state.ts`
- Modify: `src/app/workflow/workflow-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { applyGeneratedReferenceScene, resetWorkflowForImageSourceChange } from './workflow-state';

test('resetWorkflowForImageSourceChange returns upload step and clears downstream state', () => {
  assert.deepEqual(resetWorkflowForImageSourceChange(makeSnapshot({ step: 2 })), {
    step: 0,
    storyboardGenerated: false,
    storyboardGenerating: false,
    selectedScene: null,
    customSceneUrl: null,
    aiSceneGenerated: false,
    aiSceneGenerating: false,
    dreaming: false,
  });
});

test('applyGeneratedReferenceScene replaces the current image when there is no manual upload and keeps the workflow at the upload step', () => {
  assert.deepEqual(
    applyGeneratedReferenceScene(makeSnapshot({ step: 0 }), 'data:image/png;base64,abc'),
    {
      step: 0,
      selectedScene: null,
      customSceneUrl: 'data:image/png;base64,abc',
      aiSceneGenerated: false,
      aiSceneGenerating: false,
      dreaming: false,
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/app/workflow/workflow-state.test.ts`
Expected: FAIL until the page/state helpers support the AI image handoff.

- [ ] **Step 3: Write minimal implementation**

Update `workflow-state.ts` with a helper that makes the handoff explicit, then in `page.tsx`:
- add a new `imageDialogOpen` state
- add a new shortcut button labeled `AI 生图`
- add a new dialog instance
- add an `handleApplyGeneratedImage` callback that:
  - if `uploadedImage` exists, writes the AI image into a pending confirmation path and preserves the original until the user confirms
  - if `uploadedImage` is empty, writes the AI image directly into `uploadedImage`
- keep the existing reset behavior when the image source changes manually

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/app/workflow/workflow-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/workflow/page.tsx src/app/workflow/workflow-state.ts src/app/workflow/workflow-state.test.ts
git commit -m "feat: wire workflow ai image shortcut"
```

### Task 4: Verify the full workflow behavior in tests and browser

**Files:**
- Modify: `src/app/workflow/workflow-quick-action-dialogs.test.ts`
- Modify: `src/app/workflow/workflow-state.test.ts`
- Verify: `/workflow`

- [ ] **Step 1: Add one browser-facing behavior check**

Make sure the workflow page shows the new shortcut button and the modal can:
- generate an image preview
- require confirmation when a manual upload already exists
- auto-apply when no image exists

- [ ] **Step 2: Run the focused test set**

Run: `pnpm test src/app/workflow/workflow-quick-actions.test.ts src/app/workflow/workflow-quick-action-dialogs.test.ts src/app/workflow/workflow-state.test.ts`
Expected: PASS.

- [ ] **Step 3: Run app verification**

Run: `pnpm build`
Then open `/workflow` in the local browser and confirm the new shortcut is visible and the confirmation behavior matches the handoff rule.

- [ ] **Step 4: Commit verification notes**

Record any blocker, browser issue, or unexpected edge case in the relevant verification note under `docs/superpowers/verification/` if one appears.
