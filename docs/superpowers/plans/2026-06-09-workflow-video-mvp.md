---
archived-with: 2026-06-09-workflow-12-grid-storyboard-generation
status: final
---
# Workflow Video MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a skill-like `workflow-video-mvp` Agent Capability that turns workflow source image, storyboard artifact, scene background, and prompt/map snapshots into a `doubao-seedance-2-0` video run.

**Architecture:** Keep the skills paradigm configuration-first: Agent Capability config owns description, fixed input schema, prompt template, model binding, defaults, and enabled status, while execution remains in the existing server runtime. Add a narrow workflow-video orchestrator that validates material references, renders the final prompt, signs ordered image materials, and delegates to the existing video task polling adapter. Preserve generic video generation and storyboard generation behavior.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle-backed repositories with seed fallback, Zod route validation, node:test, existing Agent Runtime, existing Doubao video task polling adapter.

---

## File Structure

- `src/server/agent/types.ts`: add `WorkflowVideoMvpCapabilityConfig`, material reference, and prompt context types.
- `src/server/repositories/agent-capabilities.ts`: seed/read/normalize/save `workflow-video-mvp` config and include it in the workflow default bundle.
- `src/server/repositories/agent-capabilities.test.ts`: repository/parser tests for default config, invalid config normalization, and save validation.
- `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.ts`: admin-only JSON GET/PUT config route.
- `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts`: route validation and auth tests.
- `src/features/admin/admin-action-controls.tsx`: add `workflow-video-mvp` editor and summary action beside the existing storyboard editor.
- `src/features/admin/admin-action-controls.test.ts`: helper tests for showing the workflow video editor action and normalizing form payloads.
- `src/server/agent/workflow-video-mvp.ts`: pure config validation, material input parsing, prompt rendering, and ordered material resolution helpers.
- `src/server/agent/workflow-video-mvp.test.ts`: pure tests for prompt rendering and fail-closed validation.
- `src/server/ai/video-provider-adapters.ts`: support `imageUrls?: string[]` while preserving existing `imageUrl`.
- `src/server/ai/video-provider-adapters.test.ts`: verify ordered image URL content entries and old single-image behavior.
- `src/server/agent/run-service.ts`: route `taskType: "workflow", input.stage: "workflow_video"` into the workflow-video orchestrator.
- `src/server/agent/run-service.test.ts`: runtime tests for material validation, config snapshot, model binding, and provider request.
- `src/app/api/agent/runs/route.ts`: validate workflow-video request shape at the API boundary.
- `src/app/api/agent/runs/route.test.ts`: route tests for missing material references and valid workflow-video input.
- `src/app/workflow/page.tsx` and `src/app/workflow/workflow-state.ts`: block final video until materials exist and submit workflow-video request.

## Task 1: Add Workflow Video Capability Config

**Files:**
- Modify: `src/server/agent/types.ts`
- Modify: `src/server/repositories/agent-capabilities.ts`
- Test: `src/server/repositories/agent-capabilities.test.ts`

- [ ] **Step 1: Write the failing repository tests**

Add these tests to `src/server/repositories/agent-capabilities.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDefaultAgentCapabilityBundle,
  readWorkflowVideoMvpCapabilityConfig,
  validateWorkflowVideoMvpCapabilityDraft,
} from './agent-capabilities';

test('readWorkflowVideoMvpCapabilityConfig returns skill-like workflow video config', () => {
  const snapshot = getDefaultAgentCapabilityBundle('workflow');
  assert.ok(snapshot);

  const config = readWorkflowVideoMvpCapabilityConfig(snapshot);

  assert.equal(config?.code, 'workflow-video-mvp');
  assert.equal(config?.modelBinding.providerCode, 'doubao');
  assert.equal(config?.modelBinding.model, 'doubao-seedance-2-0');
  assert.equal(config?.modelBinding.executionProtocol, 'video_task_polling');
  assert.deepEqual(config?.inputSchema.requiredMaterials, [
    'source_image',
    'storyboard_image',
    'scene_background',
  ]);
  assert.deepEqual(config?.inputSchema.requiredSnapshots, ['storyboard_prompt_map']);
  assert.equal(config?.defaults.durationSeconds, 5);
  assert.equal(config?.defaults.resolution, '720p');
});

test('validateWorkflowVideoMvpCapabilityDraft rejects empty prompt templates', () => {
  assert.throws(
    () =>
      validateWorkflowVideoMvpCapabilityDraft({
        description: '工作流视频',
        promptTemplate: '   ',
        defaults: { durationSeconds: 5, resolution: '720p' },
      }),
    /视频提示词不能为空/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts
```

Expected: FAIL because `readWorkflowVideoMvpCapabilityConfig` and `validateWorkflowVideoMvpCapabilityDraft` do not exist.

- [ ] **Step 3: Add types**

