# Direct Media Result Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MVP web loop where AI image/video runs return immediately, stream provider results to the browser through existing run SSE, and reserve an OSS handoff boundary without enabling storage.

**Architecture:** Reuse the existing `agent_runs` lifecycle and `/api/agent/runs/[runId]/events` SSE endpoint. Add a media-result normalization/storage-status contract, run image/video orchestration asynchronously like chat, emit `artifact_*` events for direct browser preview/download, and persist only safe artifact summaries with `storageStatus: 'provider_direct'`.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, existing agent run repository and SSE event log, Node test runner via `pnpm exec tsx --test`, Tailwind CSS.

---

## File Structure

- Modify `src/server/agent/types.ts`: add direct media delivery DTOs and event payload helper types.
- Create `src/server/agent/media-results.ts`: normalize runtime media artifacts, create SSE payloads, sanitize persisted summaries, and provide the no-op OSS reservation seam.
- Create `src/server/agent/media-results.test.ts`: pure tests for provider-direct result normalization and persisted summary sanitization.
- Modify `src/server/agent/pi-runtime.ts`: add deterministic mock video artifact output for `/video-gen`; keep existing mock image artifact output.
- Modify `src/server/agent/run-service.ts`: make `image` and `video` tasks early-return `running`, launch background media orchestration, emit media events, complete/fail runs asynchronously.
- Modify `src/server/agent/run-service.test.ts`: add service tests for async media runs and event ordering.
- Modify `src/features/public/agent-runtime-client.ts`: add parser helpers for run SSE payloads and media artifact completion payloads.
- Modify `src/features/public/agent-runtime-client.test.ts`: add client tests for media event parsing and SSE URL helper.
- Modify `src/app/image-gen/page.tsx`: switch from immediate transient response rendering to run-event-driven rendering while preserving current preview/download UX.
- Modify `src/app/video-gen/page.tsx`: add run-event-driven video preview, controls, download, error handling, and direct-delivery warning.
- Add `docs/superpowers/verification/2026-06-01-direct-media-result-push-verification.md`: record verification evidence after implementation.

## Task 1: Media Result Contract

**Files:**
- Modify: `src/server/agent/types.ts`
- Create: `src/server/agent/media-results.ts`
- Create: `src/server/agent/media-results.test.ts`

- [ ] **Step 1: Write the failing pure tests**

Create `src/server/agent/media-results.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDirectMediaEventPayload,
  sanitizeDirectMediaArtifact,
  toDirectMediaResult,
} from './media-results';

test('toDirectMediaResult accepts provider URL media artifacts', () => {
  const result = toDirectMediaResult({
    kind: 'video',
    title: '生成视频',
    url: 'https://provider.example/result.mp4',
    metadata: {
      mimeType: 'video/mp4',
      filename: 'result.mp4',
      durationSeconds: 5,
      providerTaskId: 'task-1',
      providerExpiresAt: '2026-06-01T10:00:00.000Z',
    },
  });

  assert.equal(result?.kind, 'video');
  assert.equal(result?.delivery.mode, 'provider_url');
  assert.equal(result?.delivery.url, 'https://provider.example/result.mp4');
  assert.equal(result?.delivery.expiresAt, '2026-06-01T10:00:00.000Z');
  assert.equal(result?.metadata.storageStatus, 'provider_direct');
  assert.equal(result?.metadata.mimeType, 'video/mp4');
  assert.equal(result?.metadata.durationSeconds, 5);
});

test('toDirectMediaResult accepts data URL media artifacts', () => {
  const result = toDirectMediaResult({
    kind: 'image',
    title: '生成图片',
    body: 'data:image/svg+xml;base64,abc',
    metadata: {
      mimeType: 'image/svg+xml',
      width: 1024,
      height: 1024,
    },
  });

  assert.equal(result?.kind, 'image');
  assert.equal(result?.delivery.mode, 'data_url');
  assert.equal(result?.delivery.url, 'data:image/svg+xml;base64,abc');
  assert.equal(result?.metadata.storageStatus, 'provider_direct');
  assert.equal(result?.metadata.width, 1024);
  assert.equal(result?.metadata.height, 1024);
});

test('sanitizeDirectMediaArtifact persists no direct media body or URL', () => {
  const sanitized = sanitizeDirectMediaArtifact({
    kind: 'video',
    title: '生成视频',
    url: 'https://provider.example/result.mp4',
    metadata: {
      mimeType: 'video/mp4',
      providerExpiresAt: '2026-06-01T10:00:00.000Z',
    },
  });

  assert.equal(sanitized.kind, 'video');
  assert.equal(sanitized.body, null);
  assert.equal(sanitized.url, null);
  assert.equal(sanitized.metadata.storageStatus, 'provider_direct');
  assert.equal(sanitized.metadata.deliveryMode, 'provider_url');
  assert.equal(sanitized.metadata.providerExpiresAt, '2026-06-01T10:00:00.000Z');
});

test('createDirectMediaEventPayload returns browser preview payload', () => {
  const media = toDirectMediaResult({
    kind: 'image',
    title: '生成图片',
    body: 'data:image/png;base64,abc',
    metadata: { mimeType: 'image/png', filename: 'image.png' },
  });

  assert.ok(media);
  const payload = createDirectMediaEventPayload(media);
  assert.equal(payload.artifact.kind, 'image');
  assert.equal(payload.artifact.delivery.mode, 'data_url');
  assert.equal(payload.artifact.delivery.url, 'data:image/png;base64,abc');
  assert.equal(payload.artifact.metadata.storageStatus, 'provider_direct');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/agent/media-results.test.ts
```

