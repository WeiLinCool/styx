---
change: admin-configured-workflow-backgrounds
verified-at: 2026-06-09 12:51:34 CST
base-ref: 469a03d
---

# Admin Configured Workflow Backgrounds Verification

## Scope

- Admin-configured official workflow scene backgrounds are exposed to public workflow video config.
- Public `/workflow` scene step no longer exposes custom scene upload, AI scene generation, or reference scene generation entry points.
- Workflow video submissions send `sceneBackgroundId` and `origin`; legacy `sceneBackgroundAssetId` remains rejected at the API boundary.
- Runtime still resolves configured official background URLs server-side from the workflow video capability snapshot.

## Commands

- `pnpm exec tsx --test src/app/workflow/workflow-state.test.ts`
  - Passed: 10/10 tests.
- `pnpm exec tsx --test src/app/api/agent/video-config/route.test.ts`
  - Passed: 6/6 tests.
- `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts`
  - Passed: 42/42 tests.
- `pnpm exec tsx --test src/app/api/agent/runs/route.test.ts`
  - Passed: 34/34 tests.
- `pnpm exec tsx --test src/server/repositories/agent-capabilities.test.ts`
  - Passed: 8/8 tests.
- `pnpm exec tsx '/Users/wlz/Documents/codeSpace/styx/src/app/api/admin/agent-capabilities/[capabilityId]/workflow-video-config/route.test.ts'`
  - Passed: 4/4 tests.
- `pnpm exec tsx --test src/features/admin/admin-action-controls.test.ts`
  - Passed: 1/1 tests.
- `pnpm exec tsx --test src/server/agent/workflow-video-mvp.test.ts src/server/agent/run-service.test.ts src/app/workflow/workflow-state.test.ts`
  - Passed: 60/60 tests.
- `pnpm validate`
  - Passed: `ts-check` and `lint:build`.
- `pnpm build`
  - Passed: Next.js production build completed successfully.
- `git diff --check`
  - Passed: no whitespace errors.

## Smoke Checks

- `curl -I http://localhost:3000/workflow`
  - Returned `HTTP/1.1 200 OK`.
- Source scan confirmed `/workflow` no longer contains the public labels or props for custom scene upload / AI scene generation / reference scene generation:
  - `自定义场景`
  - `AI生成场景`
  - `生成参考图`
  - `onCustomUpload`

## Environment Limits

- A separate Next dev process already held `.next/dev/lock`, so a fresh `pnpm dev` instance for this exact shell could not be started without killing an unrelated local process.
- Playwright was not installed in the local project, so interactive browser screenshots/click verification were not run.
- Admin authenticated browser verification was not run because no admin browser session/credentials were available in this environment.