Add to `src/server/agent/types.ts`:

```ts
export type WorkflowVideoMvpRequiredMaterial =
  | 'source_image'
  | 'storyboard_image'
  | 'scene_background';

export type WorkflowVideoMvpRequiredSnapshot = 'storyboard_prompt_map';

export type WorkflowVideoMvpCapabilityConfig = {
  code: 'workflow-video-mvp';
  description: string;
  inputSchema: {
    requiredMaterials: WorkflowVideoMvpRequiredMaterial[];
    requiredSnapshots: WorkflowVideoMvpRequiredSnapshot[];
  };
  promptTemplate: string;
  modelBinding: {
    providerCode: 'doubao';
    model: 'doubao-seedance-2-0';
    executionProtocol: 'video_task_polling';
  };
  defaults: {
    durationSeconds: number;
    resolution: string;
  };
  updatedAt: string | null;
  updatedByUserId: string | null;
};
```

- [ ] **Step 4: Add config seed, parser, validation, and summary**

In `src/server/repositories/agent-capabilities.ts`, import `WorkflowVideoMvpCapabilityConfig` and add:

```ts
const WORKFLOW_VIDEO_MVP_REQUIRED_MATERIALS = [
  'source_image',
  'storyboard_image',
  'scene_background',
] as const;

const WORKFLOW_VIDEO_MVP_REQUIRED_SNAPSHOTS = ['storyboard_prompt_map'] as const;

function createDefaultWorkflowVideoMvpConfig(): Omit<
  WorkflowVideoMvpCapabilityConfig,
  'code'
> {
  return {
    description: '将原图、12宫格分镜图、场景底图和提示词地图合成为工作流视频。',
    inputSchema: {
      requiredMaterials: [...WORKFLOW_VIDEO_MVP_REQUIRED_MATERIALS],
      requiredSnapshots: [...WORKFLOW_VIDEO_MVP_REQUIRED_SNAPSHOTS],
    },
    promptTemplate: [
      '请基于以下工作流材料生成短视频：',
      '原图：{{source_image_url}}',
      '12宫格分镜图：{{storyboard_image_url}}',
      '场景底图：{{scene_background_url}}',
      '提示词地图：{{storyboard_prompt_map}}',
      '用户补充要求：{{workflow_prompt}}',
      '视频规格：{{duration_seconds}} 秒，{{resolution}}。',
    ].join('\n'),
    modelBinding: {
      providerCode: 'doubao',
      model: 'doubao-seedance-2-0',
      executionProtocol: 'video_task_polling',
    },
    defaults: {
      durationSeconds: 5,
      resolution: '720p',
    },
    updatedAt: null,
    updatedByUserId: null,
  };
}

export function validateWorkflowVideoMvpCapabilityDraft(input: {
  description: string;
  promptTemplate: string;
  defaults: { durationSeconds: number; resolution: string };
}) {
  const description = input.description.trim();
  const promptTemplate = input.promptTemplate.trim();
  const resolution = input.defaults.resolution.trim();
  if (!promptTemplate) {
    throw new StoryboardCapabilityValidationError('工作流视频提示词不能为空。');
  }
  if (!Number.isInteger(input.defaults.durationSeconds) || input.defaults.durationSeconds <= 0) {
    throw new StoryboardCapabilityValidationError('工作流视频默认时长必须为正整数。');
  }
  if (!resolution) {
    throw new StoryboardCapabilityValidationError('工作流视频默认分辨率不能为空。');
  }
  return {
    description: description || createDefaultWorkflowVideoMvpConfig().description,
    promptTemplate,
    defaults: { durationSeconds: input.defaults.durationSeconds, resolution },
  };
}
```

Add a seed capability:

```ts
{
  id: '66666666-6666-4666-8666-666666666666',
  kind: 'skill',
  code: 'workflow-video-mvp',
  name: '工作流视频生成',
  status: 'enabled',
  config: createDefaultWorkflowVideoMvpConfig(),
}
```

Add its id to the workflow bundle after `workflow-storyboard-template`.

Add parser:

```ts
export function readWorkflowVideoMvpCapabilityConfig(
  snapshot: AgentCapabilitySnapshot,
): WorkflowVideoMvpCapabilityConfig | null {
  const capability = snapshot.capabilities.find((item) => item.code === 'workflow-video-mvp');
  if (!capability) return null;
  const config = isRecord(capability.config) ? capability.config : {};
  const defaults = createDefaultWorkflowVideoMvpConfig();
  return {
    code: 'workflow-video-mvp',
    description:
      typeof config.description === 'string' && config.description.trim()
        ? config.description
        : defaults.description,
    inputSchema: defaults.inputSchema,
    promptTemplate:
      typeof config.promptTemplate === 'string' && config.promptTemplate.trim()
        ? config.promptTemplate
        : defaults.promptTemplate,
    modelBinding: defaults.modelBinding,
    defaults: {
      durationSeconds:
        typeof (config.defaults as Record<string, unknown> | undefined)?.durationSeconds === 'number'
          ? (config.defaults as { durationSeconds: number }).durationSeconds
          : defaults.defaults.durationSeconds,
      resolution:
        typeof (config.defaults as Record<string, unknown> | undefined)?.resolution === 'string'
          ? (config.defaults as { resolution: string }).resolution
          : defaults.defaults.resolution,
    },
    updatedAt: typeof config.updatedAt === 'string' ? config.updatedAt : null,
    updatedByUserId: typeof config.updatedByUserId === 'string' ? config.updatedByUserId : null,
  };
}
```

