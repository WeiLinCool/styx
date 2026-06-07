# Workflow Video Model And Quick Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/workflow` use server-authoritative video models, preserve state correctly across forward/back navigation, and replace quick-action page jumps with lightweight in-page dialogs that can apply results back to the workflow.

**Architecture:** Keep server authority unchanged and concentrate the change inside the `/workflow` client surface. Extract pure workflow-state helpers and lightweight dialog/runtime helpers first so the risky reset rules and selection reconciliation are covered by tests before integrating them back into the 900+ line page.

**Tech Stack:** Next.js App Router, React 19, TypeScript, `node:test`, `react-dom/server`, existing agent runtime client helpers.

---

### Task 1: Extract Workflow State Rules Behind Tests

**Files:**
- Create: `src/app/workflow/workflow-state.ts`
- Test: `src/app/workflow/workflow-state.test.ts`
- Modify later: `src/app/workflow/page.tsx`

- [ ] **Step 1: Write the failing state-rule tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyGeneratedReferenceScene,
  createWorkflowVideoModelState,
  resetWorkflowForImageSourceChange,
  resetWorkflowForSceneChange,
  type WorkflowStateSnapshot,
} from './workflow-state';

function makeSnapshot(overrides: Partial<WorkflowStateSnapshot> = {}): WorkflowStateSnapshot {
  return {
    step: 3,
    storyboardGenerated: true,
    storyboardGenerating: false,
    selectedScene: 'workshop',
    customSceneUrl: null,
    aiSceneGenerated: false,
    aiSceneGenerating: false,
    dreaming: true,
    ...overrides,
  };
}

test('createWorkflowVideoModelState preserves a valid selection and falls back to server default', () => {
  assert.deepEqual(
    createWorkflowVideoModelState(
      [
        { id: 'video-a', isDefault: false },
        { id: 'video-b', isDefault: true },
      ],
      'video-a',
    ),
    { selectedModelId: 'video-a', hasModels: true },
  );

  assert.deepEqual(
    createWorkflowVideoModelState(
      [
        { id: 'video-a', isDefault: false },
        { id: 'video-b', isDefault: true },
      ],
      'missing',
    ),
    { selectedModelId: 'video-b', hasModels: true },
  );
});

test('createWorkflowVideoModelState returns empty selection when config has no models', () => {
  assert.deepEqual(createWorkflowVideoModelState([], 'missing'), {
    selectedModelId: null,
    hasModels: false,
  });
});

