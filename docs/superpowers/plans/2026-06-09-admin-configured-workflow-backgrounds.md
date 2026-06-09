# Admin Configured Workflow Backgrounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace user-custom workflow video scene backgrounds with administrator-configured official background images from `docs/官网背景`.

**Architecture:** Treat the official background images as built-in static assets under `public/workflow-backgrounds`, and store availability/order/display names in the existing `workflow-video-mvp` Agent Capability config. The public workflow sends `sceneBackgroundId`; the server resolves the enabled configured background URL and rejects arbitrary user scene assets.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle-backed Agent Capability repository, Zod route validation, node:test, existing workflow video runtime, existing admin capability editor.

---

## File Structure

- Create generated/static assets under `public/workflow-backgrounds/` from `docs/官网背景/`.
- Create `src/server/agent/workflow-backgrounds.ts`: built-in official background catalog helpers and URL resolution.
- Modify `src/server/agent/types.ts`: add `WorkflowVideoSceneBackgroundConfig`.
- Modify `src/server/repositories/agent-capabilities.ts`: include `sceneBackgrounds` in `workflow-video-mvp` defaults, normalization, validation, save, and summary.
- Modify `src/server/repositories/agent-capabilities.test.ts`: config parser and validation coverage.
- Modify `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.ts`: parse background edits.
- Modify `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts`: route parser/save tests.
- Modify `src/features/admin/admin-action-controls.tsx`: add background enable/name/order controls.
- Modify `src/features/admin/admin-action-controls.test.ts`: helper coverage for background payload normalization.
- Modify `src/server/agent/workflow-video-mvp.ts`: parse `sceneBackgroundId`, not `sceneBackgroundAssetId`.
- Modify `src/server/agent/run-service.ts`: resolve configured background URLs from capability config.
- Modify `src/server/agent/run-service.test.ts`: runtime accepts enabled configured background and rejects unknown/disabled background.
- Modify `src/app/api/agent/runs/route.ts`: validate `sceneBackgroundId`.
- Modify `src/app/api/agent/runs/route.test.ts`: API boundary tests.
- Modify `src/app/workflow/workflow-state.ts`: material readiness requires configured background selection.
- Modify `src/app/workflow/workflow-state.test.ts`: readiness tests.
- Modify `src/app/workflow/page.tsx`: remove custom/AI scene modes, render enabled official backgrounds, submit `sceneBackgroundId`.

## Task 1: Add Built-In Background Catalog

**Files:**
- Copy: `docs/官网背景/**` to `public/workflow-backgrounds/**`
- Create: `src/server/agent/workflow-backgrounds.ts`
- Modify: `src/server/agent/types.ts`
- Test: `src/server/repositories/agent-capabilities.test.ts`

- [ ] **Step 1: Copy official images into public static assets**

Run:

```bash
mkdir -p public/workflow-backgrounds
rsync -a 'docs/官网背景/' public/workflow-backgrounds/
```

Expected: files exist under `public/workflow-backgrounds/<style>/<file>.png`.

- [ ] **Step 2: Add background config types**

In `src/server/agent/types.ts`, add:

```ts
export type WorkflowVideoSceneBackgroundConfig = {
  id: string;
  name: string;
  styleName: string;
  publicUrl: string;
  enabled: boolean;
  sortOrder: number;
};
```

Add `sceneBackgrounds: WorkflowVideoSceneBackgroundConfig[];` to `WorkflowVideoMvpCapabilityConfig`.

- [ ] **Step 3: Create catalog helper**

Generate `src/server/agent/workflow-backgrounds.ts` with deterministic entries for every file under `docs/官网背景`.

Run this one-off generation command from the repository root:

```bash
node --input-type=module <<'EOF'
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = 'docs/官网背景';
const prefixByStyle = new Map([
  ['1原木桌手作风', 'wood-table-handmade'],
  ['1新中式茶席风', 'new-chinese-tea'],
  ['1明亮花园成品展示风', 'bright-garden-display'],
  ['1极简白色工作台风', 'minimal-white-workbench'],
  ['1森系植物工作室风', 'botanical-studio'],
  ['1水墨新中式风', 'ink-new-chinese'],
  ['1浪漫花艺礼物风', 'romantic-floral-gift'],
  ['1清新白桌绿植风', 'fresh-white-table-plant'],
  ['1蓝色海边清爽风', 'blue-seaside-refreshing'],
  ['1轻奢女性礼物风', 'luxury-feminine-gift'],
]);

function cleanStyleName(style) {
  return style.replace(/^\\d+/, '');
}

function imageNumber(filename, index) {
  const matches = filename.match(/\\d+/g);
  return matches?.at(-1) ?? String(index + 1);
}

const entries = [];
let sortOrder = 100;
for (const style of readdirSync(root).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))) {
  const dir = join(root, style);
  const prefix = prefixByStyle.get(style);
  if (!prefix) throw new Error(`Missing prefix for ${style}`);
  const files = readdirSync(dir).filter((file) => file.endsWith('.png')).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN', { numeric: true }));
  files.forEach((file, index) => {
    const number = imageNumber(file, index);
    const styleName = cleanStyleName(style);
    entries.push({
      id: `${prefix}-${number}`,
      name: `${styleName} ${number}`,
      styleName,
      publicUrl: `/workflow-backgrounds/${style}/${file}`,
      enabled: true,
      sortOrder,
    });
    sortOrder += 10;
  });
}

const source = `import type { WorkflowVideoSceneBackgroundConfig } from './types';