Expected: FAIL with module-not-found for `./media-results`.

- [ ] **Step 3: Add direct media types**

In `src/server/agent/types.ts`, add these exports after `TransientAgentArtifactDto`:

```ts
export type DirectMediaDeliveryMode = 'provider_url' | 'data_url';
export type DirectMediaStorageStatus = 'provider_direct' | 'stored';

export type DirectMediaResultDto = {
  kind: Extract<AgentArtifactKind, 'image' | 'video'>;
  title: string;
  delivery: {
    mode: DirectMediaDeliveryMode;
    url: string;
    expiresAt: string | null;
  };
  metadata: Record<string, unknown> & {
    storageStatus: DirectMediaStorageStatus;
    mimeType?: string;
    filename?: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
    providerTaskId?: string;
    model?: string;
  };
};

export type DirectMediaArtifactCompletedPayload = {
  artifact: DirectMediaResultDto;
};
```

- [ ] **Step 4: Implement media result helpers**

Create `src/server/agent/media-results.ts`:

```ts
import type { AgentArtifactInput } from '@/server/repositories/agent-runs';
import type {
  DirectMediaArtifactCompletedPayload,
  DirectMediaResultDto,
} from './types';

const DIRECT_MEDIA_KINDS = new Set(['image', 'video']);

function isDirectMediaKind(kind: string): kind is DirectMediaResultDto['kind'] {
  return DIRECT_MEDIA_KINDS.has(kind);
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function deliveryFromArtifact(artifact: AgentArtifactInput) {
  if (artifact.url?.startsWith('http://') || artifact.url?.startsWith('https://')) {
    return { mode: 'provider_url' as const, url: artifact.url };
  }

  if (artifact.url?.startsWith('data:')) {
    return { mode: 'data_url' as const, url: artifact.url };
  }

  if (artifact.body?.startsWith('data:')) {
    return { mode: 'data_url' as const, url: artifact.body };
  }

  return null;
}

export function toDirectMediaResult(artifact: AgentArtifactInput): DirectMediaResultDto | null {
  if (!isDirectMediaKind(artifact.kind)) {
    return null;
  }

  const delivery = deliveryFromArtifact(artifact);
  if (!delivery) {
    return null;
  }

  const metadata = artifact.metadata ?? {};
  const expiresAt = readString(metadata, 'providerExpiresAt') ?? readString(metadata, 'expiresAt');
  const width = readNumber(metadata, 'width') ?? undefined;
  const height = readNumber(metadata, 'height') ?? undefined;
  const durationSeconds = readNumber(metadata, 'durationSeconds') ?? undefined;
  const mimeType = readString(metadata, 'mimeType') ?? undefined;
  const filename = readString(metadata, 'filename') ?? undefined;
  const providerTaskId = readString(metadata, 'providerTaskId') ?? undefined;
  const model = readString(metadata, 'model') ?? undefined;

  return {
    kind: artifact.kind,
    title: artifact.title,
    delivery: {
      ...delivery,
      expiresAt,
    },
    metadata: {
      ...metadata,
      storageStatus: 'provider_direct',
      ...(mimeType ? { mimeType } : {}),
      ...(filename ? { filename } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(providerTaskId ? { providerTaskId } : {}),
      ...(model ? { model } : {}),
    },
  };
}

export function sanitizeDirectMediaArtifact(artifact: AgentArtifactInput): AgentArtifactInput {
  const media = toDirectMediaResult(artifact);
  if (!media) {
    return artifact;
  }

  return {
    kind: media.kind,
    title: media.title,
    body: null,
    url: null,
    metadata: {
      ...media.metadata,
      deliveryMode: media.delivery.mode,
      providerExpiresAt: media.delivery.expiresAt,
    },
  };
}

export function createDirectMediaEventPayload(
  media: DirectMediaResultDto,
): DirectMediaArtifactCompletedPayload {
  return { artifact: media };
}
```

