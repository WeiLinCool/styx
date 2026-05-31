# Transient Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the `/image-gen` AI生图 MVP so generated image media is returned transiently for immediate preview/download while persisted run/artifact records keep only safe summaries.

**Architecture:** Keep `/api/agent/runs` as the entrypoint and keep durable `agent_runs` records for traceability. Add a transient artifact response channel owned by the agent run service, sanitize generated media before repository persistence, and update the image page to render/download current-session media with a clear save warning.

**Tech Stack:** Next.js App Router, React 19 client components, TypeScript, Node test runner via `pnpm exec tsx --test`, existing Drizzle-backed agent run repository, Tailwind CSS.

---

## File Structure

- Modify `src/server/agent/types.ts`: add `TransientAgentArtifactDto` and `CreateAgentRunResult` shared DTO types.
- Modify `src/server/agent/pi-runtime.ts`: let the deterministic image runtime return a mock transient image payload plus a summary artifact with no durable media content.
- Modify `src/server/agent/run-service.ts`: return `{ run, transientArtifacts }` from `createAndRunAgentRun`, split transient media from durable summaries, and keep chat behavior API-compatible through wrappers.
- Modify `src/server/agent/run-service.test.ts`: add failing service tests for transient image payloads and sanitized persisted artifacts.
- Modify `src/app/api/agent/runs/route.ts`: return the full service result while preserving `run` for existing consumers.
- Modify `src/app/api/agent/runs/route.test.ts`: add contract-level response helper test for transient artifacts.
- Modify `src/features/public/agent-runtime-client.ts`: update `createAgentRun` to return `CreateAgentRunResult` and export a download helper.
- Modify `src/features/public/agent-runtime-client.test.ts`: add client parser/return-shape test.
- Modify `src/app/image-gen/page.tsx`: render generated image, download action, copy prompt action, and the warning copy. Keep `hd-fix` and `style-transfer` out of the transient generation path.
- Add `docs/superpowers/verification/2026-05-31-transient-image-generation-verification.md`: record final verification evidence.

## Task 1: Service Contract And Persistence Sanitization

**Files:**
- Modify: `src/server/agent/types.ts`
- Modify: `src/server/agent/pi-runtime.ts`
- Modify: `src/server/agent/run-service.ts`
- Test: `src/server/agent/run-service.test.ts`

- [ ] **Step 1: Write the failing service test**

Add this test near the existing image runtime tests in `src/server/agent/run-service.test.ts`:

```ts
test('createAndRunAgentRun returns transient image artifact while persisting only summary data', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        return {
          finalMessage: '图片已生成，请及时下载保存。',
          artifacts: [
            {
              kind: 'image',
              title: '生成图片',
              body: 'data:image/png;base64,SHOULD_NOT_PERSIST',
              url: 'https://provider.example/generated.png',
              metadata: {
                mimeType: 'image/png',
                width: 1024,
                height: 1024,
              },
            },
          ],
        };
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '一只戴红围巾的小猫石头印画',
    input: { mode: 'generate', size: '1:1' },
  });

  assert.equal(result.run.status, 'succeeded');
  assert.equal(result.run.artifacts.length, 1);
  assert.equal(result.run.artifacts[0]?.kind, 'image');
  assert.equal(result.run.artifacts[0]?.body, null);
  assert.equal(result.run.artifacts[0]?.url, null);
  assert.equal(result.run.artifacts[0]?.metadata.transient, true);
  assert.equal(result.run.artifacts[0]?.metadata.mimeType, 'image/png');
  assert.equal(result.transientArtifacts.length, 1);
  assert.equal(result.transientArtifacts[0]?.kind, 'image');
  assert.equal(result.transientArtifacts[0]?.dataUrl, 'data:image/png;base64,SHOULD_NOT_PERSIST');
  assert.equal(result.transientArtifacts[0]?.metadata.transient, true);

  const stored = await repository.getRunForUser(result.run.id, 'user-1');
  assert.equal(stored?.artifacts[0]?.body, null);
  assert.equal(stored?.artifacts[0]?.url, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected: FAIL because `createAndRunAgentRun` currently returns `AgentRunDto`, so `result.run` and `result.transientArtifacts` do not exist.

- [ ] **Step 3: Add shared transient response types**

In `src/server/agent/types.ts`, add these exports after `AgentArtifactDto`:

```ts
export type TransientAgentArtifactDto = {
  kind: Extract<AgentArtifactKind, 'image' | 'video'>;
  title: string;
  mimeType: string;
  dataUrl?: string;
  filename?: string;
  metadata: Record<string, unknown> & {
    transient: true;
    width?: number;
    height?: number;
    byteLength?: number;
    model?: string;
  };
};