export const BUILT_IN_WORKFLOW_BACKGROUNDS: WorkflowVideoSceneBackgroundConfig[] = ${JSON.stringify(entries, null, 2)} as const satisfies WorkflowVideoSceneBackgroundConfig[];

export function normalizeWorkflowSceneBackgrounds(
  input: unknown,
): WorkflowVideoSceneBackgroundConfig[] {
  const byId = new Map(
    Array.isArray(input)
      ? input
          .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item))
          .map((item) => [typeof item.id === 'string' ? item.id : '', item])
      : [],
  );

  return BUILT_IN_WORKFLOW_BACKGROUNDS.map((background) => {
    const override = byId.get(background.id);
    return {
      ...background,
      name:
        typeof override?.name === 'string' && override.name.trim()
          ? override.name.trim()
          : background.name,
      enabled:
        typeof override?.enabled === 'boolean'
          ? override.enabled
          : background.enabled,
      sortOrder:
        typeof override?.sortOrder === 'number' && Number.isFinite(override.sortOrder)
          ? override.sortOrder
          : background.sortOrder,
    };
  }).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-Hans-CN'));
}

export function findEnabledWorkflowSceneBackground(
  backgrounds: WorkflowVideoSceneBackgroundConfig[],
  backgroundId: string,
) {
  return backgrounds.find((background) => background.id === backgroundId && background.enabled) ?? null;
}
`;

writeFileSync('src/server/agent/workflow-backgrounds.ts', source);
EOF
```

The helper must export:

```ts
import type { WorkflowVideoSceneBackgroundConfig } from './types';

export const BUILT_IN_WORKFLOW_BACKGROUNDS: WorkflowVideoSceneBackgroundConfig[];

export function normalizeWorkflowSceneBackgrounds(
  input: unknown,
): WorkflowVideoSceneBackgroundConfig[] {
  const byId = new Map(
    Array.isArray(input)
      ? input
          .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item))
          .map((item) => [typeof item.id === 'string' ? item.id : '', item])
      : [],
  );

  return BUILT_IN_WORKFLOW_BACKGROUNDS.map((background) => {
    const override = byId.get(background.id);
    return {
      ...background,
      name:
        typeof override?.name === 'string' && override.name.trim()
          ? override.name.trim()
          : background.name,
      enabled:
        typeof override?.enabled === 'boolean'
          ? override.enabled
          : background.enabled,
      sortOrder:
        typeof override?.sortOrder === 'number' && Number.isFinite(override.sortOrder)
          ? override.sortOrder
          : background.sortOrder,
    };
  }).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export function findEnabledWorkflowSceneBackground(
  backgrounds: WorkflowVideoSceneBackgroundConfig[],
  backgroundId: string,
) {
  return backgrounds.find((background) => background.id === backgroundId && background.enabled) ?? null;
}
```

- [ ] **Step 4: Run type-check for new helper**

Run:

```bash
pnpm ts-check
```

Expected: PASS.

## Task 2: Persist Background Config In Workflow Video Capability

**Files:**
- Modify: `src/server/repositories/agent-capabilities.ts`
- Test: `src/server/repositories/agent-capabilities.test.ts`

- [ ] **Step 1: Write failing repository tests**

Add tests to `src/server/repositories/agent-capabilities.test.ts`:

```ts
test('readWorkflowVideoMvpCapabilityConfig includes enabled official scene backgrounds', () => {
  const snapshot = getDefaultAgentCapabilityBundle('workflow');
  const config = readWorkflowVideoMvpCapabilityConfig(snapshot!);

  assert.ok(config);
  assert.ok(config.sceneBackgrounds.length >= 50);
  assert.ok(config.sceneBackgrounds.every((background) => background.publicUrl.startsWith('/workflow-backgrounds/')));
  assert.ok(config.sceneBackgrounds.every((background) => background.enabled));
});

test('validateWorkflowVideoMvpCapabilityDraft preserves configured background edits', () => {
  const draft = validateWorkflowVideoMvpCapabilityDraft({
    description: '工作流视频',
    promptTemplate: 'prompt',
    defaults: { durationSeconds: 5, resolution: '720p' },
    sceneBackgrounds: [
      { id: 'wood-table-handmade-1', name: '手作桌面', enabled: false, sortOrder: 9 },
    ],
  });

  const edited = draft.sceneBackgrounds.find((background) => background.id === 'wood-table-handmade-1');
  assert.equal(edited?.name, '手作桌面');
  assert.equal(edited?.enabled, false);
  assert.equal(edited?.sortOrder, 9);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts
```

