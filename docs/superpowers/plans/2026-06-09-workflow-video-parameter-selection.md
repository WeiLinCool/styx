# Workflow Video Parameter Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose membership-allowed video duration and resolution before starting workflow video generation, while preserving model availability from AI model configuration and relying on the existing server-side policy validation.

**Architecture:** The workflow page already loads resolved video generation config from `/api/agent/video-config`, and the run service already validates workflow video selections against membership policy. This change should add local selection state and UI controls in the workflow page, persist those selections in workflow draft state, submit user-selected values instead of defaults, and add targeted tests around both UI-facing parsing/state behavior and existing run-service validation behavior.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node test runner, existing agent runtime client and server run-service modules.

---

## File Map

- Modify: `src/app/workflow/page.tsx`
  - Add selected duration/resolution state.
  - Reconcile local selection with resolved `videoConfig`.
  - Render duration and resolution selectors near the "开始造梦" flow.
  - Submit selected values in workflow run payload.
  - Persist and restore the selections in local draft state.

- Modify: `src/app/workflow/workflow-state.ts`
  - Extend workflow draft parsing/types if needed so duration/resolution selections survive page refresh and restore cleanly.

- Modify: `src/features/public/agent-runtime-client.test.ts`
  - Add or update tests proving video config parsing keeps durations/resolutions/defaults stable for the workflow UI.

- Modify: `src/server/agent/run-service.test.ts`
  - Add targeted tests proving workflow video requests reject membership-disallowed duration/resolution and accept valid user-selected values.

- Modify: `src/server/agent/run-service.ts`
  - Only if needed for copy or a small seam extraction discovered during TDD. Do not change policy semantics unless a test proves a gap.

## Task 1: Lock the runtime parsing contract for workflow parameter selection

**Files:**
- Modify: `src/features/public/agent-runtime-client.test.ts`
- Test: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Write the failing test for parsed workflow video config defaults and options**

Add a focused test near the existing `getVideoGenerationConfig` coverage:

```ts
test('getVideoGenerationConfig preserves workflow duration and resolution options for selection UI', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      enabled: true,
      upgradeRequired: false,
      message: null,
      styles: [{ id: 'style-1', code: 'stone', name: '石纹', prompt: 'stone prompt' }],
      durations: [5, 10],
      resolutions: [
        { value: '720p', label: '720P' },
        { value: '1080p', label: '1080P' },
      ],
      defaults: {
        styleCode: 'stone',
        durationSeconds: 10,
        resolution: '1080p',
      },
      models: [],
      workflowSceneBackgrounds: [],
    });

  try {
    const config = await getVideoGenerationConfig();
    assert.deepEqual(config.durations, [5, 10]);
    assert.deepEqual(config.resolutions, [
      { value: '720p', label: '720P' },
      { value: '1080p', label: '1080P' },
    ]);
    assert.deepEqual(config.defaults, {
      styleCode: 'stone',
      durationSeconds: 10,
      resolution: '1080p',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the targeted parsing test and verify the starting point**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected:
- PASS if equivalent coverage already exists.
- If it fails, the failure should point to the exact parsing mismatch that the workflow page would otherwise inherit.

- [ ] **Step 3: Make the minimal test-only or parser fix if the new assertion reveals a gap**

If the parser drops defaults or option arrays, update the parsing branch in `src/features/public/agent-runtime-client.ts` around the `getVideoGenerationConfig` response normalization so it returns:

```ts
defaults: {
  styleCode: typeof defaults.styleCode === 'string' ? defaults.styleCode : null,
  durationSeconds:
    typeof defaults.durationSeconds === 'number' &&
    Number.isInteger(defaults.durationSeconds) &&
    defaults.durationSeconds > 0
      ? defaults.durationSeconds
      : null,
  resolution: typeof defaults.resolution === 'string' ? defaults.resolution : null,
},
```

Do not expand scope beyond keeping the existing DTO contract stable for the workflow page.

- [ ] **Step 4: Re-run the parsing test**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected:
- PASS for the new workflow parameter config test.

- [ ] **Step 5: Commit the parsing contract update**

```bash
git add src/features/public/agent-runtime-client.test.ts src/features/public/agent-runtime-client.ts
git commit -m "test: lock workflow video config parsing"
```

## Task 2: Add workflow page duration and resolution selection state

**Files:**
- Modify: `src/app/workflow/page.tsx`
- Modify: `src/app/workflow/workflow-state.ts`
- Test: `src/app/workflow/workflow-state.test.ts` if a draft parser change is needed

- [ ] **Step 1: Write the failing state/draft test if workflow draft parsing needs new fields**

If `parseWorkflowDraftSnapshot` currently excludes duration/resolution selections, add a focused test like:

```ts
test('parseWorkflowDraftSnapshot preserves selected video duration and resolution', () => {
  const parsed = parseWorkflowDraftSnapshot({
    version: 1,
    step: 2,
    prompt: 'stone video',
    selectedVideoModel: 'model-video',
    selectedDurationSeconds: 10,
    selectedResolution: '1080p',
  });

  assert.equal(parsed?.selectedDurationSeconds, 10);
  assert.equal(parsed?.selectedResolution, '1080p');
});
```

Skip this step only if `workflow-state.ts` already has a generic field passthrough that makes the test unnecessary.

- [ ] **Step 2: Run the targeted workflow-state test if you added one**

Run:

```bash
pnpm exec tsx --test src/app/workflow/workflow-state.test.ts
```

Expected:
- FAIL if the draft parser does not yet carry the new fields.

- [ ] **Step 3: Update workflow draft types and parsing to carry selection state**

In `src/app/workflow/workflow-state.ts`, extend the draft snapshot types and parser with the two new optional fields:

```ts
selectedDurationSeconds: number | null;
selectedResolution: string | null;
```

Use the existing parsing helpers and mirror the current style for nullable persisted values:

```ts
selectedDurationSeconds: readPositiveInteger(value.selectedDurationSeconds),
selectedResolution: readString(value.selectedResolution),
```

- [ ] **Step 4: Add local selection state and config reconciliation in `page.tsx`**

Add local state near the existing video model state:

```ts
const [selectedDurationSeconds, setSelectedDurationSeconds] = useState<number | null>(null);
const [selectedResolution, setSelectedResolution] = useState<string | null>(null);
```

When hydrating draft state, restore them:

```ts
setSelectedDurationSeconds(draft.selectedDurationSeconds);
setSelectedResolution(draft.selectedResolution);
```

When persisting draft state, include them:

```ts
selectedDurationSeconds,
selectedResolution,
```

Add a reconciliation `useEffect` after `videoConfig` is loaded so local selection stays valid:

```ts
useEffect(() => {
  if (!videoConfig.enabled) {
    setSelectedDurationSeconds(null);
    setSelectedResolution(null);
    return;
  }

  setSelectedDurationSeconds((current) =>
    current !== null && videoConfig.durations.includes(current)
      ? current
      : videoConfig.defaults.durationSeconds
  );

  setSelectedResolution((current) =>
    current && videoConfig.resolutions.some((item) => item.value === current)
      ? current
      : videoConfig.defaults.resolution
  );
}, [
  videoConfig.enabled,
  videoConfig.durations,
  videoConfig.resolutions,
  videoConfig.defaults.durationSeconds,
  videoConfig.defaults.resolution,
]);
```

Keep this effect narrow: it should only reconcile workflow parameter selections, not reset unrelated workflow progress.

- [ ] **Step 5: Re-run targeted workflow-state tests if changed**

Run:

```bash
pnpm exec tsx --test src/app/workflow/workflow-state.test.ts
```

Expected:
- PASS for any new draft parsing coverage.

- [ ] **Step 6: Commit the workflow selection state work**

```bash
git add src/app/workflow/page.tsx src/app/workflow/workflow-state.ts src/app/workflow/workflow-state.test.ts
git commit -m "feat: persist workflow video parameter selections"
```

## Task 3: Render workflow selectors and submit user-selected parameters

**Files:**
- Modify: `src/app/workflow/page.tsx`

- [ ] **Step 1: Add the failing UI-behavior assertions in the nearest practical test file if an existing test harness supports it**

If `src/app/workflow/` already has a lightweight render test harness you can extend, add assertions for:
- default selected duration from `videoConfig.defaults.durationSeconds`
- default selected resolution from `videoConfig.defaults.resolution`
- single-option disabled rendering

If there is no workable render harness for this page without building a large fixture, explicitly skip a new page-level component test and rely on:
- parser/state tests from Tasks 1-2
- server validation tests from Task 4
- manual browser verification in Task 5

This is an allowed choice because `page.tsx` is already a large stateful client file and the repo does not currently expose a dedicated page-level test seam for this screen.

- [ ] **Step 2: Add a compact selector UI block to the workflow page**

In the right-side panel shown for `step === 2 || step === 3`, add a new card before or after the model selector with:

```tsx
<div className="rounded-2xl border border-border bg-card/80 backdrop-blur-md p-5">
  <p className="mb-3 text-sm font-medium text-foreground">视频参数</p>
  <div className="grid gap-4 md:grid-cols-2">
    <label className="space-y-2">
      <span className="text-xs text-muted-foreground">视频时长</span>
      <select
        value={selectedDurationSeconds ?? ''}
        disabled={videoConfig.durations.length <= 1}
        onChange={(event) => {
          setSelectedDurationSeconds(Number(event.target.value));
          clearRuntimeFeedback();
        }}
        className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {videoConfig.durations.map((duration) => (
          <option key={duration} value={duration}>
            {duration} 秒
          </option>
        ))}
      </select>
    </label>
    <label className="space-y-2">
      <span className="text-xs text-muted-foreground">分辨率</span>
      <select
        value={selectedResolution ?? ''}
        disabled={videoConfig.resolutions.length <= 1}
        onChange={(event) => {
          setSelectedResolution(event.target.value);
          clearRuntimeFeedback();
        }}
        className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {videoConfig.resolutions.map((resolution) => (
          <option key={resolution.value} value={resolution.value}>
            {resolution.label}
          </option>
        ))}
      </select>
    </label>
  </div>
