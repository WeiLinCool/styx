# Workflow Storyboard Admin Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move workflow storyboard template image and full prompt ownership into the existing Agent Capability admin system so operators can configure storyboard behavior without front-end code changes.

**Architecture:** Reuse `agent_capabilities.config` as the storyboard configuration store, add one admin-only multipart save/read route plus a small admin editor UI on the existing Agent Capability page, then make storyboard runtime read that capability config before building provider requests. For OpenAI edit providers, extend the image adapter to support ordered multi-image uploads so the admin template image and user pattern image can be sent together.

**Tech Stack:** Next.js App Router, React client components, node:test, TypeScript, Zod, Tencent COS storage helpers, existing admin runtime helpers, OpenAI-compatible image provider adapters.

---

### Task 1: Add storyboard capability config parsing and repository support

**Files:**
- Modify: `src/server/repositories/agent-capabilities.ts`
- Modify: `src/server/agent/types.ts`
- Create: `src/server/repositories/agent-capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDefaultAgentCapabilityBundle,
  readStoryboardCapabilityConfig,
} from './agent-capabilities';

test('readStoryboardCapabilityConfig returns storyboard prompt and template config from workflow capability snapshot', () => {
  const snapshot = getDefaultAgentCapabilityBundle('workflow');
  assert.ok(snapshot);

  const config = readStoryboardCapabilityConfig(snapshot!);

  assert.equal(config?.code, 'workflow-storyboard-template');
  assert.equal(config?.promptText.includes('{{workflow_prompt}}'), true);
  assert.equal(config?.layout.width, 1086);
  assert.equal(config?.layout.height, 1448);
  assert.equal(config?.layout.columns, 4);
  assert.equal(config?.layout.rows, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts`