Update `summarizeCapabilityConfig` for `workflow-video-mvp`:

```ts
if (code === 'workflow-video-mvp') {
  const video = readWorkflowVideoMvpCapabilityConfig({
    bundleId: 'summary',
    bundleCode: 'summary',
    provider: 'summary',
    model: 'summary',
    capabilities: [{ id: 'summary', kind: 'skill', code, name: 'summary', config }],
  });
  return [
    `提示词: ${video?.promptTemplate.trim() ? '已配置' : '缺失'}`,
    '模型: doubao-seedance-2-0',
    `素材: ${WORKFLOW_VIDEO_MVP_REQUIRED_MATERIALS.join('+')}`,
    `默认: ${video?.defaults.durationSeconds ?? 5}s/${video?.defaults.resolution ?? '720p'}`,
  ].join(' · ');
}
```

Update `ensureWorkflowStoryboardCapabilitySeed` so it seeds both workflow capability records and both bundle items.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/agent/types.ts src/server/repositories/agent-capabilities.ts src/server/repositories/agent-capabilities.test.ts
git commit -m "feat: add workflow video capability config"
```

## Task 2: Add Admin Workflow Video Config Route And Editor

**Files:**
- Create: `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.ts`
- Test: `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts`
- Modify: `src/server/repositories/agent-capabilities.ts`
- Modify: `src/features/admin/admin-action-controls.tsx`
- Test: `src/features/admin/admin-action-controls.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseWorkflowVideoConfigBody } from './route';

test('parseWorkflowVideoConfigBody accepts prompt and defaults', async () => {
  const body = parseWorkflowVideoConfigBody({
    description: '视频能力',
    promptTemplate: '生成 {{workflow_prompt}}',
    defaults: { durationSeconds: 5, resolution: '720p' },
  });

  assert.equal(body.description, '视频能力');
  assert.equal(body.promptTemplate, '生成 {{workflow_prompt}}');
  assert.equal(body.defaults.durationSeconds, 5);
  assert.equal(body.defaults.resolution, '720p');
});

