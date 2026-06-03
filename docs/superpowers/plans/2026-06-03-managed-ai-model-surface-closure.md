# Managed AI Model Surface Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/chat`, `/image-gen`, and `/video-gen` read model availability from admin-configured model APIs and enter a consistent maintenance state when no user-available models exist.

**Architecture:** Keep server-side model list routes as the only source of truth, add a small public-side model availability helper for state reconciliation, and update each interactive page to render unauthenticated, loading, ready, and maintenance states consistently. Reuse existing `agent-runtime-client` fetch contracts and page-local submit handlers, but remove any static model availability assumptions from product surfaces.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, `node:test`, existing public runtime client helpers

---

### Task 1: Add Shared Availability Helpers And Runtime Client Coverage

**Files:**
- Create: `src/features/public/model-availability.ts`
- Test: `src/features/public/model-availability.test.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Write the failing helper tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUnavailableModelMessage,
  createInitialModelAvailabilityState,
  reconcileSelectedModelId,
} from './model-availability';

test('reconcileSelectedModelId keeps a valid prior selection', () => {
  const models = [
    { id: 'a', isDefault: false },
    { id: 'b', isDefault: true },
  ];

  assert.equal(reconcileSelectedModelId(models, 'a'), 'a');
});

test('reconcileSelectedModelId falls back to default then first item', () => {
  assert.equal(
    reconcileSelectedModelId(
      [
        { id: 'a', isDefault: false },
        { id: 'b', isDefault: true },
      ],
      'missing',
    ),
    'b',
  );
  assert.equal(reconcileSelectedModelId([{ id: 'a', isDefault: false }], null), 'a');
  assert.equal(reconcileSelectedModelId([], null), null);
});

test('createInitialModelAvailabilityState starts unauthenticated and empty', () => {
  assert.deepEqual(createInitialModelAvailabilityState(), {
    status: 'unauthenticated',
    message: '登录后查看可用模型',
    reloadKey: 0,
  });
});

test('buildUnavailableModelMessage returns maintenance copy', () => {
  assert.equal(buildUnavailableModelMessage(), '功能不可用，正在维护');
});
```

- [ ] **Step 2: Run the new helper test file and verify it fails**

Run: `pnpm exec tsx --test src/features/public/model-availability.test.ts`

Expected: FAIL with `Cannot find module './model-availability'` or missing export errors.

- [ ] **Step 3: Implement the shared helper module**

```ts
export type SelectableModel = {
  id: string;
  isDefault: boolean;
};

export type ModelAvailabilityStatus =
  | 'unauthenticated'
  | 'loading'
  | 'ready'
  | 'maintenance';

export type ModelAvailabilityState = {
  status: ModelAvailabilityStatus;
  message: string | null;
  reloadKey: number;
};

export function buildUnavailableModelMessage() {
  return '功能不可用，正在维护';
}

export function createInitialModelAvailabilityState(): ModelAvailabilityState {
  return {
    status: 'unauthenticated',
    message: '登录后查看可用模型',
    reloadKey: 0,
  };
}

export function reconcileSelectedModelId<T extends SelectableModel>(
  models: T[],
  priorModelId?: string | null,
) {
  if (priorModelId && models.some((model) => model.id === priorModelId)) {
    return priorModelId;
  }

  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

export function nextReloadKey(current: number) {
  return current + 1;
}
```

- [ ] **Step 4: Extend runtime client tests for empty list and video parsing behavior**

```ts
test('listVideoModels returns empty array for an empty payload', async () => {
  const restore = installFetchMock({ models: [] });

  try {
    const models = await listVideoModels();
    assert.deepEqual(models, []);
  } finally {
    restore();
  }
});

test('listChatModels drops malformed model rows', async () => {
  const restore = installFetchMock({
    models: [
      { id: 'broken' },
      {
        id: 'model-1',
        code: 'chat-1',
        name: 'Chat One',
        providerName: 'Development',
        isDefault: true,
        entitlementLabel: 'Free',
        pricingSummary: '1 credit minimum',
      },
    ],
  });

  try {
    const models = await listChatModels();
    assert.deepEqual(models.map((model) => model.id), ['model-1']);
  } finally {
    restore();
  }
});
```