- [ ] **Step 5: Run the pure tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/media-results.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/agent/types.ts src/server/agent/media-results.ts src/server/agent/media-results.test.ts
git commit -m "feat: add direct media result contract"
```

## Task 2: Async Media Run Orchestration

**Files:**
- Modify: `src/server/agent/pi-runtime.ts`
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`

- [ ] **Step 1: Write failing async media service tests**

Add these tests to `src/server/agent/run-service.test.ts` near the existing media/runtime tests:

```ts
test('createAndRunAgentRun returns running image run and streams direct media completion', async () => {
  const repository = createMemoryAgentRunRepository();
  let unblockRuntime: (() => void) | null = null;
  const runtimeStarted = new Promise<void>((resolve) => {
    unblockRuntime = resolve;
  });
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        await runtimeStarted;
        return {
          finalMessage: '图片已生成',
          artifacts: [
            {
              kind: 'image',
              title: '生成图片',
              body: 'data:image/png;base64,abc',
              metadata: { mimeType: 'image/png', width: 1024, height: 1024 },
            },
          ],
        };
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'image',
    prompt: '山谷里的石头印画',
    input: { size: '1:1' },
  });

  assert.equal(result.run.status, 'running');
  assert.deepEqual(result.transientArtifacts, []);

  unblockRuntime?.();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const completed = await repository.getRunForUser(result.run.id, 'user-1');
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.artifacts[0]?.body, null);
  assert.equal(completed?.artifacts[0]?.url, null);
  assert.equal(completed?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['artifact_started', 'artifact_completed', 'run_completed'],
  );
  assert.equal(events[1]?.payload.artifact.kind, 'image');
  assert.equal(events[1]?.payload.artifact.delivery.url, 'data:image/png;base64,abc');
});

test('createAndRunAgentRun returns running video run and streams provider URL completion', async () => {
  const repository = createMemoryAgentRunRepository();
  const service = createAgentRunService({
    repository,
    runtime: {
      async run() {
        return {
          finalMessage: '视频已生成',
          artifacts: [
            {
              kind: 'video',
              title: '生成视频',
              url: 'https://provider.example/video.mp4',
              metadata: {
                mimeType: 'video/mp4',
                filename: 'video.mp4',
                durationSeconds: 5,
                providerExpiresAt: '2026-06-01T10:00:00.000Z',
              },
            },
          ],
        };
      },
    },
  });

  const result = await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'video',
    prompt: '石头印画动起来',
    input: { duration: '5秒' },
  });

  assert.equal(result.run.status, 'running');
  await new Promise((resolve) => setTimeout(resolve, 0));

  const completed = await repository.getRunForUser(result.run.id, 'user-1');
  const events = await repository.listRunEvents(result.run.id);

  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.artifacts[0]?.metadata.storageStatus, 'provider_direct');
  assert.equal(events[1]?.eventType, 'artifact_completed');
  assert.equal(events[1]?.payload.artifact.kind, 'video');
  assert.equal(events[1]?.payload.artifact.delivery.mode, 'provider_url');
  assert.equal(events[1]?.payload.artifact.delivery.url, 'https://provider.example/video.mp4');
});
```

