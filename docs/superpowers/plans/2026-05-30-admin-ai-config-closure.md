---
archived-with: 2026-05-30-admin-ai-config-closure
status: final
---
# Admin AI Config Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete admin AI provider/model configuration loop with safe provider and model test actions, default-model management, and Playwright-based develop verification guidance.

**Architecture:** Extend the existing AI model repository as the durable owner of provider/model writes and default-model invariants, add thin admin API routes for validated mutations and tests, and upgrade the current `/admin/ai-models` operational page with provider/model forms and actions. Verification starts with focused repository and route tests, then validates App Router wiring and browser behavior.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, Zod, shadcn/Radix UI, Node test runner, Playwright

---

### Task 1: Repository invariants and provider/model mutation contract

**Files:**
- Modify: `src/server/repositories/ai-models.ts`
- Test: `src/server/repositories/ai-models.test.ts`

- [ ] **Step 1: Write failing repository tests for the new mutation and invariant behavior**

```ts
test('buildProviderConfigTestSummary rejects missing base URL before any upstream request', async () => {
  await assert.rejects(
    () =>
      testProviderConfigurationFromRecord({
        provider: {
          id: 'provider-1',
          providerType: 'openai_compatible',
          baseUrl: null,
          credentialEnvKey: 'TEST_OPENAI_KEY',
          name: 'Provider 1',
        },
        model: {
          id: 'model-1',
          model: 'gpt-4o-mini',
          name: 'Model 1',
        },
      }),
    /missing configuration/i,
  );
});

test('normalizeDefaultChatTarget rejects disabled targets', async () => {
  await assert.rejects(
    () =>
      normalizeDefaultChatTarget({
        model: {
          id: 'model-1',
          status: 'disabled',
          supportsChat: true,
          providerStatus: 'enabled',
        },
      }),
    /default chat model/i,
  );
});

test('summarizeProviderTestResult trims unsafe upstream error detail', () => {
  const summary = summarizeProviderTestResult({
    ok: false,
    elapsedMs: 123,
    error: 'x'.repeat(800),
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.error.length <= 280, true);
});
```

- [ ] **Step 2: Run the focused repository test file and verify it fails for the new behavior**

Run: `pnpm exec tsx --test src/server/repositories/ai-models.test.ts`  
Expected: FAIL because `testProviderConfigurationFromRecord`, `normalizeDefaultChatTarget`, or `summarizeProviderTestResult` do not yet exist.

- [ ] **Step 3: Implement the minimal repository helpers and invariant enforcement**

```ts
export type AdminAiConfigTestSummary = {
  ok: boolean;
  elapsedMs: number;
  providerLabel: string;
  modelLabel: string;
  message: string;
  error: string | null;
};

export function summarizeProviderTestResult(input: {
  ok: boolean;
  elapsedMs: number;
  error?: string | null;
}): Pick<AdminAiConfigTestSummary, 'ok' | 'elapsedMs' | 'error'> {
  return {
    ok: input.ok,
    elapsedMs: input.elapsedMs,
    error: input.error ? input.error.trim().slice(0, 280) : null,
  };
}

export function normalizeDefaultChatTarget(input: {
  model: {
    id: string;
    status: AiModelStatus;
    supportsChat: boolean;
    providerStatus: AiProviderStatus;
  };
}) {
  if (
    input.model.status !== 'enabled' ||
    !input.model.supportsChat ||
    input.model.providerStatus !== 'enabled'
  ) {
    throw new Error('Selected model cannot become the default chat model.');
  }

  return input.model.id;
}
```

- [ ] **Step 4: Re-run the focused repository test file and verify it passes**

Run: `pnpm exec tsx --test src/server/repositories/ai-models.test.ts`  
Expected: PASS for the new repository tests and existing repository coverage.

- [ ] **Step 5: Commit the repository contract work**

```bash
git add src/server/repositories/ai-models.ts src/server/repositories/ai-models.test.ts
git commit -m "feat: add ai config repository invariants"
```

### Task 2: Admin provider and model mutation routes