export type CreateAgentRunResult = {
  run: AgentRunDto;
  transientArtifacts: TransientAgentArtifactDto[];
};
```

- [ ] **Step 4: Make the deterministic image runtime produce a mock image artifact**

In `src/server/agent/pi-runtime.ts`, inside `createDeterministicPiRuntime().run`, branch on `request.taskType === 'image'` before the current text artifact return:

```ts
if (request.taskType === 'image') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#f4f1e8"/><circle cx="512" cy="512" r="320" fill="#d8dde2"/><text x="512" y="500" text-anchor="middle" font-family="Arial" font-size="42" fill="#1d1d1f">AI Image Preview</text><text x="512" y="560" text-anchor="middle" font-family="Arial" font-size="26" fill="#555555">${request.prompt.replace(/[<>&"]/g, '')}</text></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  return {
    finalMessage: `图片已生成，请及时下载保存。`,
    artifacts: [
      {
        kind: 'image',
        title: '生成图片',
        body: dataUrl,
        metadata: {
          transient: true,
          mimeType: 'image/svg+xml',
          width: 1024,
          height: 1024,
          provider: request.provider,
          model: request.model,
          taskType: request.taskType,
        },
      },
    ],
  };
}
```

Keep the existing text return for non-image tasks.

- [ ] **Step 5: Implement transient splitting in the run service**

In `src/server/agent/run-service.ts`, update imports:

```ts
import type {
  AgentCapabilitySnapshot,
  AgentRunDto,
  AgentTaskType,
  AiUsage,
  CreateAgentRunResult,
  TransientAgentArtifactDto,
} from './types';
import type { AgentArtifactInput } from '@/server/repositories/agent-runs';
```

Add helpers near `cloneRecord`:

```ts
const MEDIA_ARTIFACT_KINDS = new Set(['image', 'video']);

function readArtifactString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function readArtifactNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTransientArtifact(artifact: AgentArtifactInput): TransientAgentArtifactDto | null {
  if (!MEDIA_ARTIFACT_KINDS.has(artifact.kind)) {
    return null;
  }

  const metadata = cloneRecord(artifact.metadata ?? {});
  const mimeType = readArtifactString(metadata, 'mimeType') ?? 'application/octet-stream';
  const dataUrl = artifact.body && artifact.body.startsWith('data:') ? artifact.body : undefined;
  const url = artifact.url && artifact.url.startsWith('data:') ? artifact.url : undefined;
  const payload = dataUrl ?? url;
  if (!payload) {
    return null;
  }

  const width = readArtifactNumber(metadata, 'width') ?? undefined;
  const height = readArtifactNumber(metadata, 'height') ?? undefined;
  const byteLength = readArtifactNumber(metadata, 'byteLength') ?? undefined;
  const model = readArtifactString(metadata, 'model') ?? undefined;

  return {
    kind: artifact.kind as TransientAgentArtifactDto['kind'],
    title: artifact.title,
    mimeType,
    dataUrl: payload,
    filename: readArtifactString(metadata, 'filename') ?? undefined,
    metadata: {
      ...metadata,
      transient: true,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(byteLength !== undefined ? { byteLength } : {}),
      ...(model !== undefined ? { model } : {}),
    },
  };
}

function toDurableArtifactSummary(artifact: AgentArtifactInput): AgentArtifactInput {
  if (!MEDIA_ARTIFACT_KINDS.has(artifact.kind)) {
    return artifact;
  }

  return {
    kind: artifact.kind,
    title: artifact.title,
    body: null,
    url: null,
    metadata: {
      ...cloneRecord(artifact.metadata ?? {}),
      transient: true,
    },
  };
}

function splitTransientArtifacts(artifacts: AgentArtifactInput[]) {
  return {
    durableArtifacts: artifacts.map(toDurableArtifactSummary),
    transientArtifacts: artifacts
      .map(toTransientArtifact)
      .filter((artifact): artifact is TransientAgentArtifactDto => artifact !== null),
  };
}

