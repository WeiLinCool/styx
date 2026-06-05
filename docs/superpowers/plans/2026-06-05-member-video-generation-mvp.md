# Member Video Generation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build member-only Doubao Seedance video generation with admin-configured style prompts, plan-specific duration/resolution options, and optional image/audio materials.

**Architecture:** Add a typed video configuration domain around membership plan versions and style presets, expose a user video-config API, then reuse the existing agent run/SSE/video polling runtime. The server remains authoritative for membership, option validation, material ownership, provider URL signing, and billing inputs.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle/PostgreSQL, node:test, Zod, existing shadcn/Radix UI primitives, Tencent COS media storage.

---

## File Structure

- Create `src/server/video/video-generation-policy.ts`: pure policy resolver and validation helpers for member video access.
- Create `src/server/video/video-generation-policy.test.ts`: unit tests for free/member/config validation.
- Create `src/server/repositories/video-generation-config.ts`: DB and memory repository for style presets and plan-version video configs.
- Create `src/server/repositories/video-generation-config.test.ts`: repository/harness tests.
- Modify `src/server/db/schema.ts`: add `video_style_presets`, `membership_plan_video_configs`, and audio media kind support if needed.
- Generate Drizzle migration with `pnpm db:generate`.
- Modify `src/server/repositories/membership-plan-versions.ts`: include video policy in version records, draft save, duplicate, publish/schedule projection.
- Modify `src/app/api/admin/memberships/plans/[planId]/draft/route.ts`: parse video policy in draft payload.
- Modify `src/features/admin/admin-membership-config-module.tsx`: add compact video entitlement controls to the membership draft form.
- Create `src/app/api/admin/video-generation-config/route.ts`: admin CRUD/read endpoint for style presets.
- Create `src/features/admin/admin-video-generation-config-module.tsx`: admin style preset editor.
- Modify `src/app/admin/(console)/settings/page.tsx` or a better existing admin console page: include the style preset module.
- Create `src/app/api/agent/video-config/route.ts`: user-facing current video config endpoint.
- Modify `src/features/public/agent-runtime-client.ts`: add video-config client types and fetcher.
- Modify `src/server/media/upload-user-media.ts` and upload route/tests: allow audio assets.
- Modify `src/server/repositories/generated-media-assets.ts`: ensure audio assets can be listed and signed for owner use.
- Modify `src/app/api/agent/runs/route.ts`: validate canonical video input shape.
- Modify `src/server/agent/run-service.ts`: resolve video policy, material signed URLs, canonical input, and pass URLs to adapter.
- Modify `src/server/ai/video-provider-adapters.ts`: support image/audio content entries for Doubao.
- Modify `src/server/ai/media-provider-adapters.test.ts` or add `src/server/ai/video-provider-adapters.test.ts`: cover text/image/audio request bodies.
- Modify `src/app/video-gen/page.tsx`: consume dynamic config, gate free users, support prompt fill, upload/select materials, submit canonical input.
- Add or extend page/client tests where existing test harness permits.

## Task 1: Video Policy Domain

**Files:**
- Create: `src/server/video/video-generation-policy.ts`
- Create: `src/server/video/video-generation-policy.test.ts`

- [ ] **Step 1: Write failing policy tests**

Create tests with these cases:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveVideoGenerationPolicy,
  validateVideoGenerationSelection,
} from './video-generation-policy';

test('resolveVideoGenerationPolicy blocks free users', () => {
  const policy = resolveVideoGenerationPolicy({
    entitlement: null,
    planConfig: null,
    styles: [{ id: 'style-1', code: 'stone', name: '石头印画', prompt: '石头印画动态短片', enabled: true, sortOrder: 1 }],
  });

  assert.equal(policy.enabled, false);
  assert.equal(policy.upgradeRequired, true);
  assert.deepEqual(policy.durations, []);
  assert.deepEqual(policy.resolutions, []);
});