- [ ] **Step 5: Run the focused public helper tests and commit**

Run: `pnpm exec tsx --test src/features/public/model-availability.test.ts src/features/public/agent-runtime-client.test.ts`

Expected: PASS

```bash
git add src/features/public/model-availability.ts src/features/public/model-availability.test.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: add public model availability helpers"
```

### Task 2: Update `/chat` To Use Managed Availability States

**Files:**
- Modify: `src/app/chat/page.tsx`
- Modify: `src/features/public/agent-runtime-client.ts`
- Test: `src/features/public/model-availability.test.ts`

- [ ] **Step 1: Write a failing state helper test for chat-style reload reconciliation**

```ts
test('reconcileSelectedModelId switches to default when the previous chat model disappears', () => {
  const models = [
    { id: 'chat-free', isDefault: false },
    { id: 'chat-pro', isDefault: true },
  ];

  assert.equal(reconcileSelectedModelId(models, 'missing-chat-model'), 'chat-pro');
});
```

- [ ] **Step 2: Run the targeted helper test and verify it fails before the helper update is wired**

Run: `pnpm exec tsx --test src/features/public/model-availability.test.ts --test-name-pattern "previous chat model disappears"`

Expected: FAIL if the test has not yet been added, then PASS after the test file is updated in Task 1.

- [ ] **Step 3: Refactor chat page model loading to use explicit availability status**

```ts
const [modelAvailability, setModelAvailability] = useState(createInitialModelAvailabilityState());

useEffect(() => {
  if (!isLoggedIn || !user || requiresActivation(user)) {
    setChatModels([]);
    setSelectedModelId(null);
    setModelAvailability(createInitialModelAvailabilityState());
    return;
  }

  let cancelled = false;

  async function loadChatState() {
    setModelAvailability((current) => ({
      ...current,
      status: 'loading',
      message: null,
    }));

    try {
      const [models, runs] = await Promise.all([listChatModels(), listAgentRuns()]);
      if (cancelled) return;

      const storedModelId =
        typeof window === 'undefined' ? null : window.localStorage.getItem(chatModelSelectionStorageKey);
      const nextModelId = reconcileSelectedModelId(models, storedModelId);

      setChatModels(models);
      setSelectedModelId(nextModelId);

      if (models.length === 0) {
        setModelAvailability((current) => ({
          ...current,
          status: 'maintenance',
          message: buildUnavailableModelMessage(),
        }));
        setRecentRuns([]);
        setMessages([]);
        return;
      }

      setModelAvailability((current) => ({
        ...current,
        status: 'ready',
        message: null,
      }));

      // Keep existing run-loading logic here.
    } catch {
      if (cancelled) return;
      setChatModels([]);
      setSelectedModelId(null);
      setRecentRuns([]);
      setMessages([]);
      setModelAvailability((current) => ({
        ...current,
        status: 'maintenance',
        message: buildUnavailableModelMessage(),
      }));
    }
  }

  void loadChatState();
  return () => {
    cancelled = true;
  };
}, [isLoggedIn, user, modelAvailability.reloadKey]);
```

- [ ] **Step 4: Add chat maintenance copy, reload action, and submit guard**

