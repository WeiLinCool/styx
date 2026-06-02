# Direct Media Result Push Verification

Date: 2026-06-01
Spec: docs/superpowers/specs/2026-06-01-direct-media-result-push-design.md
Plan: docs/superpowers/plans/2026-06-01-direct-media-result-push.md

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/server/agent/media-results.test.ts src/server/agent/run-service.test.ts src/features/public/agent-runtime-client.test.ts src/app/api/agent/runs/route.test.ts` | PASS | 51 tests passed. Covers media result normalization, expiry fallback, async media run events, required artifact delivery, client SSE payload parsing, and route response helpers. |
| `pnpm validate` | BLOCKED | `ts-check` failed on pre-existing unrelated test typing errors in `src/app/api/auth/login/route.test.ts`, `src/server/db/schema.points.test.ts`, and `src/server/repositories/admin-mutations.points.test.ts`. No direct-media files were reported in the failure output. |
| `pnpm build` | PASS | Production build compiled successfully. Route list includes `/image-gen`, `/video-gen`, `/api/agent/runs`, and `/api/agent/runs/[runId]/events`. Next.js warned about multiple lockfiles in the parent checkout and worktree. |
| `pnpm exec eslint src/app/image-gen/page.tsx src/server/agent/media-results.ts src/server/agent/run-service.ts src/server/agent/media-results.test.ts src/server/agent/run-service.test.ts --quiet` | BLOCKED | Failed on existing `import/no-cycle` at `src/server/agent/run-service.ts:13` through `src/server/repositories/ai-models.ts`. This matches the known unrelated `lint:build` baseline noted during review. |

## Browser Verification

Dev server:

- `pnpm dev`
- Port `3000` was occupied, so Next.js served `http://localhost:3001`.

Browser method:

- The Codex in-app Browser backend returned `Browser is not available: iab`.
- Verification used local Playwright Chromium via `@playwright/test`.

Unauthenticated route smoke:

- `/image-gen` rendered the page header, login action, and `开始生成`.
- `/video-gen` rendered the page header, login action, and `开始生成`.
- Screenshots:
  - `/tmp/styx-direct-media-image-gen.png`
  - `/tmp/styx-direct-media-video-gen.png`

Mocked authenticated API/SSE flow:

- `/image-gen`:
  - Mocked `/api/auth/me` as an active user.
  - Mocked `POST /api/agent/runs` as a running image run.
  - Mocked `/api/agent/runs/run-image/events` with `artifact_completed` and `run_completed`.
  - Result: page rendered an image preview, `下载图片`, and the warning `生成结果暂未保存到云端，请及时下载。链接可能过期，刷新或离开页面后可能无法恢复。`
  - Screenshot: `/tmp/styx-direct-media-image-result.png`
  - Final recheck screenshot after review fixes: `/tmp/styx-direct-media-image-result-final.png`
- `/video-gen`:
  - Mocked `/api/auth/me` as an active user.
  - Mocked `POST /api/agent/runs` as a running video run.
  - Mocked `/api/agent/runs/run-video/events` with a provider-direct SVG development preview and `run_completed`.
  - Result: page rendered the image fallback preview for explicit `image/svg+xml`, `下载视频`, and the same direct-delivery warning.
  - Screenshot: `/tmp/styx-direct-media-video-result.png`
  - Final recheck screenshot after review fixes: `/tmp/styx-direct-media-video-result-final.png`

## Residual Risk

- MVP uses provider-direct delivery. Generated media is not saved to OSS/TOS/COS.
- Provider URLs may expire after delivery.
- Authenticated live generation against the local database was not possible because this environment has no `DATABASE_URL` or configured active development user. Service/API/client tests and mocked browser SSE verification cover the implemented contract.
- `pnpm validate` remains blocked by unrelated repository baseline type errors listed above.
- Targeted eslint over changed server/page files remains blocked by the unrelated pre-existing `import/no-cycle` baseline between `src/server/agent/run-service.ts` and `src/server/repositories/ai-models.ts`.