**Files:**
- Create: `src/app/api/admin/ai-providers/route.ts`
- Create: `src/app/api/admin/ai-providers/[providerId]/route.ts`
- Create: `src/app/api/admin/ai-providers/[providerId]/status/route.ts`
- Create: `src/app/api/admin/ai-providers/[providerId]/test/route.ts`
- Create: `src/app/api/admin/ai-models/route.ts`
- Create: `src/app/api/admin/ai-models/[modelId]/route.ts`
- Create: `src/app/api/admin/ai-models/[modelId]/default/route.ts`
- Create: `src/app/api/admin/ai-models/[modelId]/test/route.ts`
- Test: `src/app/api/admin/ai-providers/[providerId]/test/route.test.ts`
- Test: `src/app/api/admin/ai-models/[modelId]/default/route.test.ts`

- [ ] **Step 1: Write failing route tests for provider test validation and default-model mutation**

```ts
test('parseProviderTestBody requires a selected model id', async () => {
  await assert.rejects(
    () =>
      parseProviderTestBody({
        json: async () => ({}),
      }),
    /modelId/i,
  );
});

test('POST default model route returns 400 for invalid uuid', async () => {
  const response = await POST(
    new Request('http://localhost/api/admin/ai-models/not-a-uuid/default', {
      method: 'POST',
    }),
    {
      params: Promise.resolve({ modelId: 'not-a-uuid' }),
    },
  );

  assert.equal(response.status, 400);
});
```

- [ ] **Step 2: Run the targeted route tests and verify they fail**

Run: `pnpm exec tsx --test 'src/app/api/admin/ai-providers/[providerId]/test/route.test.ts' 'src/app/api/admin/ai-models/[modelId]/default/route.test.ts'`  
Expected: FAIL because the new route files and parsers do not yet exist.

- [ ] **Step 3: Implement thin validated routes over repository mutations**

```ts
const providerTestBodySchema = z.object({
  modelId: z.uuid(),
});

export async function parseProviderTestBody(request: Pick<Request, 'json'>) {
  const body = await request.json().catch(() => null);
  return providerTestBodySchema.parse(body);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ providerId: string }> },
) {
  await requireAdmin();
  const { providerId } = paramsSchema.parse(await context.params);
  const body = await parseProviderTestBody(request);
  const result = await testAdminAiProviderConfiguration({
    providerId,
    modelId: body.modelId,
  });
  return NextResponse.json({ ok: true, result });
}
```

- [ ] **Step 4: Re-run the targeted route tests and verify they pass**

Run: `pnpm exec tsx --test 'src/app/api/admin/ai-providers/[providerId]/test/route.test.ts' 'src/app/api/admin/ai-models/[modelId]/default/route.test.ts'`  
Expected: PASS.

- [ ] **Step 5: Commit the route layer**

```bash
git add src/app/api/admin/ai-providers src/app/api/admin/ai-models
git commit -m "feat: add admin ai provider and model routes"
```

### Task 3: Admin AI config UI closure

**Files:**
- Modify: `src/app/admin/(console)/ai-models/page.tsx`
- Modify: `src/features/admin/admin-action-controls.tsx`
- Create: `src/features/admin/admin-ai-config-forms.tsx`
- Create: `src/features/admin/admin-ai-config-test-dialog.tsx`

- [ ] **Step 1: Write a failing UI-focused route render test or component test for the new action affordances**

```ts
test('admin ai models page exposes provider and model config actions', async () => {
  const html = await renderAdminAiModelsPageForTest({
    providers: [providerFixture()],
    records: [modelFixture()],
  });

  assert.match(html, /新增供应商/);
  assert.match(html, /新增模型/);
  assert.match(html, /测试供应商/);
  assert.match(html, /设为默认/);
});
```

- [ ] **Step 2: Run the focused UI test and verify it fails**

Run: `pnpm exec tsx --test src/features/admin/admin-ai-config-ui.test.tsx`  
Expected: FAIL because the helper or rendered actions do not exist yet.

- [ ] **Step 3: Implement the provider/model forms and test dialogs with existing admin UI patterns**

```tsx
<div className="flex items-center gap-2">
  <Button size="sm" variant="outline">
    新增供应商
  </Button>
  <Button size="sm">
    新增模型
  </Button>
</div>

<AdminAiConfigTestDialog
  title="测试供应商"
  description="使用选定模型发送最小请求并返回安全摘要。"
/>
```

- [ ] **Step 4: Re-run the focused UI test and verify it passes**