```tsx
const submitDisabledReason = !isLoggedIn
  ? null
  : !user || requiresActivation(user)
    ? '账号激活后可使用'
    : modelAvailability.status === 'loading'
      ? '模型列表加载中'
      : modelAvailability.status === 'maintenance'
        ? buildUnavailableModelMessage()
        : !selectedModelId
          ? buildUnavailableModelMessage()
          : null;

if (!selectedModelId) {
  setErrorMessage(
    modelAvailability.status === 'loading'
      ? '模型列表加载中'
      : buildUnavailableModelMessage(),
  );
  return;
}

{!isLoggedIn ? (
  <p className="text-xs text-[#6e6e73]">登录后查看可用模型</p>
) : modelAvailability.status === 'maintenance' ? (
  <div className="flex items-center gap-3">
    <p className="text-xs text-[#6e6e73]">{buildUnavailableModelMessage()}</p>
    <button
      type="button"
      onClick={() =>
        setModelAvailability((current) => ({ ...current, reloadKey: nextReloadKey(current.reloadKey) }))
      }
      className="text-xs font-medium text-[#1d1d1f]"
    >
      重新加载模型
    </button>
  </div>
) : null}
```

- [ ] **Step 5: Run focused checks for chat-related public helpers and commit**

Run: `pnpm exec tsx --test src/features/public/model-availability.test.ts src/features/public/agent-runtime-client.test.ts`

Expected: PASS

```bash
git add src/app/chat/page.tsx src/features/public/agent-runtime-client.ts src/features/public/model-availability.test.ts
git commit -m "feat: wire managed chat model availability"
```

### Task 3: Update `/image-gen` To Use Managed Availability States Across Modes

**Files:**
- Modify: `src/app/image-gen/page.tsx`
- Modify: `src/features/public/model-availability.ts`
- Test: `src/features/public/model-availability.test.ts`

- [ ] **Step 1: Write failing mode-aware helper tests for per-mode reload and selection fallback**

```ts
test('reconcileSelectedModelId returns null when an image mode has no available models', () => {
  assert.equal(reconcileSelectedModelId([], 'missing-image-model'), null);
});

test('buildUnavailableModelMessage is reused for image maintenance state', () => {
  assert.equal(buildUnavailableModelMessage(), '功能不可用，正在维护');
});
```

- [ ] **Step 2: Run the helper tests and verify the expected behavior is covered**

Run: `pnpm exec tsx --test src/features/public/model-availability.test.ts --test-name-pattern "image mode|maintenance state"`

Expected: PASS after helper coverage is in place.

- [ ] **Step 3: Add explicit unauthenticated/loading/maintenance handling for each image mode**

```ts
const [modeAvailability, setModeAvailability] = useState<Record<ImageModelMode, ModelAvailabilityState>>({
  generate: createInitialModelAvailabilityState(),
  edit: createInitialModelAvailabilityState(),
  upscale: createInitialModelAvailabilityState(),
});

useEffect(() => {
  if (!isLoggedIn || !user || requiresActivation(user)) {
    setModelsByMode({ generate: [], edit: [], upscale: [] });
    setSelectedModelsByMode({ generate: null, edit: null, upscale: null });
    setModeAvailability({
      generate: createInitialModelAvailabilityState(),
      edit: createInitialModelAvailabilityState(),
      upscale: createInitialModelAvailabilityState(),
    });
    return;
  }

  let cancelled = false;

  async function loadModelsForMode() {
    setModeAvailability((current) => ({
      ...current,
      [activeMode]: { ...current[activeMode], status: 'loading', message: null },
    }));

    try {
      const models = await listImageModels(activeMode);
      if (cancelled) return;

      const nextModelId = reconcileSelectedModelId(models, selectedModelsByMode[activeMode]);
      setModelsByMode((current) => ({ ...current, [activeMode]: models }));
      setSelectedModelsByMode((current) => ({ ...current, [activeMode]: nextModelId }));
      setModeAvailability((current) => ({
        ...current,
        [activeMode]: {
          ...current[activeMode],
          status: models.length > 0 ? 'ready' : 'maintenance',
          message: models.length > 0 ? null : buildUnavailableModelMessage(),
        },
      }));
    } catch {
      if (cancelled) return;
      setModelsByMode((current) => ({ ...current, [activeMode]: [] }));
      setSelectedModelsByMode((current) => ({ ...current, [activeMode]: null }));
      setModeAvailability((current) => ({
        ...current,
        [activeMode]: {
          ...current[activeMode],
          status: 'maintenance',
          message: buildUnavailableModelMessage(),
        },
      }));
    }
  }

  void loadModelsForMode();
  return () => {
    cancelled = true;
  };
}, [activeMode, isLoggedIn, user, modeAvailability[activeMode].reloadKey]);
```