- [ ] **Step 2: Run the service tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected: FAIL because media tasks currently complete synchronously and return transient artifacts immediately.

- [ ] **Step 3: Add deterministic video runtime output**

In `src/server/agent/pi-runtime.ts`, inside `createDeterministicPiRuntime().run`, add this branch after the image branch and before the text fallback:

```ts
if (request.taskType === 'video') {
  const safePrompt = request.prompt.replace(/[<>&"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#101418"/><text x="640" y="330" text-anchor="middle" font-family="Arial" font-size="48" fill="#ffffff">AI Video Preview</text><text x="640" y="390" text-anchor="middle" font-family="Arial" font-size="28" fill="#b8c0cc">${safePrompt}</text></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  return {
    finalMessage: '视频已生成，请及时下载保存。',
    artifacts: [
      {
        kind: 'video',
        title: '生成视频',
        url: dataUrl,
        metadata: {
          transient: true,
          mimeType: 'image/svg+xml',
          filename: `styx-ai-video-${request.runId}.svg`,
          width: 1280,
          height: 720,
          durationSeconds: 5,
          provider: request.provider,
          model: request.model,
          taskType: request.taskType,
        },
      },
    ],
  };
}
```

This is a development preview payload. Real provider integration can emit `video/mp4` provider URLs through the same contract.

- [ ] **Step 4: Refactor media tasks to early-return and orchestrate in background**

In `src/server/agent/run-service.ts`, import the new helpers:

```ts
import {
  createDirectMediaEventPayload,
  sanitizeDirectMediaArtifact,
  toDirectMediaResult,
} from './media-results';
```

Add helpers near `runResult`:

```ts
function isMediaTask(taskType: AgentTaskType) {
  return taskType === 'image' || taskType === 'video';
}

function hasUsableDirectMedia(artifacts: AgentArtifactInput[]) {
  return artifacts.some((artifact) => toDirectMediaResult(artifact));
}
```

In `createAndRunAgentRun`, after missing capability handling and before the existing synchronous runtime `try`, add:

```ts
if (isMediaTask(input.taskType)) {
  const running = requireUpdatedRun(await repository.markRunRunning(created.id), 'mark run running');
  await recordEventIfSupported(repository, running.id, 'running', 'Media runtime started', {
    provider: capabilitySnapshot.provider,
    model: capabilitySnapshot.model,
  });
  void runMediaOrchestration({
    repository,
    runtime,
    running,
    userId: input.userId,
    prompt: input.prompt,
    taskType: input.taskType,
    capabilitySnapshot,
    input: cloneRecord(input.input),
  }).catch(async (error) => {
    const errorMessage = toErrorMessage(error);
    await repository.appendRunEvent(running.id, {
      eventType: 'run_failed',
      payload: { message: errorMessage, failedAt: new Date().toISOString() },
    });
    await recordEventIfSupported(repository, running.id, 'failed', errorMessage);
    await repository.failRun(running.id, errorMessage);
  });

  return runResult(running);
}
```

Add this function before `createAndRunChatAgentRun`:

```ts
async function runMediaOrchestration(input: {
  repository: AgentRunRepository;
  runtime: PiAgentRuntime;
  running: AgentRunDto;
  userId: string;
  prompt: string;
  taskType: AgentTaskType;
  capabilitySnapshot: AgentCapabilitySnapshot & Record<string, unknown>;
  input: Record<string, unknown>;
}) {
  await input.repository.appendRunEvent(input.running.id, {
    eventType: 'artifact_started',
    payload: {
      kind: input.taskType,
      title: input.taskType === 'video' ? '生成视频' : '生成图片',
      startedAt: new Date().toISOString(),
    },
  });

  const result = await input.runtime.run({
    runId: input.running.id,
    userId: input.userId,
    taskType: input.taskType,
    prompt: input.prompt,
    provider: input.capabilitySnapshot.provider,
    model: input.capabilitySnapshot.model,
    capabilities: structuredClone(input.capabilitySnapshot.capabilities),
    input: cloneRecord(input.input),
  });

  if (!hasUsableDirectMedia(result.artifacts)) {
    throw new Error('模型任务完成，但没有返回可展示的图片或视频。');
  }

  const completedArtifacts = result.artifacts.map(sanitizeDirectMediaArtifact);
  for (const media of result.artifacts.map(toDirectMediaResult).filter((item): item is NonNullable<typeof item> => item !== null)) {
    await input.repository.appendRunEvent(input.running.id, {
      eventType: 'artifact_completed',
      payload: createDirectMediaEventPayload(media),
    });
  }

  const completed = requireUpdatedRun(
    await input.repository.completeRun(input.running.id, {
      finalMessage: result.finalMessage,
      artifacts: completedArtifacts,
    }),
    'complete run',
  );

  await input.repository.appendRunEvent(completed.id, {
    eventType: 'run_completed',
    payload: {
      finalMessage: result.finalMessage,
      completedAt: new Date().toISOString(),
    },
  });

  await recordEventIfSupported(input.repository, completed.id, 'succeeded', 'Agent run succeeded', {
    artifactCount: result.artifacts.length,
    storageStatus: 'provider_direct',
  });
}
```