Run: `pnpm exec tsx --test src/features/admin/admin-ai-config-ui.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit the UI closure work**

```bash
git add 'src/app/admin/(console)/ai-models/page.tsx' src/features/admin
git commit -m "feat: close admin ai config ui loop"
```

### Task 4: Playwright develop verification path and documentation

**Files:**
- Modify: `DEVELOPMENT.md`
- Create: `playwright.admin-ai.config.ts`
- Create: `tests/e2e/admin-ai-config.spec.ts`

- [ ] **Step 1: Write the failing Playwright smoke spec and document expectation first**

```ts
import { expect, test } from '@playwright/test';

test('admin ai config route shows login gate or configuration surface', async ({ page }) => {
  await page.goto('/admin/ai-models');
  await expect(page.locator('body')).toContainText(/AI 模型|管理员登录/);
});
```

- [ ] **Step 2: Run the Playwright spec and verify it fails before config exists**

Run: `pnpm exec playwright test tests/e2e/admin-ai-config.spec.ts -c playwright.admin-ai.config.ts`  
Expected: FAIL because Playwright config or dependency wiring is not yet present.

- [ ] **Step 3: Add repository-level develop guidance and minimal Playwright config**

```md
### Browser Verification

- User-visible admin UI changes default to browser verification.
- Prefer local Playwright execution and local browser installation.
- Run `pnpm build` before standalone Playwright runs.
- If authenticated browser coverage is blocked by missing credentials or database state, record the blocker explicitly in the verification note.
```

```ts
export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:3210',
    headless: true,
  },
});
```

- [ ] **Step 4: Re-run the Playwright smoke spec and verify it passes against the local target**

Run: `pnpm build && pnpm dev --port 3210` in one shell, then `pnpm exec playwright test tests/e2e/admin-ai-config.spec.ts -c playwright.admin-ai.config.ts` in another.  
Expected: PASS, either against the admin login gate or the authenticated config surface depending on local environment.

- [ ] **Step 5: Commit the browser verification path**

```bash
git add DEVELOPMENT.md playwright.admin-ai.config.ts tests/e2e/admin-ai-config.spec.ts
git commit -m "test: add admin ai config browser verification"
```

### Task 5: Full verification and change tracking

**Files:**
- Modify: `openspec/changes/admin-ai-config-closure/tasks.md`
- Create: `docs/superpowers/verification/2026-05-30-admin-ai-config-closure-verification.md`

- [ ] **Step 1: Mark completed change tasks**

```md
- [x] 1. Add repository mutations and invariant enforcement for provider/model create, update, status, default selection, and safe test execution.
- [x] 2. Add admin API routes with validation and authorization for provider/model mutations and tests.
- [x] 3. Upgrade `/admin/ai-models` and supporting admin feature components into a full provider/model configuration console.
- [x] 4. Add focused tests for repository logic and admin routes covering enablement, default-model invariants, and safe test responses.
- [x] 5. Add Playwright develop verification requirements to `DEVELOPMENT.md` and create the minimum browser verification path for this admin surface.
```

- [ ] **Step 2: Run the full verification command set**

Run:

```bash
pnpm exec tsx --test src/server/repositories/ai-models.test.ts \
  'src/app/api/admin/ai-providers/[providerId]/test/route.test.ts' \
  'src/app/api/admin/ai-models/[modelId]/default/route.test.ts'
pnpm run validate
pnpm run build
pnpm exec playwright test tests/e2e/admin-ai-config.spec.ts -c playwright.admin-ai.config.ts
```

Expected:
- targeted tests PASS
- `validate` PASS
- `build` PASS
- Playwright PASS or produces a clearly documented environment blocker

- [ ] **Step 3: Write the verification report with exact evidence and blockers**

```md
# Admin AI Config Closure Verification

Change: `admin-ai-config-closure`
Date: 2026-05-30

## Commands

- `pnpm exec tsx --test ...`
  - Result: ...
- `pnpm run validate`
  - Result: ...
- `pnpm run build`
  - Result: ...
- `pnpm exec playwright test ...`
  - Result: ...

## Notes

- Authenticated browser coverage blocker, if any: ...
```

- [ ] **Step 4: Commit verification artifacts**

```bash
git add openspec/changes/admin-ai-config-closure/tasks.md \
  docs/superpowers/verification/2026-05-30-admin-ai-config-closure-verification.md
git commit -m "docs: record admin ai config closure verification"
```