</div>
```

Keep the controls visible even when only one option exists. Disabled state is required by the spec.

- [ ] **Step 3: Wire the selected values into `handleStartDream`**

Replace the current workflow run payload defaults:

```ts
durationSeconds: videoConfig.defaults.durationSeconds ?? 5,
resolution: videoConfig.defaults.resolution ?? '720p',
styleCode: videoConfig.defaults.styleCode ?? undefined,
```

With user-selected values plus a safe resolved fallback:

```ts
const resolvedDurationSeconds =
  selectedDurationSeconds ?? videoConfig.defaults.durationSeconds;
const resolvedResolution =
  selectedResolution ?? videoConfig.defaults.resolution;

if (!resolvedDurationSeconds || !resolvedResolution) {
  setRuntimeError('当前会员方案的视频参数配置不完整，请稍后再试。');
  setDreaming(false);
  return;
}
```

Then submit:

```ts
durationSeconds: resolvedDurationSeconds,
resolution: resolvedResolution,
styleCode: videoConfig.defaults.styleCode ?? undefined,
```

Do not reintroduce hardcoded `5` or `720p` values in the workflow path.

- [ ] **Step 4: Reconcile restored selections when moving between workflow steps**

Review handlers that intentionally reset workflow material state:
- `handlePatternUpload`
- `handleSelectImageModel`
- scene reset helpers

Do not clear `selectedDurationSeconds` or `selectedResolution` in those flows unless the new `videoConfig` makes them invalid. The selector choice is part of the user’s generation preference, not material ownership.

- [ ] **Step 5: Run focused type-safe coverage on the workflow page**

Run:

```bash
pnpm validate
```

Expected:
- PASS for lint/type checks.
- If it fails, the failure should be limited to the new workflow selection state or JSX wiring.

- [ ] **Step 6: Commit the workflow UI submission wiring**

```bash
git add src/app/workflow/page.tsx
git commit -m "feat: add workflow video parameter selectors"
```

## Task 4: Prove existing server-side workflow validation covers user selections

**Files:**
- Modify: `src/server/agent/run-service.test.ts`
- Modify: `src/server/agent/run-service.ts` only if test failure reveals a genuine gap

- [ ] **Step 1: Add a failing test for membership-disallowed workflow duration**

Add a focused run-service test near existing workflow video coverage:

```ts
test('workflow video rejects duration outside membership policy', async () => {
  const service = createRunServiceForWorkflowVideo({
    policy: {
      enabled: true,
      upgradeRequired: false,
      message: null,
      styles: [{ id: 'style-1', code: 'stone', name: '石纹', prompt: 'prompt', enabled: true, sortOrder: 1 }],
      durations: [5],
      resolutions: [{ value: '720p', label: '720P' }],
      defaults: { styleCode: 'stone', durationSeconds: 5, resolution: '720p' },
    },
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'workflow',
        prompt: '生成工作流视频',
        input: {
          stage: 'workflow_video',
          modelId: 'model-video',
          sourceImageAssetId: 'asset-source',
          storyboardArtifactId: 'asset-storyboard',
          sceneBackgroundId: 'wood-table-handmade-1',
          origin: 'https://app.example',
          durationSeconds: 10,
          resolution: '720p',
        },
      }),
    (error) =>
      error instanceof AgentRunVideoSelectionError &&
      error.code === 'invalid_request' &&
      error.message === 'The selected video duration is not available.',
  );
});
```

Use the local test factory/patterns already present in `run-service.test.ts`; do not invent a separate helper library.

- [ ] **Step 2: Add a failing test for membership-disallowed workflow resolution**

Add a sibling test:

```ts
test('workflow video rejects resolution outside membership policy', async () => {
  // same setup shape as above
  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'workflow',
        prompt: '生成工作流视频',
        input: {
          stage: 'workflow_video',
          modelId: 'model-video',
          sourceImageAssetId: 'asset-source',
          storyboardArtifactId: 'asset-storyboard',
          sceneBackgroundId: 'wood-table-handmade-1',
          origin: 'https://app.example',
          durationSeconds: 5,
          resolution: '1080p',
        },
      }),
    (error) =>
      error instanceof AgentRunVideoSelectionError &&
      error.code === 'invalid_request' &&
      error.message === 'The selected video resolution is not available.',
  );
});
```

- [ ] **Step 3: Run the targeted run-service test file**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected:
- PASS if current server validation already behaves correctly.
- If it fails, inspect the workflow-video branch around `validateVideoGenerationSelection` before editing any callers.

- [ ] **Step 4: Apply the minimal server fix only if the new tests expose a real gap**

If the tests fail, patch `src/server/agent/run-service.ts` in the workflow-video path so it continues to resolve:

```ts
const selection = validateVideoGenerationSelection({
  policy,
  selection: {
    styleCode: selectedStyleCode,
    durationSeconds,
    resolution,
  },
});
```

And throws:

```ts
throw new AgentRunVideoSelectionError({
  code: selection.code === 'policy_disabled' ? 'forbidden' : 'invalid_request',
  message: selection.message,
});
```

Do not add duplicate validation elsewhere if this branch is already correct.

- [ ] **Step 5: Re-run the targeted run-service tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected:
- PASS for the new workflow policy validation coverage.

- [ ] **Step 6: Commit the validation coverage**

```bash
git add src/server/agent/run-service.test.ts src/server/agent/run-service.ts
git commit -m "test: cover workflow video membership parameter validation"
```

## Task 5: Final verification and browser check

**Files:**
- Modify: `src/app/workflow/page.tsx`
- Modify: `src/app/workflow/workflow-state.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`
- Modify: `src/server/agent/run-service.test.ts`
- Optional Modify: `src/server/agent/run-service.ts`

- [ ] **Step 1: Run the focused automated checks**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
pnpm exec tsx --test src/app/workflow/workflow-state.test.ts
pnpm exec tsx --test src/server/agent/run-service.test.ts
pnpm validate
```