- [ ] **Step 5: Run the focused service tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/agent/pi-runtime.ts src/server/agent/run-service.ts src/server/agent/run-service.test.ts
git commit -m "feat: stream direct media run results"
```

## Task 3: Client Event Parsing

**Files:**
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/public/agent-runtime-client.test.ts`

- [ ] **Step 1: Write failing client parser tests**

Add to `src/features/public/agent-runtime-client.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentRunEventsUrl,
  parseDirectMediaArtifactPayload,
  parseStreamEventPayload,
} from './agent-runtime-client';

test('createAgentRunEventsUrl returns the run SSE route', () => {
  assert.equal(createAgentRunEventsUrl('run-1'), '/api/agent/runs/run-1/events');
});

test('parseDirectMediaArtifactPayload reads provider-direct image payload', () => {
  const parsed = parseDirectMediaArtifactPayload({
    payload: {
      artifact: {
        kind: 'image',
        title: '生成图片',
        delivery: {
          mode: 'data_url',
          url: 'data:image/png;base64,abc',
          expiresAt: null,
        },
        metadata: {
          storageStatus: 'provider_direct',
          mimeType: 'image/png',
          filename: 'image.png',
        },
      },
    },
  });

  assert.equal(parsed?.kind, 'image');
  assert.equal(parsed?.delivery.url, 'data:image/png;base64,abc');
  assert.equal(parsed?.metadata.storageStatus, 'provider_direct');
});

test('parseStreamEventPayload returns null for invalid event JSON', () => {
  assert.equal(parseStreamEventPayload({ data: '{' } as MessageEvent), null);
});
```

- [ ] **Step 2: Run the client tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected: FAIL because parser helpers are missing or not exported.

- [ ] **Step 3: Export stream payload parsers**

In `src/features/public/agent-runtime-client.ts`, import the direct media type:

```ts
import type {
  AgentRunDetailDto,
  AgentRunDto,
  AgentTaskType,
  CreateAgentRunResult,
  DirectMediaResultDto,
} from '@/server/agent/types';
```

Add these helpers near `createAgentRunEventsUrl`:

```ts
export function parseStreamEventPayload(event: Pick<MessageEvent, 'data'>): Record<string, unknown> | null {
  try {
    const payload = JSON.parse(event.data);
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isDirectMediaKind(value: unknown): value is DirectMediaResultDto['kind'] {
  return value === 'image' || value === 'video';
}

function isDeliveryMode(value: unknown) {
  return value === 'provider_url' || value === 'data_url';
}

export function parseDirectMediaArtifactPayload(value: unknown): DirectMediaResultDto | null {
  const outer = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const payload = outer?.payload && typeof outer.payload === 'object'
    ? (outer.payload as Record<string, unknown>)
    : outer;
  const artifact = payload?.artifact && typeof payload.artifact === 'object'
    ? (payload.artifact as Record<string, unknown>)
    : null;
  const delivery = artifact?.delivery && typeof artifact.delivery === 'object'
    ? (artifact.delivery as Record<string, unknown>)
    : null;
  const metadata = artifact?.metadata && typeof artifact.metadata === 'object'
    ? (artifact.metadata as Record<string, unknown>)
    : null;

  if (
    !isDirectMediaKind(artifact?.kind) ||
    typeof artifact.title !== 'string' ||
    !delivery ||
    !isDeliveryMode(delivery.mode) ||
    typeof delivery.url !== 'string' ||
    !metadata ||
    metadata.storageStatus !== 'provider_direct'
  ) {
    return null;
  }

  return {
    kind: artifact.kind,
    title: artifact.title,
    delivery: {
      mode: delivery.mode,
      url: delivery.url,
      expiresAt: typeof delivery.expiresAt === 'string' ? delivery.expiresAt : null,
    },
    metadata: {
      ...metadata,
      storageStatus: 'provider_direct',
    },
  };
}
```