- [ ] **Step 4: Update image page UI copy, reload button, and submit guard**

```tsx
const activeAvailability = modeAvailability[activeMode];

const submitDisabledReason = !isLoggedIn
  ? null
  : !user || requiresActivation(user)
    ? '账号激活后可使用'
    : activeAvailability.status === 'loading'
      ? '模型列表加载中'
      : activeAvailability.status === 'maintenance'
        ? buildUnavailableModelMessage()
        : !selectedModelId
          ? buildUnavailableModelMessage()
          : (activeMode === 'upscale' || activeMode === 'edit') && !activeSourceImage
            ? '请先上传原图'
            : null;

<ModelOptions
  models={activeModels}
  selectedModelId={selectedModelId}
  loading={activeAvailability.status === 'loading'}
  error={activeAvailability.status === 'maintenance' ? buildUnavailableModelMessage() : null}
  onSelect={handleModelSelect}
/>

{isLoggedIn && activeAvailability.status === 'maintenance' ? (
  <button
    type="button"
    onClick={() =>
      setModeAvailability((current) => ({
        ...current,
        [activeMode]: {
          ...current[activeMode],
          reloadKey: nextReloadKey(current[activeMode].reloadKey),
        },
      }))
    }
    className="text-xs font-medium text-[#1d1d1f]"
  >
    重新加载模型
  </button>
) : null}
```

- [ ] **Step 5: Run focused checks and commit**

Run: `pnpm exec tsx --test src/features/public/model-availability.test.ts src/features/public/agent-runtime-client.test.ts`

Expected: PASS

```bash
git add src/app/image-gen/page.tsx src/features/public/model-availability.ts src/features/public/model-availability.test.ts
git commit -m "feat: wire managed image model availability"
```

### Task 4: Update `/video-gen` To Remove Static Model Availability

**Files:**
- Modify: `src/app/video-gen/page.tsx`
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/tool-data.ts`
- Test: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Write a failing runtime test for video model selection fallback**

```ts
test('selectChatModelId can be reused for video models with default fallback', () => {
  const models = [
    {
      id: 'video-fast',
      code: 'video-fast',
      name: 'Fast',
      providerName: 'Doubao',
      isDefault: false,
      entitlementLabel: 'Free',
      pricingSummary: '3 credits minimum',
    },
    {
      id: 'video-default',
      code: 'video-default',
      name: 'Default',
      providerName: 'Doubao',
      isDefault: true,
      entitlementLabel: 'Free',
      pricingSummary: '5 credits minimum',
    },
  ];

  assert.equal(selectChatModelId(models, 'missing-video-model'), 'video-default');
});
```

- [ ] **Step 2: Run the focused runtime tests**

Run: `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts --test-name-pattern "video models|default fallback"`

Expected: PASS after the test is present.

- [ ] **Step 3: Replace static `videoModels` with fetched managed models and maintenance state**

```ts
const [videoModels, setVideoModels] = useState<VideoModelOption[]>([]);
const [selectedModel, setSelectedModel] = useState<string | null>(null);
const [modelAvailability, setModelAvailability] = useState(createInitialModelAvailabilityState());