function runResult(run: AgentRunDto, transientArtifacts: TransientAgentArtifactDto[] = []): CreateAgentRunResult {
  return { run, transientArtifacts };
}
```

Then change the return type of `createAndRunAgentRun` to `Promise<CreateAgentRunResult>`. For non-chat returns:

- Missing bundle failure: `return runResult(requireUpdatedRun(await repository.failRun(...), 'fail run'));`
- Runtime success: split `result.artifacts`, pass `durableArtifacts` into `repository.completeRun`, return `runResult(completed, transientArtifacts)`.
- Runtime catch: `return runResult(requireUpdatedRun(await repository.failRun(...), 'fail run'));`

For chat, keep the orchestration behavior but return `runResult(running)` from `createAndRunChatAgentRun` and update that helper return type accordingly. Chat artifacts remain durable text artifacts.

- [ ] **Step 6: Run service tests to verify pass**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected: PASS with all run-service tests passing.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/server/agent/types.ts src/server/agent/pi-runtime.ts src/server/agent/run-service.ts src/server/agent/run-service.test.ts
git commit -m "feat: split transient image artifacts from run persistence"
```

## Task 2: API And Client Response Contract

**Files:**
- Modify: `src/app/api/agent/runs/route.ts`
- Modify: `src/app/api/agent/runs/route.test.ts`
- Modify: `src/features/public/agent-runtime-client.ts`
- Test: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Write the failing API helper test**

In `src/app/api/agent/runs/route.test.ts`, import the helper that will be created:

```ts
import { createAgentRunResponse } from './route';
```

Add this test after the parser tests:

```ts
test('createAgentRunResponse returns run with transient artifacts', async () => {
  const response = createAgentRunResponse({
    run: {
      id: 'run-1',
      conversationId: 'run-1',
      taskType: 'image',
      status: 'succeeded',
      prompt: 'stone cat',
      finalMessage: '图片已生成，请及时下载保存。',
      errorMessage: null,
      capabilitySummary: { provider: 'pi', model: 'pi-default', capabilities: [] },
      selectedModel: null,
      usage: null,
      billing: null,
      artifacts: [
        {
          id: 'artifact-1',
          kind: 'image',
          title: '生成图片',
          status: 'ready',
          body: null,
          url: null,
          metadata: { transient: true, mimeType: 'image/png' },
          createdAt: '2026-05-31T00:00:00.000Z',
        },
      ],
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:00:00.000Z',
    },
    transientArtifacts: [
      {
        kind: 'image',
        title: '生成图片',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,abc',
        metadata: { transient: true, width: 1024, height: 1024 },
      },
    ],
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.run.artifacts[0].body, null);
  assert.equal(body.run.artifacts[0].url, null);
  assert.equal(body.transientArtifacts[0].dataUrl, 'data:image/png;base64,abc');
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
```

Expected: FAIL because `createAgentRunResponse` is not exported.

- [ ] **Step 3: Implement the API response helper and route use**

In `src/app/api/agent/runs/route.ts`, import `CreateAgentRunResult` if needed and add:

```ts
import type { AgentRunDto, CreateAgentRunResult } from '@/server/agent/types';
```

Add this helper near `createDeleteAgentRunResponse`:

```ts
export function createAgentRunResponse(result: CreateAgentRunResult) {
  return NextResponse.json({
    run: result.run,
    transientArtifacts: result.transientArtifacts,
  });
}
```

In `POST`, replace:

```ts
const run = await createService().createAndRunAgentRun({ ... });
return NextResponse.json({ run });
```

with:

```ts
const result = await createService().createAndRunAgentRun({ ... });
return createAgentRunResponse(result);
```

Keep `createDeleteAgentRunResponse` using `AgentRunDto`.

- [ ] **Step 4: Run route tests to verify pass**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing client contract test**

In `src/features/public/agent-runtime-client.test.ts`, add:

```ts
test('createAgentRun returns run and transient artifacts from API payload', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      run: {
        id: 'run-1',
        conversationId: 'run-1',
        taskType: 'image',
        status: 'succeeded',
        prompt: 'stone cat',
        finalMessage: '图片已生成，请及时下载保存。',
        errorMessage: null,
        capabilitySummary: { provider: 'pi', model: 'pi-default', capabilities: [] },
        artifacts: [],
        createdAt: '2026-05-31T00:00:00.000Z',
        updatedAt: '2026-05-31T00:00:00.000Z',
      },
      transientArtifacts: [
        {
          kind: 'image',
          title: '生成图片',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,abc',
          metadata: { transient: true },
        },
      ],
    });

  try {
    const result = await createAgentRun({ taskType: 'image', prompt: 'stone cat' });

    assert.equal(result.run.id, 'run-1');
    assert.equal(result.transientArtifacts.length, 1);
    assert.equal(result.transientArtifacts[0]?.dataUrl, 'data:image/png;base64,abc');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 6: Run client tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected: FAIL because `createAgentRun` currently returns only `payload.run`.

- [ ] **Step 7: Update client return type**

In `src/features/public/agent-runtime-client.ts`, update import:

```ts
import type { AgentRunDetailDto, AgentRunDto, AgentTaskType, CreateAgentRunResult } from '@/server/agent/types';
```

Change `createAgentRun` signature and return:

```ts
export async function createAgentRun(input: CreateAgentRunRequest): Promise<CreateAgentRunResult> {
  const response = await fetch('/api/agent/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw apiErrorFromPayload(payload, response.status, 'AI 请求失败');
  }

  return {
    run: payload.run,
    transientArtifacts: Array.isArray(payload.transientArtifacts) ? payload.transientArtifacts : [],
  };
}
```

- [ ] **Step 8: Update existing call sites for the new result shape**

Search:

```bash
rg -n "createAgentRun\(" src/app src/features
```

Update call sites that expect an `AgentRunDto` directly:

- `src/app/chat/page.tsx`: destructure `{ run } = await createAgentRun(...)`.
- `src/app/image-gen/page.tsx`: Task 3 will handle richer UI; for now use `{ run }` if needed to keep compilation working.
- `src/app/video-gen/page.tsx`: destructure `{ run }`.
- `src/app/workflow/page.tsx`: destructure `{ run }`.

- [ ] **Step 9: Run route and client tests**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts src/features/public/agent-runtime-client.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

Run:

```bash
git add src/app/api/agent/runs/route.ts src/app/api/agent/runs/route.test.ts src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts src/app/chat/page.tsx src/app/image-gen/page.tsx src/app/video-gen/page.tsx src/app/workflow/page.tsx
git commit -m "feat: return transient artifacts from agent run API"
```

## Task 3: Image Generation Result UI

**Files:**
- Modify: `src/app/image-gen/page.tsx`
- Test: focused TypeScript/build and browser verification

- [ ] **Step 1: Write the UI state before implementation**

In `src/app/image-gen/page.tsx`, add local types near `TABS`:

```ts
type GeneratedImageResult = {
  dataUrl: string;
  title: string;
  mimeType: string;
  filename: string;
  prompt: string;
};
```

This is a preparatory type only. Do not change rendering yet.

- [ ] **Step 2: Update generation state handling**

Add state:

```ts
const [generatedImage, setGeneratedImage] = useState<GeneratedImageResult | null>(null);
```

At the start of `handleGenerate`, after clearing error/message, add:

```ts
setGeneratedImage(null);
```

Change the create call to capture the full result:

```ts
const result = await createAgentRun({ ... });
const { run, transientArtifacts } = result;
```

After failed-run handling, find the first image transient artifact:

```ts
const imageArtifact = transientArtifacts.find((artifact) => artifact.kind === 'image' && artifact.dataUrl);
if (!imageArtifact?.dataUrl) {
  setGenerationMessage(run.finalMessage ?? '任务完成，但没有返回可展示图片。请重试或联系管理员。');
  return;
}

setGeneratedImage({
  dataUrl: imageArtifact.dataUrl,
  title: imageArtifact.title,
  mimeType: imageArtifact.mimeType,
  filename: imageArtifact.filename ?? `styx-ai-image-${run.id}.png`,
  prompt: runPrompt,
});
setGenerationMessage(run.finalMessage ?? '图片已生成，请及时下载保存。');
```

- [ ] **Step 3: Add download and copy handlers**

Add handlers inside `ImageGenPage`:

```ts
const handleDownloadImage = () => {
  if (!generatedImage) return;
  try {
    const link = document.createElement('a');
    link.href = generatedImage.dataUrl;
    link.download = generatedImage.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    setGenerationError('下载未能自动开始，请在图片上右键另存为。');
  }
};

