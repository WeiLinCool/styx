# Real AI Chat Model Billing Verification

Change: `real-ai-chat-model-billing`
Date: 2026-05-30

## Commands

- `pnpm exec tsx --test src/features/public/agent-runtime-client.test.ts src/server/repositories/ai-models.test.ts 'src/app/api/admin/ai-models/[modelId]/status/route.test.ts' src/app/api/agent/runs/route.test.ts`
  - Result: 23 tests passed.
- `pnpm exec tsx --test $(find src -name '*.test.ts' -o -name '*.test.tsx')`
  - Result: 95 tests passed.
- `pnpm run ts-check`
  - Result: passed.
- `pnpm run lint:build`
  - Result: passed.
- `pnpm run validate`
  - Result: passed (`ts-check` and `lint:build`).
- `pnpm run build`
  - Result: passed. Routes include `/admin/ai-models`, `/api/agent/chat-models`, and `/api/agent/runs`.

## Runtime Checks

- Started local dev server with `pnpm exec next dev --port 3210`.
- `curl -I -s http://localhost:3210/chat`
  - Result: HTTP 200.
- `curl -I -s http://localhost:3210/admin/ai-models`
  - Result: HTTP 200.
- `curl -s http://localhost:3210/api/agent/chat-models`
  - Result: unauthenticated request returns `session_required`, as expected.
- Chrome headless screenshot: `/tmp/styx-chat-verify/chat.png`
  - Result: chat page rendered nonblank with model selector in unavailable unauthenticated state and no obvious layout overlap.
- Chrome headless screenshot: `/tmp/styx-chat-verify/admin-ai-models.png`
  - Result: admin route rendered nonblank and correctly showed the admin login gate without an admin session.

## Notes

- The in-app Browser plugin reported `Browser is not available: iab`, so screenshot verification used local Chrome headless instead.
- No admin credentials were configured in this worktree environment, so authenticated `/admin/ai-models` table interaction was covered by repository/API tests, `next build`, and the route/login-gate screenshot rather than a logged-in browser session.