test('resolveVideoGenerationPolicy exposes enabled member options and defaults', () => {
  const policy = resolveVideoGenerationPolicy({
    entitlement: { planCode: 'pro-monthly', planVersionId: 'version-1' },
    planConfig: {
      enabled: true,
      allowedDurations: [5, 10],
      allowedResolutions: ['720p', '1080p'],
      defaultDuration: 5,
      defaultResolution: '720p',
    },
    styles: [
      { id: 'style-disabled', code: 'off', name: 'Off', prompt: 'off', enabled: false, sortOrder: 0 },
      { id: 'style-1', code: 'stone', name: '石头印画', prompt: '石头印画动态短片', enabled: true, sortOrder: 2 },
      { id: 'style-2', code: 'ink', name: '水墨', prompt: '水墨动态短片', enabled: true, sortOrder: 1 },
    ],
  });

  assert.equal(policy.enabled, true);
  assert.deepEqual(policy.durations, [5, 10]);
  assert.deepEqual(policy.resolutions.map((item) => item.value), ['720p', '1080p']);
  assert.equal(policy.defaults.durationSeconds, 5);
  assert.equal(policy.defaults.resolution, '720p');
  assert.deepEqual(policy.styles.map((style) => style.code), ['ink', 'stone']);
});

test('validateVideoGenerationSelection rejects options outside member policy', () => {
  const result = validateVideoGenerationSelection({
    policy: {
      enabled: true,
      upgradeRequired: false,
      message: null,
      styles: [{ id: 'style-1', code: 'stone', name: '石头印画', prompt: 'prompt', enabled: true, sortOrder: 1 }],
      durations: [5],
      resolutions: [{ value: '720p', label: '720P' }],
      defaults: { styleCode: 'stone', durationSeconds: 5, resolution: '720p' },
    },
    selection: { styleCode: 'stone', durationSeconds: 10, resolution: '720p' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_duration');
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `pnpm exec tsx --test src/server/video/video-generation-policy.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure policy module**

Implement exported types:

```ts
export type VideoStylePreset = {
  id: string;
  code: string;
  name: string;
  prompt: string;
  enabled: boolean;
  sortOrder: number;
};

export type VideoPlanConfig = {
  enabled: boolean;
  allowedDurations: number[];
  allowedResolutions: string[];
  defaultDuration: number;
  defaultResolution: string;
};

export type VideoGenerationPolicy = {
  enabled: boolean;
  upgradeRequired: boolean;
  message: string | null;
  styles: VideoStylePreset[];
  durations: number[];
  resolutions: Array<{ value: string; label: string }>;
  defaults: { styleCode: string | null; durationSeconds: number | null; resolution: string | null };
};
```

`resolveVideoGenerationPolicy` must return disabled when entitlement or plan config is missing, filter disabled styles, sort by `sortOrder`, and normalize resolution labels (`720p` -> `720P`). `validateVideoGenerationSelection` must fail when policy is disabled or style/duration/resolution is not in the policy.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm exec tsx --test src/server/video/video-generation-policy.test.ts`

Expected: PASS.

Commit:

```bash
git add src/server/video/video-generation-policy.ts src/server/video/video-generation-policy.test.ts
git commit -m "feat: add video generation policy"
```

## Task 2: Schema And Video Config Repository

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/repositories/video-generation-config.ts`
- Create: `src/server/repositories/video-generation-config.test.ts`
- Generated: `drizzle/*`

- [ ] **Step 1: Write repository tests**

Cover:

```ts
test('memory video config repository returns enabled styles in sort order', async () => {});
test('memory video config repository resolves plan version policy', async () => {});
test('normalizeVideoPlanConfig rejects defaults outside allowed options', () => {});
```

Use concrete inputs matching Task 1 types.

- [ ] **Step 2: Run tests and verify they fail**

Run: `pnpm exec tsx --test src/server/repositories/video-generation-config.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Add schema**

Add:

- `videoStylePresets` with `id`, `code`, `name`, `prompt`, `enabled`, `sortOrder`, timestamps.
- `membershipPlanVideoConfigs` with `id`, `planVersionId`, `enabled`, `allowedDurations` JSON, `allowedResolutions` JSON, `defaultDuration`, `defaultResolution`, timestamps.
- Unique index on style code.
- Unique index on plan version ID.

- [ ] **Step 4: Implement repository**

Expose:

```ts
export async function listEnabledVideoStylePresets(): Promise<VideoStylePreset[]>;
export async function listAdminVideoStylePresets(): Promise<VideoStylePreset[]>;
export async function upsertVideoStylePreset(input: VideoStylePresetInput): Promise<VideoStylePreset>;
export async function getVideoPlanConfigByVersionId(versionId: string): Promise<VideoPlanConfig | null>;
export function createMemoryVideoGenerationConfigRepository(...): VideoGenerationConfigRepository;
```

Normalization must reject empty allowed arrays and defaults not included in allowed arrays.

- [ ] **Step 5: Generate migration**

Run: `pnpm db:generate`

Expected: a new Drizzle migration and metadata changes.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm exec tsx --test src/server/repositories/video-generation-config.test.ts
pnpm exec tsx --test src/server/video/video-generation-policy.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/server/db/schema.ts src/server/repositories/video-generation-config.ts src/server/repositories/video-generation-config.test.ts drizzle
git commit -m "feat: persist video generation config"
```

## Task 3: Membership Version Video Entitlements

**Files:**
- Modify: `src/server/repositories/membership-plan-versions.ts`
- Modify: `src/server/repositories/membership-plan-versions.test.ts`
- Modify: `src/app/api/admin/memberships/plans/[planId]/draft/route.ts`
- Modify: `src/app/api/admin/memberships/membership-workspace-route.test.ts`
- Modify: `src/features/admin/admin-membership-config-module.tsx`

- [ ] **Step 1: Write failing tests**

Extend `parseMembershipDraftBody accepts pricing...` to include:

```ts
videoGenerationPolicy: {
  enabled: true,
  allowedDurations: [5, 10],
  allowedResolutions: ['720p', '1080p'],
  defaultDuration: 5,
  defaultResolution: '720p',
}
```

Assert the parsed body preserves the policy.

Add a repository test that saving a draft stores `videoGenerationPolicy` and duplicating a version carries it forward.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/memberships/membership-workspace-route.test.ts
pnpm exec tsx --test src/server/repositories/membership-plan-versions.test.ts
```

Expected: FAIL because video policy is not parsed/stored.

- [ ] **Step 3: Add typed policy to membership version records**

Add `videoGenerationPolicy: VideoPlanConfig | null` to version DTO/input types. In draft save, upsert `membershipPlanVideoConfigs` for the draft version. In loaders, join/load video config by version ID.

- [ ] **Step 4: Add admin form controls**

Add a `video` tab or section in `AdminMembershipConfigModule` with:

- enable video checkbox
- comma-separated duration seconds input
- comma-separated resolutions input
- default duration select
- default resolution select

`buildDraftPayload` must send `videoGenerationPolicy`. Disabled video sends `null` or `{ enabled: false, ... }` consistently with the route schema.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm exec tsx --test src/app/api/admin/memberships/membership-workspace-route.test.ts
pnpm exec tsx --test src/server/repositories/membership-plan-versions.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/server/repositories/membership-plan-versions.ts src/server/repositories/membership-plan-versions.test.ts src/app/api/admin/memberships src/features/admin/admin-membership-config-module.tsx
git commit -m "feat: add membership video entitlements"
```

## Task 4: Admin Style Preset Management

**Files:**
- Create: `src/app/api/admin/video-generation-config/route.ts`
- Create: `src/app/api/admin/video-generation-config/route.test.ts`
- Create: `src/features/admin/admin-video-generation-config-module.tsx`
- Modify: `src/app/admin/(console)/settings/page.tsx`

- [ ] **Step 1: Write API tests**

Test parser accepts:

```ts
{
  styles: [
    { code: 'stone', name: '石头印画', prompt: '石头印画动态短片', enabled: true, sortOrder: 1 }
  ]
}
```

Test parser rejects blank code/name/prompt.

- [ ] **Step 2: Implement admin route**

Use admin auth guard matching nearby admin routes. `GET` returns style presets. `PUT` replaces/upserts the submitted style list through the repository.

- [ ] **Step 3: Implement compact admin module**

Render rows with code, name, prompt textarea, enabled checkbox, sort order, add row, remove row, save. Keep it operational and dense; reuse existing `Button`, `Input`, `Textarea`, `Card`.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm exec tsx --test src/app/api/admin/video-generation-config/route.test.ts`

Expected: PASS.

Commit:

```bash
git add src/app/api/admin/video-generation-config src/features/admin/admin-video-generation-config-module.tsx src/app/admin
git commit -m "feat: add admin video style presets"
```

## Task 5: User Video Config API

**Files:**
- Create: `src/app/api/agent/video-config/route.ts`
- Create: `src/app/api/agent/video-config/route.test.ts`
- Modify: `src/features/public/agent-runtime-client.ts`

- [ ] **Step 1: Write route tests with dependency-injected handler**

Test:

- free user returns `{ enabled: false, upgradeRequired: true }`
- member with config returns styles, durations, resolutions, defaults, and models
- account errors map through existing response style

- [ ] **Step 2: Implement route**

Create `createVideoConfigRouteHandlers(dependencies)` for tests. Production dependencies:

- `requireActiveAccount`
- active entitlement lookup via existing membership/model entitlement utilities
- `resolvePlanVersionForEntitlement`
- video config repository
- `listAvailableVideoModelsForUser`

- [ ] **Step 3: Add client fetcher**

Add:

```ts
export type VideoGenerationConfigDto = {
  enabled: boolean;
  upgradeRequired: boolean;
  message: string | null;
  styles: Array<{ id: string; code: string; name: string; prompt: string }>;
  durations: number[];
  resolutions: Array<{ value: string; label: string }>;
  defaults: { styleCode: string | null; durationSeconds: number | null; resolution: string | null };
  models: VideoModelOption[];
};

export async function getVideoGenerationConfig(): Promise<VideoGenerationConfigDto> { ... }
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/video-config/route.test.ts
pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/app/api/agent/video-config src/features/public/agent-runtime-client.ts src/features/public/agent-runtime-client.test.ts
git commit -m "feat: expose member video config"
```

## Task 6: Audio Upload And Material Access

**Files:**
- Modify: `src/server/db/schema.ts` if media kind enum needs `audio`
- Modify: `src/server/media/upload-user-media.ts`
- Modify: `src/server/media/upload-user-media.test.ts`
- Modify: `src/app/api/user/media-assets/upload/route.ts`
- Modify: `src/app/api/user/media-assets/upload/route.test.ts`
- Modify: `src/server/repositories/generated-media-assets.ts`

- [ ] **Step 1: Write failing upload tests**

Add `upload user media stores uploaded audio in cos and creates unified asset` with `audio/mpeg`, `song.mp3`, and assert `kind === 'audio'`, `mimeType === 'audio/mpeg'`.

- [ ] **Step 2: Implement audio support**

Add allowed audio MIME types: `audio/mpeg`, `audio/wav`, `audio/mp4`, `audio/x-wav`. If schema enum lacks `audio`, add it and generate migration.

- [ ] **Step 3: Add owner access helper**

In generated media repository expose a focused method:

```ts
findAssetForUser(input: { userId: string; assetId: string }): Promise<GeneratedMediaAssetDto | null>
```

This will be used by the run service before signing provider URLs.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
pnpm exec tsx --test src/server/media/upload-user-media.test.ts
pnpm exec tsx --test src/app/api/user/media-assets/upload/route.test.ts
pnpm exec tsx --test src/server/repositories/generated-media-assets.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/server/db/schema.ts src/server/media src/app/api/user/media-assets/upload src/server/repositories/generated-media-assets.ts src/server/repositories/generated-media-assets.test.ts drizzle
git commit -m "feat: support audio media materials"
```

## Task 7: Video Run Validation And Runtime Wiring

**Files:**
- Modify: `src/app/api/agent/runs/route.ts`
- Modify: `src/app/api/agent/runs/route.test.ts`
- Modify: `src/server/agent/run-service.ts`
- Modify: `src/server/agent/run-service.test.ts`

- [ ] **Step 1: Write failing API validation tests**

Add tests:

- video accepts `durationSeconds`, `resolution`, `styleCode`, `imageAssetId`, `audioAssetId`
- video rejects non-number duration
- video rejects invalid UUID material IDs

- [ ] **Step 2: Validate canonical video input**

For `taskType === 'video'`, parse:

```ts
input: {
  durationSeconds: z.number().int().positive(),
  resolution: z.string().min(1),
  styleCode: z.string().min(1).optional(),
  imageAssetId: z.string().uuid().optional(),
  audioAssetId: z.string().uuid().optional(),
}
```

- [ ] **Step 3: Write run-service tests**

Add a test that a member video run stores canonical input and passes `durationSeconds`/`resolution` to the adapter. Add a test that policy validation failure prevents run creation.

- [ ] **Step 4: Implement service validation**

Before creating the run:

- resolve user video policy
- validate style/duration/resolution
- resolve and authorize optional image/audio assets
- create signed object URLs for provider use
- persist only asset IDs and canonical options in run input
- pass signed URLs to provider adapter request

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm exec tsx --test src/app/api/agent/runs/route.test.ts
pnpm exec tsx --test src/server/agent/run-service.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/app/api/agent/runs src/server/agent/run-service.ts src/server/agent/run-service.test.ts
git commit -m "feat: validate member video runs"
```

## Task 8: Doubao Seedance Image/Audio Adapter

**Files:**
- Modify: `src/server/ai/video-provider-adapters.ts`
- Modify or create: `src/server/ai/video-provider-adapters.test.ts`
- Modify: `src/server/ai/media-provider-adapters.test.ts` if adapter factory coverage is there

- [ ] **Step 1: Write adapter tests**

Test request body for:

- prompt only
- prompt plus `imageUrl`
- prompt plus `audioUrl`
- prompt plus both

Assert `model` equals the resolved model string and `content` includes text plus provider media entries.

- [ ] **Step 2: Implement adapter request fields**

Extend `VideoProviderCreateRequest`:

```ts
imageUrl?: string;
audioUrl?: string;
```

Update `createVideoTaskBody` to include text and optional media entries. Keep duration/resolution suffixes unless official tests prove separate fields are required.

- [ ] **Step 3: Run tests and commit**

Run:

```bash
pnpm exec tsx --test src/server/ai/video-provider-adapters.test.ts
pnpm exec tsx --test src/server/ai/media-provider-adapters.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/server/ai/video-provider-adapters.ts src/server/ai/video-provider-adapters.test.ts src/server/ai/media-provider-adapters.test.ts
git commit -m "feat: pass media to doubao video tasks"
```

## Task 9: User Video Page MVP

**Files:**
- Modify: `src/app/video-gen/page.tsx`
- Modify: `src/features/public/agent-runtime-client.ts`
- Add tests if local component test pattern supports this page

- [ ] **Step 1: Replace hardcoded options with config state**

Use `getVideoGenerationConfig`. Remove local `VIDEO_STYLES`, `DURATIONS`, `CLARITIES`. State should store `selectedStyleCode`, `durationSeconds`, and `resolution`.

- [ ] **Step 2: Add member gate**

If config returns `enabled: false`, show upgrade messaging and link to `/membership`; do not render active submit controls. Keep activation and login gates intact.

- [ ] **Step 3: Add prompt auto-fill**

Style button click:

```ts
const style = config.styles.find((item) => item.code === styleCode);
setSelectedStyleCode(styleCode);
if (style) setPrompt(style.prompt);
```

- [ ] **Step 4: Add material controls**

Add two compact sections:

- image material: upload local file or select from media library filtered to images
- audio material: upload local file or select from media library filtered to audio

Local uploads call existing `uploadUserMedia` before `createAgentRun`. Media library selection uses `listSavedMediaAssets`.

- [ ] **Step 5: Submit canonical input**

Call `createAgentRun` with:

```ts
input: {
  styleCode: selectedStyleCode,
  durationSeconds,
  resolution,
  ...(imageAssetId ? { imageAssetId } : {}),
  ...(audioAssetId ? { audioAssetId } : {}),
}
```

- [ ] **Step 6: Run focused checks and commit**

Run:

```bash
pnpm ts-check
pnpm lint:build
```

Expected: PASS.

Commit:

```bash
git add src/app/video-gen/page.tsx src/features/public/agent-runtime-client.ts
git commit -m "feat: wire member video generation page"
```

## Task 10: End-To-End Verification

**Files:**
- Modify only if verification finds defects.
- Create: `docs/superpowers/verification/2026-06-05-member-video-generation-mvp.md`

- [ ] **Step 1: Run full static validation**

Run: `pnpm validate`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `pnpm build`

Expected: PASS. If blocked by missing environment such as `DATABASE_URL`, record the exact blocker and run all non-dependent tests.

- [ ] **Step 3: Run database migration locally if configured**

Run: `pnpm db:migrate`

Expected: PASS when `DATABASE_URL` is available. If unavailable, record blocker.

- [ ] **Step 4: Browser verification**

Run the dev server:

```bash
pnpm dev
```

Verify in browser:

- free user sees video as premium and cannot submit
- member sees configured styles, durations, and resolutions
- clicking style fills prompt
- local image/audio upload displays selected material
- media library selection displays selected material
- submit starts a run and shows existing progress/result states

- [ ] **Step 5: Write verification note**

Create `docs/superpowers/verification/2026-06-05-member-video-generation-mvp.md` with commands run, pass/fail output summary, browser coverage, and any blockers.

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/verification/2026-06-05-member-video-generation-mvp.md
git commit -m "docs: verify member video generation mvp"
```

## Self-Review

- Spec coverage: member-only gate Task 1/5/7/9; style presets Task 2/4/5/9; plan-specific duration/resolution Task 2/3/5/7/9; optional image/audio materials Task 6/7/8/9; Doubao Seedance first adapter Task 8; verification Task 10.
- Placeholder scan: no unfinished placeholder markers are intentionally left in the plan.
- Type consistency: canonical runtime input uses `durationSeconds`, `resolution`, `styleCode`, `imageAssetId`, and `audioAssetId` across API, service, adapter, and page tasks.