- [ ] **Step 4: Run the client tests**

Run:

```bash
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: parse direct media stream events"
```

## Task 4: Image Page SSE Preview

**Files:**
- Modify: `src/app/image-gen/page.tsx`

- [ ] **Step 1: Replace immediate artifact state with direct media state**

In `src/app/image-gen/page.tsx`, update imports:

```ts
import { useEffect, useState } from 'react';
import type { DirectMediaResultDto } from '@/server/agent/types';
import {
  createAgentRun,
  createAgentRunEventsUrl,
  parseDirectMediaArtifactPayload,
  parseStreamEventPayload,
} from '@/features/public/agent-runtime-client';
```

Replace `GeneratedImageResult` with:

```ts
type GeneratedImageResult = {
  artifact: DirectMediaResultDto;
  prompt: string;
};
```

Add state:

```ts
const [streamRunId, setStreamRunId] = useState<string | null>(null);
```

- [ ] **Step 2: Add EventSource handling**

Add this effect inside `ImageGenPage`:

```ts
useEffect(() => {
  if (!streamRunId) {
    return;
  }

  const eventSource = new EventSource(createAgentRunEventsUrl(streamRunId));
  eventSource.addEventListener('artifact_completed', (event) => {
    const payload = parseStreamEventPayload(event);
    const artifact = parseDirectMediaArtifactPayload(payload);
    if (!artifact || artifact.kind !== 'image') {
      return;
    }
    setGeneratedImage({ artifact, prompt });
    setGenerationMessage('图片已生成，请及时下载。');
  });
  eventSource.addEventListener('run_completed', () => {
    eventSource.close();
    setIsGenerating(false);
    setStreamRunId((current) => (current === streamRunId ? null : current));
  });
  eventSource.addEventListener('run_failed', (event) => {
    const payload = parseStreamEventPayload(event);
    const failureMessage =
      payload?.payload && typeof payload.payload === 'object' && typeof (payload.payload as Record<string, unknown>).message === 'string'
        ? ((payload.payload as Record<string, unknown>).message as string)
        : '图片生成请求失败';
    setGenerationError(failureMessage);
    setIsGenerating(false);
    eventSource.close();
    setStreamRunId((current) => (current === streamRunId ? null : current));
  });
  eventSource.onerror = () => {
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}, [prompt, streamRunId]);
```

- [ ] **Step 3: Update submit behavior**

In `handleGenerate`, replace the old `transientArtifacts` handling after `createAgentRun` with:

```ts
const { run } = await createAgentRun({
  taskType: 'image',
  prompt: runPrompt,
  input: {
    mode: activeTab,
    model: selectedModel,
    size: selectedSize,
    hdScale,
    style: selectedStyle,
  },
});
if (run.status === 'failed') {
  setGenerationError(run.errorMessage ?? '图片生成请求失败');
  setIsGenerating(false);
  return;
}
setStreamRunId(run.id);
setGenerationMessage('任务已提交，正在等待模型返回结果。');
```

Remove the old immediate `finally { setIsGenerating(false); }` behavior for the success path. Keep `setIsGenerating(false)` in the `catch` block.

- [ ] **Step 4: Update download and preview references**

Update `handleDownloadImage`:

```ts
const handleDownloadImage = () => {
  if (!generatedImage) return;
  try {
    const link = document.createElement('a');
    link.href = generatedImage.artifact.delivery.url;
    link.download =
      typeof generatedImage.artifact.metadata.filename === 'string'
        ? generatedImage.artifact.metadata.filename
        : 'styx-ai-image.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    setGenerationError('下载未能自动开始，请在图片上右键另存为。');
  }
};
```