useEffect(() => {
  if (!isLoggedIn || !user || requiresActivation(user)) {
    setVideoModels([]);
    setSelectedModel(null);
    setModelAvailability(createInitialModelAvailabilityState());
    return;
  }

  let cancelled = false;

  async function loadVideoModels() {
    setModelAvailability((current) => ({ ...current, status: 'loading', message: null }));

    try {
      const models = await listVideoModels();
      if (cancelled) return;

      const nextModelId = reconcileSelectedModelId(models, selectedModel);
      setVideoModels(models);
      setSelectedModel(nextModelId);
      setModelAvailability((current) => ({
        ...current,
        status: models.length > 0 ? 'ready' : 'maintenance',
        message: models.length > 0 ? null : buildUnavailableModelMessage(),
      }));
    } catch {
      if (cancelled) return;
      setVideoModels([]);
      setSelectedModel(null);
      setModelAvailability((current) => ({
        ...current,
        status: 'maintenance',
        message: buildUnavailableModelMessage(),
      }));
    }
  }

  void loadVideoModels();
  return () => {
    cancelled = true;
  };
}, [isLoggedIn, user, modelAvailability.reloadKey]);
```

- [ ] **Step 4: Update video UI to render login placeholder, maintenance state, reload action, and disabled submit**

```tsx
{!isLoggedIn ? (
  <div className="rounded-xl border border-dashed border-black/8 px-4 py-4 text-sm text-[#6e6e73]">
    登录后查看可用模型
  </div>
) : modelAvailability.status === 'maintenance' ? (
  <div className="space-y-3 rounded-xl border border-dashed border-black/8 px-4 py-4">
    <p className="text-sm text-[#6e6e73]">{buildUnavailableModelMessage()}</p>
    <button
      type="button"
      onClick={() =>
        setModelAvailability((current) => ({ ...current, reloadKey: nextReloadKey(current.reloadKey) }))
      }
      className="text-xs font-medium text-[#1d1d1f]"
    >
      重新加载模型
    </button>
  </div>
) : (
  videoModels.map((model) => (
    <button key={model.id} onClick={() => setSelectedModel(model.id)}>
      {model.name}
    </button>
  ))
)}

if (!selectedModel) {
  setGenerationError(
    modelAvailability.status === 'loading'
      ? '模型列表加载中'
      : buildUnavailableModelMessage(),
  );
  return;
}
```

- [ ] **Step 5: Remove unused static video model catalog export and commit**

```ts
// In src/features/public/tool-data.ts remove:
export const videoModels = [
  // ...
];
```

Run: `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts src/features/public/model-availability.test.ts`

Expected: PASS

```bash
git add src/app/video-gen/page.tsx src/features/public/agent-runtime-client.ts src/features/public/tool-data.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: wire managed video model availability"
```

### Task 5: Repository Validation And Browser Verification

**Files:**
- Verify only: `src/app/chat/page.tsx`
- Verify only: `src/app/image-gen/page.tsx`
- Verify only: `src/app/video-gen/page.tsx`
- Verify only: `src/features/public/model-availability.ts`

- [ ] **Step 1: Run the focused unit test suite**

Run: `pnpm exec tsx --test src/features/public/model-availability.test.ts src/features/public/agent-runtime-client.test.ts`

Expected: PASS

- [ ] **Step 2: Run repository validation**

Run: `pnpm validate`

Expected: PASS with `ts-check` and `lint:build` both succeeding.

- [ ] **Step 3: Run a production wiring check**

Run: `pnpm build`

Expected: PASS with Next.js build completing successfully.

- [ ] **Step 4: Verify browser behavior on the three AI pages**

Run: `pnpm dev` or `pnpm dev:pw`

Expected checks:
- `/chat` while logged out shows `登录后查看可用模型`
- `/image-gen` while logged out shows `登录后查看可用模型`
- `/video-gen` while logged out shows `登录后查看可用模型`
- Logged-in page with empty model response shows `功能不可用，正在维护`
- `重新加载模型` recovers the page without a full browser refresh when models become available

- [ ] **Step 5: Commit final verification-safe adjustments**

```bash
git add src/app/chat/page.tsx src/app/image-gen/page.tsx src/app/video-gen/page.tsx src/features/public/model-availability.ts src/features/public/model-availability.test.ts src/features/public/agent-runtime-client.test.ts src/features/public/tool-data.ts
git commit -m "feat: close managed ai model surface loop"
```