Expected: FAIL because `readStoryboardCapabilityConfig` and the storyboard capability seed/config do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export type WorkflowStoryboardCapabilityConfig = {
  code: 'workflow-storyboard-template';
  promptText: string;
  templateAsset: {
    storageProvider: 'tencent_cos';
    bucket: string;
    region: string;
    objectKey: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
    originalFilename: string;
    uploadedAt: string;
  } | null;
  layout: {
    width: number;
    height: number;
    columns: 4;
    rows: 3;
  };
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export function readStoryboardCapabilityConfig(snapshot: AgentCapabilitySnapshot) {
  const capability = snapshot.capabilities.find(
    (item) => item.code === 'workflow-storyboard-template',
  );
  if (!capability) {
    return null;
  }

  const config = capability.config as Record<string, unknown>;
  return {
    code: 'workflow-storyboard-template' as const,
    promptText: typeof config.promptText === 'string' ? config.promptText : '',
    templateAsset: isStoryboardTemplateAsset(config.templateAsset) ? config.templateAsset : null,
    layout: isStoryboardLayout(config.layout)
      ? config.layout
      : { width: 1086, height: 1448, columns: 4 as const, rows: 3 as const },
    updatedAt: typeof config.updatedAt === 'string' ? config.updatedAt : null,
    updatedByUserId: typeof config.updatedByUserId === 'string' ? config.updatedByUserId : null,
  };
}
```

Also update the workflow seed capability list:

```ts
{
  id: '55555555-5555-4555-8555-555555555555',
  kind: 'skill',
  code: 'workflow-storyboard-template',
  name: '工作流分镜模板',
  status: 'enabled',
  config: {
    promptText: '',
    templateAsset: null,
    layout: { width: 1086, height: 1448, columns: 4, rows: 3 },
    updatedAt: null,
    updatedByUserId: null,
  },
}
```

and include that capability in the workflow default bundle.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/agent-capabilities.ts src/server/agent/types.ts src/server/repositories/agent-capabilities.test.ts
git commit -m "feat: add storyboard capability config parsing"
```

### Task 2: Add admin storyboard config upload/read services and route coverage

**Files:**
- Create: `src/server/media/upload-admin-storyboard-template.ts`
- Create: `src/server/media/upload-admin-storyboard-template.test.ts`
- Create: `src/app/api/admin/agent-capabilities/[capabilityId]/storyboard-config/route.ts`
- Create: `src/app/api/admin/agent-capabilities/[capabilityId]/storyboard-config/route.test.ts`
- Modify: `src/server/repositories/agent-capabilities.ts`
- Modify: `src/features/admin/admin-i18n.ts`

- [ ] **Step 1: Write the failing upload service test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { createUploadAdminStoryboardTemplateService } from './upload-admin-storyboard-template';

test('upload admin storyboard template stores image, extracts dimensions, and returns template descriptor', async () => {
  let uploadedKey = '';
  const service = createUploadAdminStoryboardTemplateService({
    cosClient: {
      async uploadObject(input) {
        uploadedKey = input.objectKey;
        return { bucket: 'bucket-a', region: 'ap-shanghai', objectKey: input.objectKey };
      },
      async deleteObject() {},
    },
    inspectImage: async () => ({ width: 1086, height: 1448, mimeType: 'image/png' }),
  });

  const result = await service.uploadTemplate({
    capabilityId: 'cap-1',
    filename: 'template.png',
    mimeType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
  });

  assert.equal(result.width, 1086);
  assert.equal(result.height, 1448);
  assert.equal(result.mimeType, 'image/png');
  assert.match(uploadedKey, /^admin-config\/.+\/agent-capabilities\/cap-1\/storyboard-template\//);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/server/media/upload-admin-storyboard-template.test.ts`
Expected: FAIL because the service does not exist yet.

- [ ] **Step 3: Write the upload service**

```ts
export function createUploadAdminStoryboardTemplateService(dependencies: {
  cosClient: Pick<TencentCosClient, 'uploadObject' | 'deleteObject'>;
  inspectImage?: (bytes: Uint8Array) => Promise<{ width: number; height: number; mimeType: string }>;
}) {
  return {
    async uploadTemplate(input: {
      capabilityId: string;
      filename: string;
      mimeType: string;
      bytes: Uint8Array;
    }) {
      if (!SUPPORTED_IMAGE_TYPES.has(input.mimeType)) {
        throw new Error('仅支持上传 PNG、JPEG 或 WebP 模板图。');
      }

      const metadata = await inspectImageBytes(input.bytes);
      const uploadId = randomUUID();
      const objectKey = `admin-config/${process.env.NODE_ENV ?? 'development'}/agent-capabilities/${input.capabilityId}/storyboard-template/${uploadId}${extensionForMimeType(metadata.mimeType)}`;
      const uploaded = await dependencies.cosClient.uploadObject({
        objectKey,
        body: input.bytes,
        contentType: metadata.mimeType,
      });

      return {
        storageProvider: 'tencent_cos' as const,
        bucket: uploaded.bucket,
        region: uploaded.region,
        objectKey: uploaded.objectKey,
        mimeType: metadata.mimeType,
        byteSize: input.bytes.byteLength,
        width: metadata.width,
        height: metadata.height,
        originalFilename: input.filename,
        uploadedAt: new Date().toISOString(),
      };
    },
  };
}
```

- [ ] **Step 4: Write the failing route tests**

```ts
test('GET storyboard-config returns prompt, layout, template metadata, and preview url', async () => {
  const response = await GET(
    new Request('https://example.com/api/admin/agent-capabilities/cap-1/storyboard-config'),
    { params: Promise.resolve({ capabilityId: 'cap-1' }) },
  );
  assert.equal(response.status, 200);
});

test('PUT storyboard-config rejects empty prompt text', async () => {
  const formData = new FormData();
  formData.set('promptText', '   ');
  const request = new Request('https://example.com/api/admin/agent-capabilities/cap-1/storyboard-config', {
    method: 'PUT',
    body: formData,
  });
  const response = await PUT(request, { params: Promise.resolve({ capabilityId: 'cap-1' }) });
  assert.equal(response.status, 400);
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm exec tsx --test src/app/api/admin/agent-capabilities/[capabilityId]/storyboard-config/route.test.ts`
Expected: FAIL because the route does not exist yet.

- [ ] **Step 6: Write the route and repository support**

```ts
export async function GET(
  _request: Request,
  context: { params: Promise<{ capabilityId: string }> },
) {
  const session = await requireAdmin();
  const { capabilityId } = paramsSchema.parse(await context.params);
  const config = await getStoryboardCapabilityConfig({ capabilityId, adminUserId: session.user.id });
  return NextResponse.json({ ok: true, config }, { status: 200 });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ capabilityId: string }> },
) {
  const session = await requireAdmin();
  const { capabilityId } = paramsSchema.parse(await context.params);
  const formData = await request.formData();
  const promptText = promptSchema.parse(formData.get('promptText'));
  const file = formData.get('templateFile');

  const config = await saveStoryboardCapabilityConfig({
    capabilityId,
    adminUserId: session.user.id,
    promptText,
    templateFile: file instanceof File ? file : null,
  });

  return NextResponse.json({ ok: true, config }, { status: 200 });
}
```

Add repository helpers that:
- read a single capability record;
- normalize config shape;
- save prompt-only updates when a template already exists;
- replace template asset safely when a new file is uploaded.

- [ ] **Step 7: Run tests to verify they pass**

Run:
- `pnpm exec tsx --test src/server/media/upload-admin-storyboard-template.test.ts`
- `pnpm exec tsx --test src/app/api/admin/agent-capabilities/[capabilityId]/storyboard-config/route.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/media/upload-admin-storyboard-template.ts src/server/media/upload-admin-storyboard-template.test.ts src/app/api/admin/agent-capabilities/[capabilityId]/storyboard-config/route.ts src/app/api/admin/agent-capabilities/[capabilityId]/storyboard-config/route.test.ts src/server/repositories/agent-capabilities.ts src/features/admin/admin-i18n.ts
git commit -m "feat: add admin storyboard capability config routes"
```

### Task 3: Add the admin storyboard capability editor UI

**Files:**
- Modify: `src/features/admin/admin-action-controls.tsx`
- Modify: `src/app/admin/(console)/agent-capabilities/page.tsx`

- [ ] **Step 1: Add a focused UI test or helper test if one exists**

```ts
test('storyboard capability row exposes edit config action', () => {
  const capability = {
    id: 'cap-1',
    code: 'workflow-storyboard-template',
    status: 'enabled',
  };
  assert.equal(shouldShowStoryboardConfigEditor(capability), true);
});
```

If the repo does not already use component rendering tests for this module, keep this step as a pure helper test colocated with the action logic.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test <focused helper test file>`
Expected: FAIL because the helper/editor behavior does not exist yet.

- [ ] **Step 3: Implement the editor UI**

```tsx
function StoryboardCapabilityConfigDialog({
  capabilityId,
  capabilityName,
}: {
  capabilityId: string;
  capabilityName: string;
}) {
  const [open, setOpen] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [layoutLabel, setLayoutLabel] = useState<string>('未配置');

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set('promptText', promptText);
    if (templateFile) {
      formData.set('templateFile', templateFile);
    }
    await adminApiRequest(`/api/admin/agent-capabilities/${capabilityId}/storyboard-config`, {
      method: 'PUT',
      body: formData,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">编辑配置</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{capabilityName}</DialogTitle>
          <DialogDescription>上传唯一分镜模板图并编辑全文提示词。</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
```

Wire this into `AdminAgentCapabilityActions` so it only appears for `workflow-storyboard-template`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm exec tsx --test <focused helper test file>`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/admin-action-controls.tsx src/app/admin/(console)/agent-capabilities/page.tsx
git commit -m "feat: add storyboard capability editor ui"
```

### Task 4: Make storyboard runtime read admin capability config and render placeholders

**Files:**
- Modify: `src/server/agent/workflow-storyboard.ts`
- Modify: `src/server/agent/workflow-storyboard.test.ts`
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`

- [ ] **Step 1: Write the failing storyboard config tests**

```ts
test('renderWorkflowStoryboardPrompt injects configured placeholders', () => {
  const prompt = renderWorkflowStoryboardPrompt({
    templatePrompt: '模板 {{workflow_prompt}} / {{template_width}}x{{template_height}}',
    workflowPrompt: '石头印画',
    sourceImageOrigin: 'manual',
    selectedImageModelId: 'model-1',
    layout: { width: 1086, height: 1448, columns: 4, rows: 3 },
  });

  assert.equal(prompt, '模板 石头印画 / 1086x1448');
});

test('resolveWorkflowStoryboardCanonicalSize returns configured layout size', () => {
  assert.equal(
    resolveWorkflowStoryboardCanonicalSize({ width: 1086, height: 1448, columns: 4, rows: 3 }),
    '1086x1448',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/server/agent/workflow-storyboard.test.ts`
Expected: FAIL because config-driven prompt rendering and canonical size helpers do not exist yet.

- [ ] **Step 3: Implement config-driven prompt rendering**

```ts
export function renderWorkflowStoryboardPrompt(input: {
  templatePrompt: string;
  workflowPrompt: string;
  sourceImageOrigin: string;
  selectedImageModelId: string | null;
  layout: { width: number; height: number; columns: number; rows: number };
}) {
  const values: Record<string, string> = {
    workflow_prompt: input.workflowPrompt,
    source_image_origin: input.sourceImageOrigin,
    selected_image_model_id: input.selectedImageModelId ?? '',
    template_width: String(input.layout.width),
    template_height: String(input.layout.height),
    template_columns: String(input.layout.columns),
    template_rows: String(input.layout.rows),
  };

  return input.templatePrompt.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, key) =>
    Object.hasOwn(values, key) ? values[key] : match,
  );
}
```

Update `createAndRunWorkflowStoryboardImageAgentRun(...)` to:
- resolve the workflow capability snapshot;
- read storyboard config from it;
- fail closed if prompt/template config is missing;
- set canonical size from config layout;
- store config metadata in run input/capability snapshot.

- [ ] **Step 4: Run focused tests**

Run:
- `pnpm exec tsx --test src/server/agent/workflow-storyboard.test.ts`
- `pnpm exec tsx --test src/server/agent/run-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/agent/workflow-storyboard.ts src/server/agent/workflow-storyboard.test.ts src/server/agent/run-service.ts src/server/agent/run-service.test.ts
git commit -m "feat: drive storyboard runtime from capability config"
```

### Task 5: Extend provider edit transport for storyboard multi-image uploads

**Files:**
- Modify: `src/server/ai/image-provider-adapters.ts`
- Modify: `src/server/ai/image-provider-adapters.test.ts`

- [ ] **Step 1: Write the failing multi-image provider test**

```ts
test('openai storyboard edit mode appends template image and user image in order', async () => {
  const adapter = createDoubaoImageProviderAdapter({ fetch, readEnv: () => 'test-key' });

  await adapter.runImage({
    runId: 'run-1',
    userId: 'user-1',
    model: makeResolvedImageModel({
      providerCode: 'openai',
      providerName: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1/',
      model: 'gpt-image-2',
    }),
    mode: 'edit',
    prompt: 'replace pattern',
    sourceImageDataUrl: 'data:image/png;base64,USER',
    additionalImageDataUrls: ['data:image/png;base64,TEMPLATE'],
  });

  const images = requests[0]?.body?.getAll('image[]') ?? [];
  assert.equal(images.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/server/ai/image-provider-adapters.test.ts`
Expected: FAIL because `additionalImageDataUrls` is not supported yet.

- [ ] **Step 3: Implement minimal multi-image support**

```ts
export type ImageProviderRequest = {
  // existing fields...
  sourceImageDataUrl?: string;
  additionalImageDataUrls?: string[];
};

function createOpenAiImageEditFormData(request: ImageProviderRequest): FormData {
  const images = [
    ...(request.additionalImageDataUrls ?? []),
    ...(request.sourceImageDataUrl ? [request.sourceImageDataUrl] : []),
  ];
  if (images.length === 0) {
    throw new ProviderRequestError('Provider image edit request is missing a source image.');
  }

  const formData = new FormData();
  formData.set('model', request.model.model);
  formData.set('prompt', request.prompt);
  if (request.size) {
    formData.set('size', request.size);
  }

  images.forEach((image) => {
    formData.append('image[]', decodeImageDataUrlToFile(image));
  });
  return formData;
}
```

- [ ] **Step 4: Run the provider tests**

Run: `pnpm exec tsx --test src/server/ai/image-provider-adapters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/image-provider-adapters.ts src/server/ai/image-provider-adapters.test.ts
git commit -m "feat: support storyboard multi-image edit uploads"
```

### Task 6: Wire storyboard template images into runtime requests and verify end-to-end

**Files:**
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`
- Modify: `src/app/api/agent/runs/route.test.ts`
- Verify: `/admin/agent-capabilities`
- Verify: `/workflow`

- [ ] **Step 1: Add the failing runtime test**

```ts
test('workflow storyboard passes admin template image before user pattern image for openai edit models', async () => {
  const providerRequests: Array<{ additionalImageDataUrls?: string[]; sourceImageDataUrl?: string }> = [];

  // resolve workflow capability config to include template asset data URL
  // run storyboard generation

  assert.deepEqual(providerRequests[0]?.additionalImageDataUrls?.length, 1);
  assert.equal(providerRequests[0]?.sourceImageDataUrl, 'data:image/png;base64,SOURCE');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `pnpm exec tsx --test src/server/agent/run-service.test.ts`
- `pnpm exec tsx --test src/app/api/agent/runs/route.test.ts`
Expected: FAIL because runtime does not yet attach template image data to provider requests or config-driven validation.

- [ ] **Step 3: Implement the runtime handoff**

```ts
const storyboardConfig = requireStoryboardCapabilityConfig(workflowCapabilitySnapshot);
const templateImageDataUrl = await loadStoryboardTemplateAsDataUrl(storyboardConfig.templateAsset);

const providerResult = await adapter.runImage({
  runId: input.running.id,
  userId: input.request.userId,
  model: input.model,
  mode: input.mode,
  prompt: input.request.prompt,
  size: input.providerSize,
  sourceImageDataUrl: input.sourceImageDataUrl,
  additionalImageDataUrls: [templateImageDataUrl],
});
```

Also update route-level tests if request validation or error mapping changes.

- [ ] **Step 4: Run the focused end-to-end test set**

Run:
- `pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts`
- `pnpm exec tsx --test src/server/media/upload-admin-storyboard-template.test.ts`
- `pnpm exec tsx --test src/app/api/admin/agent-capabilities/[capabilityId]/storyboard-config/route.test.ts`
- `pnpm exec tsx --test src/server/agent/workflow-storyboard.test.ts`
- `pnpm exec tsx --test src/server/agent/run-service.test.ts`
- `pnpm exec tsx --test src/server/ai/image-provider-adapters.test.ts`
- `pnpm exec tsx --test src/app/api/agent/runs/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Run verification commands**

Run:
- `pnpm validate`
- `pnpm build`

Expected: both commands exit 0.

- [ ] **Step 6: Browser verification**

Run the app and verify manually:

1. open `/admin/agent-capabilities`
2. edit the `workflow-storyboard-template` capability
3. upload the approved storyboard template image
4. paste a full prompt containing placeholders
5. save and confirm preview + dimensions are visible
6. open `/workflow`
7. generate storyboard with an OpenAI edit model
8. confirm missing-config errors fail closed when the config is incomplete

- [ ] **Step 7: Commit**

```bash
git add src/server/agent/run-service.ts src/server/agent/run-service.test.ts src/app/api/agent/runs/route.test.ts
git commit -m "feat: execute storyboard runs from admin capability config"
```