Update preview image references to:

```tsx
<img
  src={generatedImage.artifact.delivery.url}
  alt={generatedImage.artifact.title}
  className="max-h-[520px] w-full rounded-xl object-contain"
/>
```

Update warning copy to:

```tsx
<p className="text-xs text-[#6e6e73]">
  生成结果暂未保存到云端，请及时下载。链接可能过期，刷新或离开页面后可能无法恢复。
</p>
```

- [ ] **Step 5: Run focused type check for the page**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

Expected: no new errors from `src/app/image-gen/page.tsx`. If existing unrelated repository test type errors appear, record exact file names for verification and continue.

- [ ] **Step 6: Commit**

```bash
git add src/app/image-gen/page.tsx
git commit -m "feat: stream image generation results"
```

## Task 5: Video Page SSE Preview

**Files:**
- Modify: `src/app/video-gen/page.tsx`

- [ ] **Step 1: Add direct media imports and state**

In `src/app/video-gen/page.tsx`, update imports:

```ts
import { useEffect, useState } from 'react';
import type { DirectMediaResultDto } from '@/server/agent/types';
import {
  createAgentRun,
  createAgentRunEventsUrl,
  parseDirectMediaArtifactPayload,
  parseStreamEventPayload,
} from '@/features/public/agent-runtime-client';
```

Add state in `VideoGenPage`:

```ts
const [streamRunId, setStreamRunId] = useState<string | null>(null);
const [generatedVideo, setGeneratedVideo] = useState<DirectMediaResultDto | null>(null);
```

- [ ] **Step 2: Add EventSource handling**

Add this effect inside `VideoGenPage`:

```ts
useEffect(() => {
  if (!streamRunId) {
    return;
  }

  const eventSource = new EventSource(createAgentRunEventsUrl(streamRunId));
  eventSource.addEventListener('artifact_completed', (event) => {
    const payload = parseStreamEventPayload(event);
    const artifact = parseDirectMediaArtifactPayload(payload);
    if (!artifact || artifact.kind !== 'video') {
      return;
    }
    setGeneratedVideo(artifact);
    setGenerationMessage('视频已生成，请及时下载。');
  });
  eventSource.addEventListener('run_completed', () => {
    eventSource.close();
    setIsGenerating(false);
    setStreamRunId((current) => (current === streamRunId ? null : current));
  });
  eventSource.addEventListener('run_failed', (event) => {
    const payload = parseStreamEventPayload(event);
    const failureMessage =
      payload?.payload && typeof payload.payload === 'object' && typeof (payload.payload as Record<string, unknown>).message === 'string'
        ? ((payload.payload as Record<string, unknown>).message as string)
        : '视频生成请求失败';
    setGenerationError(failureMessage);
    setIsGenerating(false);
    eventSource.close();
    setStreamRunId((current) => (current === streamRunId ? null : current));
  });
  eventSource.onerror = () => {
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}, [streamRunId]);
```

- [ ] **Step 3: Update submit behavior**

In `handleGenerate`, clear old video state before request:

```ts
setGeneratedVideo(null);
```

Replace the old final-message handling with:

```ts
const { run } = await createAgentRun({
  taskType: 'video',
  prompt: prompt.trim(),
  input: {
    model: selectedModel,
    style: selectedStyle,
    duration: selectedDuration,
    clarity: selectedClarity,
    audioEnabled,
  },
});
if (run.status === 'failed') {
  setGenerationError(run.errorMessage ?? '视频生成请求失败');
  setIsGenerating(false);
  return;
}
setStreamRunId(run.id);
setGenerationMessage('任务已提交，正在等待模型返回结果。');
```

Remove the old success-path `finally { setIsGenerating(false); }`; keep `setIsGenerating(false)` in `catch`.

- [ ] **Step 4: Add preview and download actions**

Add this function inside `VideoGenPage`:

```ts
const handleDownloadVideo = () => {
  if (!generatedVideo) return;
  try {
    const link = document.createElement('a');
    link.href = generatedVideo.delivery.url;
    link.download =
      typeof generatedVideo.metadata.filename === 'string'
        ? generatedVideo.metadata.filename
        : 'styx-ai-video.mp4';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    setGenerationError('下载未能自动开始，请在视频上右键另存为。');
  }
};
```