test('resetWorkflowForImageSourceChange clears downstream progress and returns to upload step', () => {
  assert.deepEqual(resetWorkflowForImageSourceChange(makeSnapshot()), {
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

test('resetWorkflowForSceneChange clears dream state and sends step-three users back to scene step', () => {
  assert.deepEqual(resetWorkflowForSceneChange(makeSnapshot()), {
    step: 2,
    dreaming: false,
  });

  assert.deepEqual(
    resetWorkflowForSceneChange(makeSnapshot({ step: 2, dreaming: false })),
    {
      step: 2,
      dreaming: false,
    },
  );
});

test('applyGeneratedReferenceScene writes custom scene, clears alternate scene state, and reopens scene step', () => {
  assert.deepEqual(
    applyGeneratedReferenceScene(makeSnapshot({ aiSceneGenerated: true }), 'data:image/png;base64,abc'),
    {
      step: 2,
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

Run: `pnpm exec tsx --test src/app/workflow/workflow-state.test.ts`
Expected: FAIL with module-not-found or missing export errors for `workflow-state.ts`.

- [ ] **Step 3: Write minimal state helper implementation**

```ts
type SelectableModel = { id: string; isDefault: boolean };

export type WorkflowStateSnapshot = {
  step: number;
  storyboardGenerated: boolean;
  storyboardGenerating: boolean;
  selectedScene: string | null;
  customSceneUrl: string | null;
  aiSceneGenerated: boolean;
  aiSceneGenerating: boolean;
  dreaming: boolean;
};

export function createWorkflowVideoModelState(
  models: SelectableModel[],
  priorModelId: string | null,
) {
  if (priorModelId && models.some((model) => model.id === priorModelId)) {
    return { selectedModelId: priorModelId, hasModels: true };
  }

  return {
    selectedModelId: models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null,
    hasModels: models.length > 0,
  };
}

export function resetWorkflowForImageSourceChange(_snapshot: WorkflowStateSnapshot) {
  return {
    step: 0,
    storyboardGenerated: false,
    storyboardGenerating: false,
    selectedScene: null,
    customSceneUrl: null,
    aiSceneGenerated: false,
    aiSceneGenerating: false,
    dreaming: false,
  };
}

export function resetWorkflowForSceneChange(snapshot: WorkflowStateSnapshot) {
  return {
    step: snapshot.step >= 3 ? 2 : snapshot.step,
    dreaming: false,
  };
}

export function applyGeneratedReferenceScene(
  snapshot: WorkflowStateSnapshot,
  customSceneUrl: string,
) {
  return {
    step: snapshot.step >= 3 ? 2 : snapshot.step,
    selectedScene: null,
    customSceneUrl,
    aiSceneGenerated: false,
    aiSceneGenerating: false,
    dreaming: false,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test src/app/workflow/workflow-state.test.ts`
Expected: PASS with all workflow state tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/workflow/workflow-state.ts src/app/workflow/workflow-state.test.ts
git commit -m "test: add workflow state helper coverage"
```

### Task 2: Add Quick-Action Runtime Helpers Behind Tests

**Files:**
- Create: `src/app/workflow/workflow-quick-actions.ts`
- Test: `src/app/workflow/workflow-quick-actions.test.ts`
- Modify later: `src/app/workflow/page.tsx`

- [ ] **Step 1: Write the failing quick-action helper tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPromptOptimizationPrompt,
  createReferenceImageDialogState,
  readPromptOptimizationMessage,
} from './workflow-quick-actions';

test('buildPromptOptimizationPrompt wraps the current workflow prompt in assistant instructions', () => {
  assert.match(
    buildPromptOptimizationPrompt('石头印画风格'),
    /请将下面这段 AI 视频工作流提示词优化为更清晰/,
  );
  assert.match(buildPromptOptimizationPrompt('石头印画风格'), /石头印画风格/);
});

test('readPromptOptimizationMessage trims assistant output and falls back to null for empty runs', () => {
  assert.equal(readPromptOptimizationMessage({ finalMessage: '  优化后的提示词  ' }), '优化后的提示词');
  assert.equal(readPromptOptimizationMessage({ finalMessage: '   ' }), null);
});

test('createReferenceImageDialogState blocks use before the scene step and enables use on steps two and three', () => {
  assert.deepEqual(createReferenceImageDialogState(1), {
    disabled: true,
    message: '完成分镜后可生成参考图',
  });
  assert.deepEqual(createReferenceImageDialogState(2), {
    disabled: false,
    message: null,
  });
  assert.deepEqual(createReferenceImageDialogState(3), {
    disabled: false,
    message: null,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/app/workflow/workflow-quick-actions.test.ts`
Expected: FAIL with module-not-found or missing export errors for `workflow-quick-actions.ts`.

- [ ] **Step 3: Write minimal quick-action helper implementation**

```ts
export function buildPromptOptimizationPrompt(currentPrompt: string) {
  return [
    '请将下面这段 AI 视频工作流提示词优化为更清晰、更具体、更适合生成石头印画风格视频的版本。',
    '只返回优化后的提示词正文，不要加解释。',
    '',
    currentPrompt.trim(),
  ].join('\n');
}

export function readPromptOptimizationMessage(input: { finalMessage: string | null }) {
  const message = input.finalMessage?.trim() ?? '';
  return message.length > 0 ? message : null;
}

export function createReferenceImageDialogState(step: number) {
  if (step < 2) {
    return { disabled: true, message: '完成分镜后可生成参考图' };
  }

  return { disabled: false, message: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test src/app/workflow/workflow-quick-actions.test.ts`
Expected: PASS with all helper tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/workflow/workflow-quick-actions.ts src/app/workflow/workflow-quick-actions.test.ts
git commit -m "test: add workflow quick-action helper coverage"
```

### Task 3: Integrate `/workflow` With Real Video Config And Inline Dialogs

**Files:**
- Modify: `src/app/workflow/page.tsx`
- Reuse: `src/features/public/agent-runtime-client.ts`
- Reuse: `src/features/public/model-availability.ts`
- Test: `src/app/workflow/workflow-state.test.ts`
- Test: `src/app/workflow/workflow-quick-actions.test.ts`

- [ ] **Step 1: Write the failing integration-oriented assertions first**

Append these tests before editing `page.tsx`:

```ts
test('createWorkflowVideoModelState falls back to the first model when no default exists', () => {
  assert.deepEqual(
    createWorkflowVideoModelState(
      [
        { id: 'video-a', isDefault: false },
        { id: 'video-b', isDefault: false },
      ],
      null,
    ),
    { selectedModelId: 'video-a', hasModels: true },
  );
});

test('buildPromptOptimizationPrompt preserves the original workflow prompt text', () => {
  const prompt = '保留原始构图';
  assert.match(buildPromptOptimizationPrompt(prompt), /保留原始构图/);
});
```

- [ ] **Step 2: Run the focused tests to verify red state**

Run: `pnpm exec tsx --test src/app/workflow/workflow-state.test.ts src/app/workflow/workflow-quick-actions.test.ts`
Expected: FAIL because the new assertions are not implemented yet.

- [ ] **Step 3: Update `src/app/workflow/page.tsx` with the minimal integration**

Make these concrete changes:

```tsx
import {
  createAgentRun,
  createAgentRunEventsUrl,
  getAgentRunDetail,
  getGeneratedRunArtifactAccess,
  getVideoGenerationConfig,
  listChatModels,
  parseDirectMediaArtifactPayload,
  parseStreamEventPayload,
  selectChatModelId,
  type DirectMediaResultDto,
  type VideoGenerationConfigDto,
  type VideoModelOption,
} from '@/features/public/agent-runtime-client';
import {
  applyGeneratedReferenceScene,
  createWorkflowVideoModelState,
  resetWorkflowForImageSourceChange,
  resetWorkflowForSceneChange,
} from './workflow-state';
import {
  buildPromptOptimizationPrompt,
  createReferenceImageDialogState,
  readPromptOptimizationMessage,
} from './workflow-quick-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
```

Then wire the page to:

- load `getVideoGenerationConfig()` after login/activation checks;
- replace `workflowVideoModels` usage with `videoConfig.models`;
- reconcile `selectedVideoModel` through `createWorkflowVideoModelState`;
- add previous-step buttons on steps 1/2/3;
- use `resetWorkflowForImageSourceChange` when image source changes;
- use `resetWorkflowForSceneChange` when the scene source changes;
- add a prompt optimization dialog that:
  - loads chat models;
  - picks a default with `selectChatModelId`;
  - submits a `taskType: 'chat'` run;
  - polls `getAgentRunDetail` until it gets a `finalMessage`;
  - applies the result only on explicit confirmation;
- add a reference-image dialog that:
  - is gated by `createReferenceImageDialogState(step)`;
  - submits a `taskType: 'image'` run with the current workflow image model;
  - listens to artifact events through `createAgentRunEventsUrl()` and `parseDirectMediaArtifactPayload`;
  - applies the result through `applyGeneratedReferenceScene`.
```

- [ ] **Step 4: Run focused tests to verify green state**

Run: `pnpm exec tsx --test src/app/workflow/workflow-state.test.ts src/app/workflow/workflow-quick-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Run validation and build**

Run: `pnpm validate`
Expected: PASS.

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/workflow/page.tsx src/app/workflow/workflow-state.ts src/app/workflow/workflow-state.test.ts src/app/workflow/workflow-quick-actions.ts src/app/workflow/workflow-quick-actions.test.ts
git commit -m "feat: improve workflow model and quick actions"
```

## Self-Review

Spec coverage:

- Server-authoritative workflow video models: covered by Task 1 selection helpers and Task 3 page integration.
- Forward/back state preservation plus upstream invalidation: covered by Task 1 helper tests and Task 3 page integration.
- Prompt optimization dialog with explicit apply: covered by Task 2 helper tests and Task 3 dialog integration.
- Reference image dialog applying to scene slot: covered by Task 1 scene-apply helper tests and Task 3 dialog integration.

Placeholder scan:

- No `TBD`, `TODO`, or deferred "write tests later" language remains.

Type consistency:

- The plan consistently uses `selectedModelId`, `customSceneUrl`, `finalMessage`, and `VideoGenerationConfigDto`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-07-workflow-video-model-and-quick-actions.md`.

The user has already chosen inline execution in the current branch, so continue in this session using the plan tasks and TDD order.