Expected: FAIL because `sceneBackgrounds` is not wired into config.

- [ ] **Step 3: Wire defaults and validation**

In `src/server/repositories/agent-capabilities.ts`:

- import `normalizeWorkflowSceneBackgrounds`;
- add `sceneBackgrounds: normalizeWorkflowSceneBackgrounds(null)` to `createDefaultWorkflowVideoMvpConfig`;
- extend `validateWorkflowVideoMvpCapabilityDraft` input with optional `sceneBackgrounds`;
- return `sceneBackgrounds: normalizeWorkflowSceneBackgrounds(input.sceneBackgrounds)`;
- add `sceneBackgrounds: normalizeWorkflowSceneBackgrounds(config.sceneBackgrounds)` in `normalizeWorkflowVideoMvpCapabilityConfigRecord`;
- include `背景: <enabled>/<total>` in `summarizeCapabilityConfig`;
- preserve `sceneBackgrounds` in `saveWorkflowVideoMvpCapabilityConfig`.

- [ ] **Step 4: Run repository tests**

Run:

```bash
pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/workflow-backgrounds src/server/agent/types.ts src/server/agent/workflow-backgrounds.ts src/server/repositories/agent-capabilities.ts src/server/repositories/agent-capabilities.test.ts
git commit -m "feat: add official workflow background catalog"
```

## Task 3: Extend Admin Workflow Video Config Editor

**Files:**
- Modify: `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.ts`
- Modify: `src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts`
- Modify: `src/features/admin/admin-action-controls.tsx`
- Modify: `src/features/admin/admin-action-controls.test.ts`

- [ ] **Step 1: Write failing route tests**

Update route tests to assert PUT accepts `sceneBackgrounds` with `id`, `name`, `enabled`, and `sortOrder`, and passes them to `saveConfig`.

- [ ] **Step 2: Add route parsing**

Extend `parseWorkflowVideoConfigBody` to return:

```ts
sceneBackgrounds: Array.isArray(record.sceneBackgrounds)
  ? record.sceneBackgrounds
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        name: typeof item.name === 'string' ? item.name : '',
        enabled: item.enabled === true,
        sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : 0,
      }))
  : [],
```

- [ ] **Step 3: Update admin client types**

In `src/features/admin/admin-action-controls.tsx`, add `sceneBackgrounds` to `WorkflowVideoCapabilityConfigClient`.

- [ ] **Step 4: Render background controls**

Inside `WorkflowVideoCapabilityConfigDialog`, render each background as a compact row:

- preview image from `publicUrl`;
- checkbox for enabled;
- text input for name;
- number input for sortOrder.

On save, submit the edited array in the PUT body.

- [ ] **Step 5: Run focused admin tests**

Run:

```bash
pnpm exec tsx '/Users/wlz/Documents/codeSpace/styx/src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts'
pnpm exec tsx --test src/features/admin/admin-action-controls.test.ts
pnpm ts-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.ts src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts src/features/admin/admin-action-controls.tsx src/features/admin/admin-action-controls.test.ts
git commit -m "feat: configure workflow backgrounds in admin"
```

## Task 4: Enforce Configured Backgrounds In API And Runtime