Expected:
- PASS on all targeted suites and repository validation.

- [ ] **Step 2: Run a production-safety build**

Run:

```bash
pnpm build
```

Expected:
- PASS with no type/runtime wiring regressions in the workflow page or agent API surfaces.

- [ ] **Step 3: Verify the workflow page in the browser**

Run the local app and inspect `/workflow` with an authenticated account that has video generation enabled.

Manual checklist:
- duration selector appears in step 2/3 parameter area
- resolution selector appears in step 2/3 parameter area
- defaults are preselected from membership config
- a single available option renders visible but disabled
- changing the selector updates the submitted run instead of silently reverting to defaults
- model selector still follows AI model availability, independently of membership plan

If browser verification is blocked by local auth/data setup, record the exact blocker in the handoff.

- [ ] **Step 4: Commit the verified implementation**

```bash
git add src/app/workflow/page.tsx src/app/workflow/workflow-state.ts src/features/public/agent-runtime-client.test.ts src/server/agent/run-service.test.ts src/server/agent/run-service.ts
git commit -m "feat: support workflow video duration and resolution selection"
```

## Self-Review

- Spec coverage: covered UI selectors, default initialization, disabled single-option rendering, user-selected submission values, persisted draft restoration, and server validation coverage.
- Placeholder scan: no `TODO`/`TBD` placeholders remain; conditional branches explicitly state when a test seam may be skipped and what verification replaces it.
- Type consistency: `selectedDurationSeconds` and `selectedResolution` are used consistently across draft persistence, page state, and submission flow; server coverage continues to assert `durationSeconds` / `resolution` / `styleCode` names already used in the runtime.
