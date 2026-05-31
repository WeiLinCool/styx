# Transient Image Generation Verification

Date: 2026-05-31
Spec: docs/superpowers/specs/2026-05-31-transient-image-generation-design.md
Worktree: /Users/wlz/Documents/codeSpace/styx/.worktrees/transient-image-generation

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/server/agent/run-service.test.ts src/app/api/agent/runs/route.test.ts src/features/public/agent-runtime-client.test.ts` | PASS | 35 tests passed, 0 failed. Covers transient image return, sanitized durable artifacts, API response, and client contract. |
| `pnpm validate` | BLOCKED | `lint:build` did not report before `ts-check` failed. `ts-check` is blocked by pre-existing unrelated test type errors in `src/app/api/auth/login/route.test.ts`, `src/server/db/schema.points.test.ts`, and `src/server/repositories/admin-mutations.points.test.ts`. No errors were reported for files changed by this implementation. |
| `pnpm build` | PASS | Production build compiled successfully and registered `/image-gen` and `/api/agent/runs`. Next.js warned about multiple lockfiles because this is a nested git worktree with its own install artifacts. |

## Browser Verification

- Route: `http://127.0.0.1:4000/image-gen`
- Server: `pnpm dev:pw` with `STYX_ENABLE_DEV_AUTH=true`, port `4000`.
- Browser method: local Playwright Chromium because the Codex in-app Browser returned `Browser is not available: iab`.
- Auth state: browser verification mocked `/api/auth/me` as an active user because this worktree has no `DATABASE_URL`, so the development auth path cannot load a real database user.
- Runtime response: browser verification mocked `/api/agent/runs` to return a succeeded image run plus one `transientArtifacts` image payload.
- Result: generated image preview rendered, `下载图片` rendered, `复制提示词` rendered, and warning copy rendered: `图片不会保存到服务器，请及时下载。刷新、离开页面或生成下一张后无法恢复。`
- Refresh behavior: after page reload, `下载图片` count was `0`, confirming the generated image was not recoverable from server state.
- Screenshot: `/tmp/styx-image-gen-result.png`
- Unauthenticated baseline screenshot: `/tmp/styx-image-gen-initial.png`

## Invariant Check

- Generated image media is returned only through `transientArtifacts` in the service/API contract.
- Persisted image artifact summaries have `body === null` and `url === null` in focused service tests.
- UI warns that refresh/navigation or generating another image loses generated media.
- `高清修复` and `图片换风格` are guarded with a clear not-yet-open message instead of submitting fake upload-based work.

## Blockers Or Residual Risk

- `pnpm validate` remains blocked by unrelated repository type errors in existing test files:
  - `src/app/api/auth/login/route.test.ts`
  - `src/server/db/schema.points.test.ts`
  - `src/server/repositories/admin-mutations.points.test.ts`
- Real authenticated browser generation against the route could not be performed without `DATABASE_URL` and an active development user record. The service/API/client tests and mocked browser flow cover the implemented contract and UI behavior.
- The worktree install created a local `pnpm-lock.yaml` under `.worktrees/transient-image-generation`, which Next.js reports as an additional lockfile during build. It remains inside the ignored `.worktrees/` directory.
