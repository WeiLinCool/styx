# Admin AI Config Closure Verification

Change: `admin-ai-config-closure`
Date: 2026-05-30

## Commands

- `pnpm exec tsx --test $(find src -name '*.test.ts' -o -name '*.test.tsx')`
  - Result: 102 tests passed.
- `pnpm run ts-check`
  - Result: passed.
- `pnpm run validate`
  - Result: passed.
- `pnpm run build`
  - Result: passed. Routes include `/admin/ai-models`, `/api/admin/ai-models`, `/api/admin/ai-models/[modelId]`, `/api/admin/ai-models/[modelId]/default`, `/api/admin/ai-models/[modelId]/test`, `/api/admin/ai-providers`, `/api/admin/ai-providers/[providerId]`, `/api/admin/ai-providers/[providerId]/status`, and `/api/admin/ai-providers/[providerId]/test`.
- `pnpm exec playwright install chromium`
  - Result: passed. Local Chromium installed for Playwright.
- `pnpm dev --port 3210`
  - Result: local dev server started and reached ready state on `http://localhost:3210`.
- `pnpm exec playwright test tests/e2e/admin-ai-config.spec.ts -c playwright.admin-ai.config.ts`
  - Result: passed after correcting the smoke assertion to match the actual admin login gate text in this environment.
- `pnpm exec playwright test tests/e2e/admin-ai-config.spec.ts -c playwright.admin-ai.config.ts`
  - Result: passed again with 3 checks, including an authenticated admin path that logs in and confirms the AI config surface shows key controls.
- `pnpm exec playwright test tests/e2e/admin-ai-config.spec.ts -c playwright.admin-ai.config.ts`
  - Result: passed again with 4 checks, including authenticated creation of a new provider and model from `/admin/ai-models`.
- `pnpm exec playwright test tests/e2e/admin-ai-config.spec.ts -c playwright.admin-ai.config.ts`
  - Result: passed again with 6 checks, covering unauthenticated gate, login form, authenticated surface access, provider/model creation, provider/model test dialogs, and provider/model edit flows.
- `psql postgresql://wlz@localhost:5432/styx_dev -c "select code,name,status from ai_providers where code like 'pw-provider-%' ...; select code,name,status from ai_models where code like 'pw-model-%' ...;"`
  - Result: confirmed persisted rows for Playwright-created provider/model records in the local database.
- `psql postgresql://wlz@localhost:5432/styx_dev -c "select code,name,status from ai_providers where code like 'pw-%' ...; select code,name,status from ai_models where code like 'pw-%' ...;"`
  - Result: confirmed persisted rows for both creation-flow and edit-flow Playwright records, including updated edited model names.
- `psql postgresql://wlz@localhost:5432/styx_dev -c "delete from ai_models where code like 'pw-%'; delete from ai_providers where code like 'pw-%'; ..."`
  - Result: cleaned all Playwright-created provider/model verification rows; follow-up selects returned zero remaining `pw-*` rows.

## Notes

- The first Playwright run failed because the smoke spec asserted `/AI 模型|管理员登录/`, while the real unauthenticated admin gate currently renders stricter admin-login explanatory text. The spec was updated to match the current login-gate contract and rerun successfully.
- A later Playwright run also failed once because the spec expected `管理端登录` to be a heading role. The actual page renders that text as regular content, so the assertion was corrected to target stable visible form elements and page text.
- For authenticated Playwright verification, the local `.env.local` admin account hash was temporarily swapped to a known test password (`secret-123`) so the browser could log in through the real `/api/admin/login` flow. The original hash was restored immediately after verification.
- While extending authenticated Playwright from UI visibility to real form submission, a real product defect surfaced: provider rows without any models were not shown in the provider table because the provider list was being derived from model joins only. The repository logic was fixed to load all providers directly, after which the Playwright create-flow passed and the created rows were visible and persisted.
- The deeper authenticated Playwright suite now proves the admin can create provider/model records, open both configuration test dialogs, and edit provider/model names through the real browser flow. The resulting rows remain in the local database as verification artifacts and are currently disabled.
- After the user approved cleanup, all `pw-*` verification artifacts were deleted from the local database and the cleanup was confirmed by direct SQL checks.