test('parseWorkflowVideoConfigBody rejects empty prompt', () => {
  assert.throws(
    () =>
      parseWorkflowVideoConfigBody({
        description: '视频能力',
        promptTemplate: '',
        defaults: { durationSeconds: 5, resolution: '720p' },
      }),
    /promptTemplate/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts
```

Expected: FAIL because the route file does not exist.

- [ ] **Step 3: Add repository functions**

Add to `src/server/repositories/agent-capabilities.ts`:

```ts
export type AdminWorkflowVideoCapabilityConfigRecord = WorkflowVideoMvpCapabilityConfig & {
  capabilityId: string;
  capabilityCode: string;
  capabilityName: string;
  capabilityStatus: AgentCapabilityStatus;
};

export async function getWorkflowVideoMvpCapabilityConfig(input: {
  capabilityId: string;
}): Promise<AdminWorkflowVideoCapabilityConfigRecord> {
  const database = requireAgentCapabilityDatabase('workflow video capability config read');
  const seed = seedAgentCapabilities.find((capability) => capability.id === input.capabilityId);
  if (!database) {
    if (!seed || seed.code !== 'workflow-video-mvp') throw new StoryboardCapabilityNotFoundError();
    const snapshot = buildCapabilitySnapshot({
      bundle: workflowDefaultBundleRecord(),
      capabilities: seedAgentCapabilities,
    });
    const config = readWorkflowVideoMvpCapabilityConfig(snapshot);
    if (!config) throw new StoryboardCapabilityNotFoundError();
    return {
      ...config,
      capabilityId: seed.id,
      capabilityCode: seed.code,
      capabilityName: seed.name,
      capabilityStatus: seed.status,
    };
  }

  await ensureWorkflowStoryboardCapabilitySeed(database);
  const [row] = await database
    .select()
    .from(schema.agentCapabilities)
    .where(eq(schema.agentCapabilities.id, input.capabilityId))
    .limit(1);
  if (!row || row.code !== 'workflow-video-mvp') throw new StoryboardCapabilityNotFoundError();
  const snapshot: AgentCapabilitySnapshot = {
    bundleId: 'workflow-video-config',
    bundleCode: 'workflow-video-config',
    provider: 'doubao',
    model: 'doubao-seedance-2-0',
    capabilities: [{ id: row.id, kind: row.kind, code: row.code, name: row.name, config: row.config }],
  };
  const config = readWorkflowVideoMvpCapabilityConfig(snapshot);
  if (!config) throw new StoryboardCapabilityNotFoundError();
  return {
    ...config,
    capabilityId: row.id,
    capabilityCode: row.code,
    capabilityName: row.name,
    capabilityStatus: row.status,
  };
}
```

Also add `saveWorkflowVideoMvpCapabilityConfig(...)` that validates the draft, writes `description`, fixed `inputSchema`, `promptTemplate`, fixed `modelBinding`, `defaults`, `updatedAt`, and `updatedByUserId` into `agent_capabilities.config`, and returns `getWorkflowVideoMvpCapabilityConfig(...)`.

- [ ] **Step 4: Add route**

Create `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAdmin } from '@/server/auth/admin';
import {
  getWorkflowVideoMvpCapabilityConfig,
  saveWorkflowVideoMvpCapabilityConfig,
  StoryboardCapabilityNotFoundError,
  StoryboardCapabilityValidationError,
} from '@/server/repositories/agent-capabilities';

const paramsSchema = z.object({ capabilityId: z.string().min(1) });

const bodySchema = z.object({
  description: z.string().transform((value) => value.trim()).default(''),
  promptTemplate: z
    .string({ message: 'promptTemplate is required.' })
    .transform((value) => value.trim())
    .pipe(z.string().min(1, 'promptTemplate is required.')),
  defaults: z.object({
    durationSeconds: z.number().int().positive(),
    resolution: z.string().transform((value) => value.trim()).pipe(z.string().min(1)),
  }),
});

export function parseWorkflowVideoConfigBody(body: unknown) {
  return bodySchema.parse(body);
}

function errorResponse(error: unknown) {
  if (error instanceof StoryboardCapabilityNotFoundError) {
    return NextResponse.json({ error: { code: 'not_found', message: error.message } }, { status: 404 });
  }
  if (error instanceof StoryboardCapabilityValidationError || error instanceof z.ZodError) {
    return NextResponse.json(
      { error: { code: 'invalid_request', message: error instanceof Error ? error.message : 'Invalid request.' } },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: { code: 'internal_error', message: 'Workflow video config request failed.' } },
    { status: 500 },
  );
}

export async function GET(_request: Request, context: { params: Promise<{ capabilityId: string }> }) {
  try {
    await requireAdmin();
    const { capabilityId } = paramsSchema.parse(await context.params);
    const config = await getWorkflowVideoMvpCapabilityConfig({ capabilityId });
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ capabilityId: string }> }) {
  try {
    const session = await requireAdmin();
    const { capabilityId } = paramsSchema.parse(await context.params);
    const body = parseWorkflowVideoConfigBody(await request.json());
    const config = await saveWorkflowVideoMvpCapabilityConfig({
      capabilityId,
      adminUserId: session.user.id,
      ...body,
    });
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 5: Add UI helper test**

Create or update `src/features/admin/admin-action-controls.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowWorkflowVideoConfigEditor } from './admin-action-controls';

test('shouldShowWorkflowVideoConfigEditor returns true for workflow-video-mvp', () => {
  assert.equal(shouldShowWorkflowVideoConfigEditor('workflow-video-mvp'), true);
  assert.equal(shouldShowWorkflowVideoConfigEditor('workflow-storyboard-template'), false);
});
```

- [ ] **Step 6: Add editor action**

In `src/features/admin/admin-action-controls.tsx`, export:

```ts
export function shouldShowWorkflowVideoConfigEditor(capabilityCode: string) {
  return capabilityCode === 'workflow-video-mvp';
}
```

Add a `WorkflowVideoCapabilityConfigDialog` modeled after `StoryboardCapabilityConfigDialog`, but use JSON `GET/PUT /workflow-video-config`, fields `description`, `promptTemplate`, `durationSeconds`, and `resolution`, and render the required material schema as read-only text: `source_image + storyboard_image + scene_background`.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts
pnpm exec tsx --test src/features/admin/admin-action-controls.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config src/server/repositories/agent-capabilities.ts src/features/admin/admin-action-controls.tsx src/features/admin/admin-action-controls.test.ts
git commit -m "feat: add workflow video capability admin config"
```

## Task 3: Add Pure Workflow Video Runtime Helpers

**Files:**
- Create: `src/server/agent/workflow-video-mvp.ts`
- Test: `src/server/agent/workflow-video-mvp.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/server/agent/workflow-video-mvp.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseWorkflowVideoMvpInput,
  renderWorkflowVideoMvpPrompt,
  WorkflowVideoMvpValidationError,
} from './workflow-video-mvp';

test('renderWorkflowVideoMvpPrompt replaces known placeholders and preserves unknown placeholders', () => {
  const prompt = renderWorkflowVideoMvpPrompt({
    template: 'A {{workflow_prompt}} {{duration_seconds}} {{missing_value}}',
    values: {
      workflow_prompt: '石头印画',
      source_image_url: 'https://signed/source.png',
      storyboard_image_url: 'https://signed/storyboard.png',
      scene_background_url: 'https://signed/scene.png',
      storyboard_prompt_map: '{"1":"开场"}',
      duration_seconds: '5',
      resolution: '720p',
    },
  });

  assert.equal(prompt, 'A 石头印画 5 {{missing_value}}');
});

test('parseWorkflowVideoMvpInput rejects missing scene background', () => {
  assert.throws(
    () =>
      parseWorkflowVideoMvpInput({
        sourceImageAssetId: '11111111-1111-4111-8111-111111111111',
        storyboardArtifactId: '22222222-2222-4222-8222-222222222222',
        storyboardPromptMap: { shot1: '开场' },
      }),
    WorkflowVideoMvpValidationError,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/agent/workflow-video-mvp.test.ts
```

Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Implement helpers**

Create `src/server/agent/workflow-video-mvp.ts`:

```ts
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class WorkflowVideoMvpValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowVideoMvpValidationError';
  }
}

export type WorkflowVideoMvpInput = {
  sourceImageAssetId: string;
  storyboardArtifactId: string;
  sceneBackgroundAssetId: string;
  storyboardPromptMap: Record<string, unknown>;
  durationSeconds?: number;
  resolution?: string;
};

export type WorkflowVideoMvpPromptValues = {
  workflow_prompt: string;
  source_image_url: string;
  storyboard_image_url: string;
  scene_background_url: string;
  storyboard_prompt_map: string;
  duration_seconds: string;
  resolution: string;
};

function readUuid(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new WorkflowVideoMvpValidationError(`workflow video input.${key} is required.`);
  }
  return value;
}

export function parseWorkflowVideoMvpInput(input: Record<string, unknown>): WorkflowVideoMvpInput {
  const storyboardPromptMap = input.storyboardPromptMap;
  if (!storyboardPromptMap || typeof storyboardPromptMap !== 'object' || Array.isArray(storyboardPromptMap)) {
    throw new WorkflowVideoMvpValidationError('workflow video input.storyboardPromptMap is required.');
  }
  const durationSeconds =
    typeof input.durationSeconds === 'number' && Number.isInteger(input.durationSeconds)
      ? input.durationSeconds
      : undefined;
  const resolution = typeof input.resolution === 'string' && input.resolution.trim()
    ? input.resolution.trim()
    : undefined;
  return {
    sourceImageAssetId: readUuid(input, 'sourceImageAssetId'),
    storyboardArtifactId: readUuid(input, 'storyboardArtifactId'),
    sceneBackgroundAssetId: readUuid(input, 'sceneBackgroundAssetId'),
    storyboardPromptMap: storyboardPromptMap as Record<string, unknown>,
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(resolution ? { resolution } : {}),
  };
}

export function renderWorkflowVideoMvpPrompt(input: {
  template: string;
  values: WorkflowVideoMvpPromptValues;
}) {
  return input.template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, key: string) => {
    return Object.hasOwn(input.values, key)
      ? input.values[key as keyof WorkflowVideoMvpPromptValues]
      : match;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm exec tsx --test src/server/agent/workflow-video-mvp.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/agent/workflow-video-mvp.ts src/server/agent/workflow-video-mvp.test.ts
git commit -m "feat: add workflow video runtime helpers"
```

## Task 4: Support Ordered Video Material URLs

**Files:**
- Modify: `src/server/ai/video-provider-adapters.ts`
- Test: `src/server/ai/video-provider-adapters.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Add to `src/server/ai/video-provider-adapters.test.ts`:

```ts
test('createVideoTask sends ordered imageUrls before audioUrl', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const adapter = createDoubaoVideoTaskAdapter({
    readEnv: () => 'test-key',
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ id: 'task-1', status: 'running' }), { status: 200 });
    },
  });

  await adapter.createVideoTask({
    runId: 'run-1',
    userId: 'user-1',
    model: makeResolvedVideoModel(),
    prompt: '生成视频',
    imageUrls: ['https://signed/source.png', 'https://signed/storyboard.png', 'https://signed/scene.png'],
    audioUrl: 'https://signed/audio.mp3',
  });

  const content = bodies[0]?.content as Array<Record<string, unknown>>;
  assert.equal(content[0]?.type, 'text');
  assert.equal(content[1]?.type, 'image_url');
  assert.deepEqual(content[1]?.image_url, { url: 'https://signed/source.png' });
  assert.deepEqual(content[2]?.image_url, { url: 'https://signed/storyboard.png' });
  assert.deepEqual(content[3]?.image_url, { url: 'https://signed/scene.png' });
  assert.equal(content[4]?.type, 'audio_url');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/ai/video-provider-adapters.test.ts
```

Expected: FAIL because `VideoProviderCreateRequest` has no `imageUrls`.

- [ ] **Step 3: Add `imageUrls` support**

In `src/server/ai/video-provider-adapters.ts`, change `VideoProviderCreateRequest`:

```ts
export type VideoProviderCreateRequest = {
  runId: string;
  userId: string;
  model: ResolvedVideoModel;
  prompt: string;
  duration?: number;
  resolution?: string;
  imageUrl?: string;
  imageUrls?: string[];
  audioUrl?: string;
  ratio?: string;
  seed?: number;
  watermark?: boolean;
};
```

In `createVideoTaskBody`, replace the single image block with:

```ts
const imageUrls = [
  ...(request.imageUrls ?? []),
  ...(request.imageUrl ? [request.imageUrl] : []),
].filter((url, index, urls) => url.trim().length > 0 && urls.indexOf(url) === index);

for (const imageUrl of imageUrls) {
  content.push({
    type: 'image_url',
    image_url: { url: imageUrl },
  });
}
```

- [ ] **Step 4: Run adapter tests**

Run:

```bash
pnpm exec tsx --test src/server/ai/video-provider-adapters.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/video-provider-adapters.ts src/server/ai/video-provider-adapters.test.ts
git commit -m "feat: support ordered video material urls"
```

## Task 5: Wire Workflow Video Runtime

**Files:**
- Modify: `src/server/agent/run-service.ts`
- Test: `src/server/agent/run-service.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Add to `src/server/agent/run-service.test.ts`:

```ts
test('workflow video fails before provider task when scene background is missing', async () => {
  const service = createAgentRunService({
    repository: createMemoryAgentRunRepository(),
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () => workflowVideoCapabilitySnapshot(),
  });

  await assert.rejects(
    () =>
      service.createAndRunAgentRun({
        userId: 'user-1',
        taskType: 'workflow',
        prompt: '生成工作流视频',
        input: {
          stage: 'workflow_video',
          sourceImageAssetId: '11111111-1111-4111-8111-111111111111',
          storyboardArtifactId: '22222222-2222-4222-8222-222222222222',
          storyboardPromptMap: { shot1: '开场' },
        },
      }),
    /sceneBackgroundAssetId/,
  );
});

test('workflow video creates doubao seedance video task with ordered materials', async () => {
  const providerRequests: Array<{ prompt: string; imageUrls?: string[] }> = [];
  const service = createAgentRunService({
    repository: createMemoryAgentRunRepository(),
    runtime: createDeterministicPiRuntime(),
    resolveWorkflowCapabilityBundle: async () => workflowVideoCapabilitySnapshot(),
    resolveVideoModelForUser: async () => resolvedVideoModel({ model: 'doubao-seedance-2-0' }),
    createVideoProviderAdapter: () => ({
      async createVideoTask(request) {
        providerRequests.push({ prompt: request.prompt, imageUrls: request.imageUrls });
        return { providerTaskId: 'task-1', rawMetadata: { id: 'task-1' } };
      },
      async getVideoTask() {
        return {
          providerTaskId: 'task-1',
          status: 'succeeded',
          outputUrl: 'https://provider.example/video.mp4',
          rawMetadata: {},
        };
      },
    }),
    mediaAssetRepository: mediaRepositoryWithImageAssets({
      '11111111-1111-4111-8111-111111111111': 'source',
      '33333333-3333-4333-8333-333333333333': 'scene',
    }),
    signVideoMaterialUrl: async (asset) => `https://signed.example/${asset.id}.png`,
  });

  await service.createAndRunAgentRun({
    userId: 'user-1',
    taskType: 'workflow',
    prompt: '生成工作流视频',
    input: {
      stage: 'workflow_video',
      sourceImageAssetId: '11111111-1111-4111-8111-111111111111',
      storyboardArtifactId: '22222222-2222-4222-8222-222222222222',
      sceneBackgroundAssetId: '33333333-3333-4333-8333-333333333333',
      storyboardPromptMap: { shot1: '开场' },
      durationSeconds: 5,
      resolution: '720p',
    },
  });

  assert.equal(providerRequests[0]?.imageUrls?.length, 3);
  assert.match(providerRequests[0]?.prompt ?? '', /生成工作流视频/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected: FAIL because workflow-video stage is not routed.

- [ ] **Step 3: Add workflow-video branch**

In `src/server/agent/run-service.ts`, import helpers:

```ts
import {
  parseWorkflowVideoMvpInput,
  renderWorkflowVideoMvpPrompt,
  WorkflowVideoMvpValidationError,
} from './workflow-video-mvp';
```

Add a stage helper:

```ts
function isWorkflowVideoMvpStage(value: unknown) {
  return value === 'workflow_video';
}
```

In the workflow branch, before the generic workflow run:

```ts
if (isWorkflowVideoMvpStage(input.input.stage)) {
  return createAndRunWorkflowVideoMvpAgentRun({
    input,
    repository,
    resolveWorkflowCapabilityBundle,
    resolveVideoModelForUser,
    assertCanAffordMinimum,
    createVideoProviderAdapter,
    resolveVideoGenerationPolicyForUser,
    mediaAssetRepository,
    signVideoMaterialUrl,
    debitForImageAgentRun,
  });
}
```

Implement `createAndRunWorkflowVideoMvpAgentRun` by:

- parsing input with `parseWorkflowVideoMvpInput`;
- resolving workflow bundle and `readWorkflowVideoMvpCapabilityConfig`;
- resolving model by the configured `doubao-seedance-2-0` model id/code using the existing video model resolver path selected for MVP;
- applying `validateVideoGenerationSelection`;
- resolving source and scene image assets through `mediaAssetRepository.findAssetForUser`;
- resolving storyboard artifact URL from the run/artifact store or existing direct artifact metadata available in repository tests;
- rendering prompt with `renderWorkflowVideoMvpPrompt`;
- calling the same provider task creation path as generic video but with `imageUrls` ordered as source, storyboard, scene.

Use existing `AgentRunVideoMaterialError` for missing materials and `ProviderConfigurationError` for missing/invalid capability config.

- [ ] **Step 4: Run runtime tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/agent/run-service.ts src/server/agent/run-service.test.ts
git commit -m "feat: run workflow video mvp through agent runtime"
```

## Task 6: Add API Boundary Validation And Workflow UI Handoff

**Files:**
- Modify: `src/app/api/agent/runs/route.ts`
- Test: `src/app/api/agent/runs/route.test.ts`
- Modify: `src/app/workflow/workflow-state.ts`
- Modify: `src/app/workflow/page.tsx`

- [ ] **Step 1: Write failing route validation tests**

Add to `src/app/api/agent/runs/route.test.ts`:

```ts
test('parseCreateAgentRunRawBody accepts workflow video material references', () => {
  const body = parseCreateAgentRunRawBody({
    taskType: 'workflow',
    prompt: '生成工作流视频',
    input: {
      stage: 'workflow_video',
      sourceImageAssetId: '11111111-1111-4111-8111-111111111111',
      storyboardArtifactId: '22222222-2222-4222-8222-222222222222',
      sceneBackgroundAssetId: '33333333-3333-4333-8333-333333333333',
      storyboardPromptMap: { shot1: '开场' },
      durationSeconds: 5,
      resolution: '720p',
    },
  });

  assert.equal(body.input.stage, 'workflow_video');
});

test('parseCreateAgentRunRawBody rejects workflow video without source image reference', () => {
  assert.throws(
    () =>
      parseCreateAgentRunRawBody({
        taskType: 'workflow',
        prompt: '生成工作流视频',
        input: {
          stage: 'workflow_video',
          storyboardArtifactId: '22222222-2222-4222-8222-222222222222',
          sceneBackgroundAssetId: '33333333-3333-4333-8333-333333333333',
          storyboardPromptMap: { shot1: '开场' },
        },
      }),
    /sourceImageAssetId/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
```

Expected: FAIL because `workflow_video` schema is not validated.

- [ ] **Step 3: Add Zod schema**

In `src/app/api/agent/runs/route.ts`, add:

```ts
const workflowVideoRunInputSchema = z.object({
  stage: z.literal('workflow_video'),
  sourceImageAssetId: z.string().uuid('input.sourceImageAssetId must be a valid UUID.'),
  storyboardArtifactId: z.string().uuid('input.storyboardArtifactId must be a valid UUID.'),
  sceneBackgroundAssetId: z.string().uuid('input.sceneBackgroundAssetId must be a valid UUID.'),
  storyboardPromptMap: z.record(z.string(), z.unknown()),
  durationSeconds: z.number().int().positive().optional(),
  resolution: optionalNonEmptyStringSchema.optional(),
});
```

In `superRefine`, add:

```ts
if (body.taskType === 'workflow' && body.input.stage === 'workflow_video') {
  const parsed = workflowVideoRunInputSchema.safeParse(body.input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['input', ...issue.path],
        message: issue.message,
      });
    }
  }
}
```

- [ ] **Step 4: Update workflow state and UI handoff**

In `src/app/workflow/workflow-state.ts`, extend the snapshot type:

```ts
export type WorkflowVideoMaterialSnapshot = {
  sourceImageAssetId: string | null;
  storyboardArtifactId: string | null;
  sceneBackgroundAssetId: string | null;
  storyboardPromptMap: Record<string, unknown> | null;
};
```

In `src/app/workflow/page.tsx`, compute:

```ts
const canStartWorkflowVideo =
  Boolean(videoMaterials.sourceImageAssetId) &&
  Boolean(videoMaterials.storyboardArtifactId) &&
  Boolean(videoMaterials.sceneBackgroundAssetId) &&
  Boolean(videoMaterials.storyboardPromptMap);
```

When the final action is clicked, call the existing agent runtime client with:

```ts
await createAgentRun({
  taskType: 'workflow',
  prompt: workflowPrompt,
  input: {
    stage: 'workflow_video',
    sourceImageAssetId: videoMaterials.sourceImageAssetId,
    storyboardArtifactId: videoMaterials.storyboardArtifactId,
    sceneBackgroundAssetId: videoMaterials.sceneBackgroundAssetId,
    storyboardPromptMap: videoMaterials.storyboardPromptMap,
    durationSeconds: selectedVideoDuration,
    resolution: selectedVideoResolution,
  },
});
```

Keep the button disabled when `canStartWorkflowVideo` is false and render the missing material label from the first missing field.

- [ ] **Step 5: Run route test and type check**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
pnpm ts-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/agent/runs/route.ts src/app/api/agent/runs/route.test.ts src/app/workflow/workflow-state.ts src/app/workflow/page.tsx
git commit -m "feat: submit workflow video materials from workflow ui"
```

## Task 7: Focused Verification

**Files:**
- Modify: `openspec/changes/workflow-12-grid-storyboard-generation/tasks.md`
- Create: `docs/superpowers/verification/2026-06-09-workflow-video-mvp.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts
pnpm exec tsx --test src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts
pnpm exec tsx --test src/features/admin/admin-action-controls.test.ts
pnpm exec tsx --test src/server/agent/workflow-video-mvp.test.ts
pnpm exec tsx --test src/server/ai/video-provider-adapters.test.ts
pnpm exec tsx --test src/server/agent/run-service.test.ts
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full validation**

Run:

```bash
pnpm validate
```

Expected: PASS. If this fails because the local database or environment is missing, record the exact failure in the verification note and still run `pnpm ts-check`.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: PASS. If it fails because `DATABASE_URL` or provider credentials are not configured, record the exact blocker.

- [ ] **Step 4: Browser verification**

Start the app:

```bash
pnpm dev
```

Verify in browser:

- `/admin/agent-capabilities` shows `workflow-video-mvp` and opens its editor.
- Saving an empty prompt is rejected.
- Saving a valid prompt/defaults updates the row summary.
- `/workflow` keeps final video disabled before source image, storyboard, and scene background exist.
- `/workflow` submits `stage: "workflow_video"` after the three material groups exist.

- [ ] **Step 5: Record verification**

Create `docs/superpowers/verification/2026-06-09-workflow-video-mvp.md`:

```md
# Workflow Video MVP Verification

Date: 2026-06-09
Change: workflow-12-grid-storyboard-generation

## Commands

- `pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts`: PASS
- `pnpm exec tsx --test src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts`: PASS
- `pnpm exec tsx --test src/features/admin/admin-action-controls.test.ts`: PASS
- `pnpm exec tsx --test src/server/agent/workflow-video-mvp.test.ts`: PASS
- `pnpm exec tsx --test src/server/ai/video-provider-adapters.test.ts`: PASS
- `pnpm exec tsx --test src/server/agent/run-service.test.ts`: PASS
- `pnpm exec tsx --test src/app/api/agent/runs/route.test.ts`: PASS
- `pnpm validate`: PASS
- `pnpm build`: PASS

## Browser

- Admin capability editor: PASS
- Workflow final-video material gating: PASS
- Workflow video submission: PASS

## Residual Risk

- Real `doubao-seedance-2-0` provider execution still depends on configured provider credentials and account entitlement in the target environment.
```

- [ ] **Step 6: Mark OpenSpec tasks**

Update `openspec/changes/workflow-12-grid-storyboard-generation/tasks.md` and check off the completed workflow-video tasks.

- [ ] **Step 7: Commit**

```bash
git add openspec/changes/workflow-12-grid-storyboard-generation/tasks.md docs/superpowers/verification/2026-06-09-workflow-video-mvp.md
git commit -m "test: verify workflow video mvp"
```

## Self-Review

- Spec coverage: Tasks cover admin capability config, public workflow material gating, runtime material validation, final prompt rendering, `doubao-seedance-2-0` binding, ordered material handoff, and verification.
- Boundary coverage: API validates input, repositories own config persistence, runtime owns prompt/material orchestration, adapter owns provider request shape, UI submits references only.
- Type consistency: `workflow-video-mvp`, `workflow_video`, `sourceImageAssetId`, `storyboardArtifactId`, `sceneBackgroundAssetId`, and `storyboardPromptMap` are used consistently across tasks.
