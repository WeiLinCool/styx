# Doubao Image Generation Loop Verification

Change: `doubao-image-generation-loop`
Date: 2026-06-01

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/server/repositories/ai-models.test.ts src/server/ai/image-provider-adapters.test.ts src/app/api/agent/image-models/route.test.ts src/app/api/agent/runs/route.test.ts src/server/agent/run-service.test.ts src/features/public/agent-runtime-client.test.ts src/server/api-request-guard.test.ts src/server/repositories/request-idempotency.test.ts` | PASS | 95/95 tests passed. |
| `openspec validate doubao-image-generation-loop --strict` | PASS | Change is valid. |
| `pnpm db:generate` | PASS | No schema changes; existing migration output is current. |
| `pnpm build` | PASS | Next.js production build completed successfully. |
| `pnpm ts-check` | FAIL | Existing unrelated failures remain in `src/server/db/schema.points.test.ts` and `src/server/repositories/admin-mutations.points.test.ts`; no changed image-generation files were reported. |

## Browser Verification

- Route: `http://localhost:3000/image-gen`
- Method: existing local Next dev process on port 3000; `curl -I` and HTML response inspection.
- Result: route returned `200 OK` and loaded the `/image-gen` client page bundle.
- Blocker: a new `pnpm dev` instance could not start because another Next dev process held `.next/dev/lock`; Playwright was not importable in the current workspace; authenticated API calls to `/api/agent/image-models?mode=generate` and `mode=upscale` returned `500 internal_error` with `Unexpected account service error`, so authenticated model-list and submit flows could not be browser-executed in this local state.
- Screenshot path: none captured.

## Invariants Checked

- Management-configured image models are the user source through `/api/agent/image-models`.
- Runtime rechecks selected model status, image mode support, and user entitlement before provider execution.
- Image runs require top-level `modelId`; model-less image runs no longer fall through to the legacy runtime path.
- Edit/upscale source images are validated at API and service layers before model resolution, provider execution, or debit.
- Uploaded source media is stripped from durable run input.
- Generated image media is returned as transient artifacts and stripped from durable run artifacts.
- Idempotent replay summaries strip transient artifact `dataUrl` payloads while preserving the live first response.
- Successful image billing uses the selected model minimum credit cost and an image-specific idempotency key.
- Provider failures and preflight failures do not debit credits.
- Post-debit observational event failures do not erase the billed run snapshot.

## Known Constraints

- Full authenticated browser submission was not executed because local account service/API state returned `Unexpected account service error`.
- The repository still has pre-existing type-check failures in points-related tests outside this change.