In the right preview panel, add a completed state before `generationMessage`:

```tsx
{generatedVideo ? (
  <div className="w-full space-y-4">
    {typeof generatedVideo.metadata.mimeType === 'string' && generatedVideo.metadata.mimeType.startsWith('video/') ? (
      <video
        src={generatedVideo.delivery.url}
        controls
        className="aspect-video w-full rounded-xl bg-black object-contain"
      />
    ) : (
      <img
        src={generatedVideo.delivery.url}
        alt={generatedVideo.title}
        className="aspect-video w-full rounded-xl bg-black object-contain"
      />
    )}
    <div className="flex gap-2">
      <button
        onClick={handleDownloadVideo}
        className="apple-btn apple-btn-primary flex-1 cursor-pointer rounded-xl py-2 text-sm font-medium"
      >
        下载视频
      </button>
    </div>
    <p className="text-center text-xs text-[#6e6e73]">
      生成结果暂未保存到云端，请及时下载。链接可能过期，刷新或离开页面后可能无法恢复。
    </p>
  </div>
) : generationMessage ? (
```

Keep the existing message fallback after this branch.

- [ ] **Step 5: Run focused type check for the page**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

Expected: no new errors from `src/app/video-gen/page.tsx`. If existing unrelated repository test type errors appear, record exact file names for verification and continue.

- [ ] **Step 6: Commit**

```bash
git add src/app/video-gen/page.tsx
git commit -m "feat: stream video generation results"
```

## Task 6: Verification And Handoff

**Files:**
- Add: `docs/superpowers/verification/2026-06-01-direct-media-result-push-verification.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/media-results.test.ts src/server/agent/run-service.test.ts src/features/public/agent-runtime-client.test.ts src/app/api/agent/runs/route.test.ts
```

Expected: PASS for the focused suite.

- [ ] **Step 2: Run validation**

Run:

```bash
pnpm validate
```

Expected: PASS, or blocked only by pre-existing unrelated errors. If blocked, copy the exact failing file names and error categories into the verification note.

- [ ] **Step 3: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS and route list includes `/image-gen`, `/video-gen`, `/api/agent/runs`, and `/api/agent/runs/[runId]/events`.

- [ ] **Step 4: Browser verify image and video pages**

Start the app:

```bash
pnpm dev
```

Use a local browser or Playwright to verify:

- `/image-gen` renders the form and preview panel.
- Submitting a prompt creates a running state and then renders an image preview.
- The image page shows `下载图片` and the direct-delivery warning.
- `/video-gen` renders the form and preview panel.
- Submitting a prompt creates a running state and then renders a media preview.
- The video page shows `下载视频` and the direct-delivery warning.

- [ ] **Step 5: Write verification note**

Create `docs/superpowers/verification/2026-06-01-direct-media-result-push-verification.md`:

```md
# Direct Media Result Push Verification

Date: 2026-06-01
Spec: docs/superpowers/specs/2026-06-01-direct-media-result-push-design.md

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/server/agent/media-results.test.ts src/server/agent/run-service.test.ts src/features/public/agent-runtime-client.test.ts src/app/api/agent/runs/route.test.ts` |  |  |
| `pnpm validate` |  |  |
| `pnpm build` |  |  |

## Browser Verification

- `/image-gen`:
- `/video-gen`:

## Residual Risk

- MVP uses provider-direct delivery. Generated media is not saved to OSS/TOS/COS.
- Provider URLs may expire after delivery.
```

Fill in actual command results and any blockers.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/verification/2026-06-01-direct-media-result-push-verification.md
git commit -m "docs: verify direct media result push"
```

## Self-Review Checklist

- Spec coverage: Tasks 1-2 cover direct media contract, state ownership, async service behavior, persisted artifact summaries, and OSS reservation seam. Tasks 3-5 cover SSE client/UI behavior. Task 6 covers verification.
- Placeholder scan: no incomplete markers or unspecified edge handling remains in this plan.
- Type consistency: `DirectMediaResultDto`, `DirectMediaArtifactCompletedPayload`, `toDirectMediaResult`, `sanitizeDirectMediaArtifact`, and `parseDirectMediaArtifactPayload` are introduced before use in later tasks.