**Files:**
- Modify: `src/server/agent/workflow-video-mvp.ts`
- Modify: `src/server/agent/workflow-video-mvp.test.ts`
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`
- Modify: `src/app/api/agent/runs/route.ts`
- Modify: `src/app/api/agent/runs/route.test.ts`

- [ ] **Step 1: Write failing parser/API/runtime tests**

Update tests so workflow video input uses:

```ts
sceneBackgroundId: 'wood-table-handmade-1'
```

and no longer accepts:

```ts
sceneBackgroundAssetId: '33333333-3333-4333-8333-333333333333'
```

Runtime test should assert the third provider image URL is an absolute URL ending with `/workflow-backgrounds/1原木桌手作风/1.png`.

- [ ] **Step 2: Change pure parser**

In `src/server/agent/workflow-video-mvp.ts`, replace `sceneBackgroundAssetId` with:

```ts
sceneBackgroundId: string;
```

Validate it as a non-empty string.

- [ ] **Step 3: Change API schema**

In `src/app/api/agent/runs/route.ts`, replace `sceneBackgroundAssetId` validation with:

```ts
sceneBackgroundId: optionalNonEmptyStringSchema,
```

Add a superRefine issue if `sceneBackgroundAssetId` is present for workflow video input.

- [ ] **Step 4: Resolve configured URL in runtime**

In `createAndRunWorkflowVideoMvpAgentRun`:

- remove `resolveWorkflowVideoImageMaterialUrl` call for scene background asset;
- find enabled background with `findEnabledWorkflowSceneBackground(workflowVideoConfig.sceneBackgrounds, workflowVideoInput.sceneBackgroundId)`;
- build absolute URL from request input origin if needed.

Use helper:

```ts
function resolvePublicWorkflowBackgroundUrl(publicUrl: string, requestInput: Record<string, unknown>) {
  const baseUrl =
    typeof requestInput.origin === 'string' && requestInput.origin.startsWith('http')
      ? requestInput.origin
      : process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new AgentRunVideoMaterialError({
      code: 'invalid_request',
      message: 'workflow video scene background base URL is not configured.',
    });
  }
  return new URL(publicUrl, baseUrl).toString();
}
```

- [ ] **Step 5: Run runtime and route tests**

Run:

```bash
pnpm exec tsx --test src/server/agent/workflow-video-mvp.test.ts src/server/agent/run-service.test.ts src/app/api/agent/runs/route.test.ts
pnpm ts-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/agent/workflow-video-mvp.ts src/server/agent/workflow-video-mvp.test.ts src/server/agent/run-service.ts src/server/agent/run-service.test.ts src/app/api/agent/runs/route.ts src/app/api/agent/runs/route.test.ts
git commit -m "feat: enforce configured workflow scene backgrounds"
```

## Task 5: Replace Public Workflow Scene Selection

**Files:**
- Modify: `src/app/workflow/workflow-state.ts`
- Modify: `src/app/workflow/workflow-state.test.ts`
- Modify: `src/app/workflow/page.tsx`

- [ ] **Step 1: Write failing workflow-state tests**

Update readiness tests so they require `hasSelectedConfiguredBackground` and no longer accept `hasCustomSceneFile`.

- [ ] **Step 2: Update readiness helper**

Change `resolveWorkflowVideoMaterialReadiness` input to:

```ts
hasSelectedConfiguredBackground: boolean;
```

Return `请先选择官网背景图后再生成视频。` when missing.

- [ ] **Step 3: Load background config in `/workflow`**

Use the existing workflow video config payload source. Add state:

```ts
const [selectedSceneBackgroundId, setSelectedSceneBackgroundId] = useState<string | null>(null);
```

Render enabled backgrounds from the workflow video capability config once exposed to the client.

- [ ] **Step 4: Replace `SceneSelector`**

Remove custom upload and AI scene controls. Render official background cards with image previews, style name, and selected state.

- [ ] **Step 5: Submit `sceneBackgroundId`**

In `handleStartDream`, remove custom scene upload and `sceneBackgroundAssetId` logic. Submit:

```ts
sceneBackgroundId: selectedSceneBackgroundId,
origin: window.location.origin,
```

- [ ] **Step 6: Run UI tests and type-check**

Run:

```bash
pnpm exec tsx --test src/app/workflow/workflow-state.test.ts
pnpm ts-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/workflow/workflow-state.ts src/app/workflow/workflow-state.test.ts src/app/workflow/page.tsx
git commit -m "feat: use admin configured backgrounds in workflow ui"
```

## Task 6: Verification And Closeout

**Files:**
- Create: `docs/superpowers/verification/2026-06-09-admin-configured-workflow-backgrounds.md`
- Update OpenSpec artifacts if this change is tracked under a new active change.

- [ ] **Step 1: Run focused tests**

```bash
pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts
pnpm exec tsx '/Users/wlz/Documents/codeSpace/styx/src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts'
pnpm exec tsx --test src/features/admin/admin-action-controls.test.ts
pnpm exec tsx --test src/server/agent/workflow-video-mvp.test.ts src/server/agent/run-service.test.ts src/app/api/agent/runs/route.test.ts src/app/workflow/workflow-state.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

```bash
pnpm validate
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Browser smoke**

Run built app on an available port and verify:

- `/workflow` loads;
- Step 2 shows official background cards instead of custom upload/AI scene controls;
- admin workflow video dialog shows background configuration rows when authenticated admin state is available.

- [ ] **Step 4: Write verification report**

Create `docs/superpowers/verification/2026-06-09-admin-configured-workflow-backgrounds.md` with commands, pass/fail status, and any browser/auth blockers.

- [ ] **Step 5: Commit verification**

```bash
git add docs/superpowers/verification/2026-06-09-admin-configured-workflow-backgrounds.md
git commit -m "docs: verify admin configured workflow backgrounds"
```