const handleCopyPrompt = async () => {
  if (!generatedImage) return;
  try {
    await navigator.clipboard.writeText(generatedImage.prompt);
    setGenerationMessage('提示词已复制。图片不会保存到服务器，请及时下载。');
  } catch {
    setGenerationError('提示词复制失败，请手动复制输入框内容。');
  }
};
```

- [ ] **Step 4: Render selected layout A in the preview panel**

In the right preview panel, before the `generationError` branch, add a `generatedImage` branch after `isGenerating`:

```tsx
) : generatedImage ? (
  <div className="flex w-full flex-col items-center gap-4 text-center">
    <div className="w-full overflow-hidden rounded-xl border border-black/5 bg-[#f5f5f7]">
      <img src={generatedImage.dataUrl} alt={generatedImage.title} className="aspect-square w-full object-contain" />
    </div>
    <div className="flex w-full flex-col gap-2 sm:flex-row">
      <button onClick={handleDownloadImage} className="apple-btn apple-btn-primary flex-1 cursor-pointer rounded-xl py-2.5 text-sm font-medium">
        下载图片
      </button>
      <button onClick={handleCopyPrompt} className="cursor-pointer rounded-xl border border-black/8 px-4 py-2.5 text-sm text-[#1d1d1f] transition-colors hover:border-black/15">
        复制提示词
      </button>
    </div>
    <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs leading-5 text-amber-800">
      图片不会保存到服务器，请及时下载。刷新、离开页面或生成下一张后无法恢复。
    </div>
    {generationMessage ? <p className="text-xs text-[#444444]">{generationMessage}</p> : null}
  </div>
```

Keep the existing error and empty branches after this.

- [ ] **Step 5: Keep out-of-scope tabs from pretending upload is implemented**

For `hd-fix` and `style-transfer`, keep the upload UI but avoid claiming a source image was processed. Since `handleGenerate` currently submits a request without upload data, add a guard at the start of `handleGenerate` after account checks:

```ts
if (activeTab !== 'generate') {
  setGenerationMessage(null);
  setGenerationError('高清修复和图片换风格需要上传原图，上传处理将在下一步开放。');
  return;
}
```

- [ ] **Step 6: Run TypeScript/lint validation for UI changes**

Run:

```bash
pnpm validate
```

Expected: PASS, or fail only for pre-existing unrelated issues that must be recorded exactly.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/app/image-gen/page.tsx
git commit -m "feat: render transient image results with download warning"
```

## Task 4: End-To-End Verification And Notes

**Files:**
- Create: `docs/superpowers/verification/2026-05-31-transient-image-generation-verification.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts src/app/api/agent/runs/route.test.ts src/features/public/agent-runtime-client.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repository validation**

Run:

```bash
pnpm validate
```

Expected: PASS, or record exact failures.

- [ ] **Step 3: Build the app**

Run:

```bash
pnpm build
```

Expected: PASS, or record exact blockers.

- [ ] **Step 4: Start a dev server for browser verification**

Run:

```bash
pnpm dev
```

If port `3000` is occupied, use the port Next selects or start with:

```bash
pnpm dev -- -p 3210
```

Expected: app serves locally.

- [ ] **Step 5: Browser verify `/image-gen`**

Use the Browser plugin or local browser automation to open the local `/image-gen` route. Verify:

- The `AI生图` tab shows prompt/model/size controls.
- A successful deterministic image run shows an image preview.
- The preview includes `下载图片`.
- The warning copy exactly communicates that server does not save the image and refresh/navigation loses it.
- Refreshing the page removes the generated image preview.
- `高清修复` and `图片换风格` do not submit fake upload-based work.

If authenticated coverage is blocked by missing account state, record that exact blocker and verify available unauthenticated/login-gate UI.

- [ ] **Step 6: Write verification note**

Create `docs/superpowers/verification/2026-05-31-transient-image-generation-verification.md` with:

```md
# Transient Image Generation Verification

Date: 2026-05-31
Spec: docs/superpowers/specs/2026-05-31-transient-image-generation-design.md

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/server/agent/run-service.test.ts src/app/api/agent/runs/route.test.ts src/features/public/agent-runtime-client.test.ts` |  |  |
| `pnpm validate` |  |  |
| `pnpm build` |  |  |

## Browser Verification

- Route:
- Auth state:
- Result:
- Screenshot path if captured:

## Invariant Check

- Generated image media is returned only through `transientArtifacts`.
- Persisted image artifact summaries have null `body` and null `url`.
- UI warns that refresh/navigation loses generated media.

## Blockers Or Residual Risk

- 
```

Fill in actual results only after running the commands.

- [ ] **Step 7: Commit verification note**

Run:

```bash
git add docs/superpowers/verification/2026-05-31-transient-image-generation-verification.md
git commit -m "docs: verify transient image generation"
```

## Self-Review

Spec coverage:

- Transient API response: Task 1 and Task 2.
- No persisted media body/url: Task 1 tests and implementation.
- Result UI layout A and warning copy: Task 3.
- Out-of-scope upload tabs: Task 3 guard.
- Verification and reusable asset: Task 4.

Placeholder scan: no TODO/TBD placeholders are used as implementation instructions. The verification note template has blanks that must be filled with actual results during Task 4.

Type consistency: `CreateAgentRunResult`, `TransientAgentArtifactDto`, `transientArtifacts`, `dataUrl`, `mimeType`, and `metadata.transient` are used consistently across service, route, client, and UI tasks.
