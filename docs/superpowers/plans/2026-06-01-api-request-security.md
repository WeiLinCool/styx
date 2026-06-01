# API Request Security And Idempotency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add separate user/admin API clients, server-side request protection, durable idempotency, and transport-aware security modes without making HTTP deployments unusable.

**Architecture:** Keep client concerns in `src/lib`, route policy in `src/app/api`, and durable enforcement in `src/server`. User and admin requests get different wrappers and different enforcement defaults. HTTPS is a configurable security mode, not a business availability gate; HTTP stays usable in compatible/insecure modes, but the server records and enforces the lower trust level.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node `crypto`, PostgreSQL + Drizzle, existing browser fingerprint helper, existing auth/session and admin guard code.

---

### Task 1: Add shared request-security primitives

**Files:**
- Create: `src/lib/request-security.ts`
- Create: `src/lib/request-security.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRequestBodyHash,
  shouldDedupeGetRequest,
  resolveTransportSecurityMode,
} from './request-security';

test('resolveTransportSecurityMode treats localhost http as compatible by default', () => {
  assert.equal(resolveTransportSecurityMode('http:', 'localhost', 'compatible'), 'compatible');
  assert.equal(resolveTransportSecurityMode('http:', '127.0.0.1', 'compatible'), 'compatible');
});

test('buildRequestBodyHash is stable for equivalent JSON payloads', () => {
  assert.equal(
    buildRequestBodyHash({ a: 1, b: 'x' }),
    buildRequestBodyHash({ a: 1, b: 'x' }),
  );
});

test('shouldDedupeGetRequest only dedupes identical short-window GETs', () => {
  assert.equal(shouldDedupeGetRequest({ method: 'GET', url: '/api/auth/me' }), true);
  assert.equal(shouldDedupeGetRequest({ method: 'POST', url: '/api/auth/login' }), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/lib/request-security.test.ts`
Expected: fail because the module does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Implement:

```ts
export type TransportSecurityMode = 'strict' | 'compatible' | 'insecure';
export function resolveTransportSecurityMode(protocol: string, hostname: string, configured: TransportSecurityMode): TransportSecurityMode;
export function buildRequestBodyHash(body: unknown): string;
export function shouldDedupeGetRequest(input: { method: string; url: string }): boolean;
```

Use Node `crypto` for the hash. Keep the helper pure and client-safe.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test src/lib/request-security.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/request-security.ts src/lib/request-security.test.ts
git commit -m "feat: add shared request security helpers"
```

### Task 2: Add separate user and admin API clients

**Files:**
- Create: `src/lib/user-api-client.ts`
- Create: `src/lib/admin-api-client.ts`
- Create: `src/lib/user-api-client.test.ts`
- Create: `src/lib/admin-api-client.test.ts`
- Modify: `src/features/account/set-password-form.tsx`
- Modify: `src/features/account/forgot-password-form.tsx`
- Modify: `src/lib/auth-context.tsx`
- Modify: `src/features/account/activation-panel.tsx`
- Modify: `src/app/user-center/page.tsx`
- Modify: `src/features/public/agent-runtime-client.ts`
- Modify: `src/features/admin/admin-login-form.tsx`
- Modify: `src/features/admin/admin-auth-actions.tsx`
- Modify: `src/features/admin/admin-ai-config-forms.tsx`
- Modify: `src/features/admin/admin-action-controls.tsx`
- Modify: `src/features/admin/admin-ai-config-test-dialog.tsx`
- Modify: `src/features/admin/admin-header.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { createUserApiClient } from './user-api-client';

test('user client emits idempotency metadata for mutations', async () => {
  const calls: RequestInit[] = [];
  const client = createUserApiClient({
    fetch: async (_input, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  await client.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone: '13800000000', password: 'secret' }),
  });

  const headers = new Headers(calls[0]?.headers);
  assert.equal(headers.get('Idempotency-Key')?.length ?? 0 > 0, true);
  assert.equal(headers.get('x-request-body-hash')?.length ?? 0 > 0, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
`node --import tsx --test src/lib/user-api-client.test.ts src/lib/admin-api-client.test.ts`

Expected: fail until the wrappers exist.

- [ ] **Step 3: Write the minimal implementation**

Create two focused wrappers:

```ts
export async function userApiRequest(input: UserApiRequest): Promise<Response>;
export async function adminApiRequest(input: AdminApiRequest): Promise<Response>;
```

Key behavior:
- user GETs may dedupe briefly,
- admin GETs stay current,
- user/admin mutations include `Idempotency-Key`,
- headers include timestamp, nonce, and body hash where appropriate,
- errors normalize through one helper per wrapper.

Then migrate the listed call sites from raw `fetch` to the correct wrapper.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
`node --import tsx --test src/lib/user-api-client.test.ts src/lib/admin-api-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/user-api-client.ts src/lib/admin-api-client.ts src/lib/user-api-client.test.ts src/lib/admin-api-client.test.ts src/lib/auth-context.tsx src/features/account/activation-panel.tsx src/app/user-center/page.tsx src/features/public/agent-runtime-client.ts src/features/account/set-password-form.tsx src/features/account/forgot-password-form.tsx src/features/admin/admin-login-form.tsx src/features/admin/admin-auth-actions.tsx src/features/admin/admin-ai-config-forms.tsx src/features/admin/admin-action-controls.tsx src/features/admin/admin-ai-config-test-dialog.tsx src/features/admin/admin-header.tsx
git commit -m "feat: route api calls through user and admin clients"
```

### Task 3: Add server request protection policy helpers

**Files:**
- Create: `src/server/request-security.ts`
- Create: `src/server/request-security.test.ts`
- Modify: `src/app/api/*/route.ts` entrypoints that handle protected mutations

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRequestProtection } from './request-security';

test('protected admin mutation rejects missing request metadata', () => {
  const result = evaluateRequestProtection({
    routeKind: 'admin-mutation',
    method: 'POST',
    pathname: '/api/admin/users/1/activate',
    transportMode: 'compatible',
    requestUrl: 'http://localhost/api/admin/users/1/activate',
    headers: new Headers(),
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, 'transport_security_required');
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/server/request-security.test.ts`

- [ ] **Step 3: Write the minimal implementation**

Implement route-policy helpers that can be called before domain code:

```ts
export type RequestProtectionResult = { allowed: true } | { allowed: false; code: string; status: number };
export function evaluateRequestProtection(...): RequestProtectionResult;
export function parseRequestFingerprint(...): string | null;
export function isProtectedRoute(method: string, pathname: string): boolean;
```

Keep this layer server-only. Use it from route handlers, not from UI code.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test src/server/request-security.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/server/request-security.ts src/server/request-security.test.ts
git commit -m "feat: add request protection policy helpers"
```

### Task 4: Add durable idempotency storage and route helpers

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/repositories/request-idempotency.ts`
- Create: `src/server/repositories/request-idempotency.test.ts`
- Modify: `src/server/repositories/*` only where route-owned mutations need replay support
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/auth/set-password/route.ts`
- Modify: `src/app/api/auth/password-reset-work-orders/route.ts`
- Modify: `src/app/api/account/bind/route.ts`
- Modify: `src/app/api/account/activation-work-orders/route.ts`
- Modify: `src/app/api/user/points/checkin/route.ts`
- Modify: `src/app/api/agent/runs/route.ts`
- Modify: `src/app/api/admin/users/[userId]/activate/route.ts`
- Modify: `src/app/api/admin/users/[userId]/suspend/route.ts`
- Modify: `src/app/api/admin/users/[userId]/points/route.ts`
- Modify: `src/app/api/admin/activation-work-orders/[workOrderId]/approve/route.ts`
- Modify: `src/app/api/admin/activation-work-orders/[workOrderId]/reject/route.ts`
- Modify: `src/app/api/admin/activation-work-orders/[workOrderId]/processing/route.ts`
- Modify: `src/app/api/admin/password-reset-work-orders/[workOrderId]/approve/route.ts`
- Modify: `src/app/api/admin/password-reset-work-orders/[workOrderId]/archive/route.ts`
- Modify: `src/app/api/admin/password-reset-work-orders/[workOrderId]/processing/route.ts`
- Modify: `src/app/api/admin/orders/[orderId]/status/route.ts`
- Modify: `src/app/api/admin/ai-models/[modelId]/route.ts`
- Modify: `src/app/api/admin/ai-models/[modelId]/status/route.ts`
- Modify: `src/app/api/admin/ai-models/[modelId]/default/route.ts`
- Modify: `src/app/api/admin/ai-providers/[providerId]/route.ts`
- Modify: `src/app/api/admin/ai-providers/[providerId]/status/route.ts`
- Modify: `src/app/api/admin/agent-capabilities/[capabilityId]/status/route.ts`
- Modify: `src/app/api/admin/ai-jobs/[jobId]/review/route.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:
- a repeated idempotency key returns the same result,
- the same key with a different body hash is rejected,
- expired records are not replayed,
- processing duplicates are handled predictably,
- the store falls back to bounded memory when no database is configured in development.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/server/repositories/request-idempotency.test.ts`

- [ ] **Step 3: Write the minimal implementation**

Add a table and repository with fields for:
- key,
- actor type,
- actor id,
- route/operation,
- body hash,
- status,
- response summary,
- createdAt,
- expiresAt.

Wrap protected route handlers so they:
- evaluate request protection first,
- enforce idempotency for mutation routes,
- then call domain/repository code,
- then persist the replayable result.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test src/server/repositories/request-idempotency.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/repositories/request-idempotency.ts src/server/repositories/request-idempotency.test.ts src/app/api/auth/login/route.ts src/app/api/auth/set-password/route.ts src/app/api/auth/password-reset-work-orders/route.ts src/app/api/account/bind/route.ts src/app/api/account/activation-work-orders/route.ts src/app/api/user/points/checkin/route.ts src/app/api/agent/runs/route.ts src/app/api/admin/users/[userId]/activate/route.ts src/app/api/admin/users/[userId]/suspend/route.ts src/app/api/admin/users/[userId]/points/route.ts src/app/api/admin/activation-work-orders/[workOrderId]/approve/route.ts src/app/api/admin/activation-work-orders/[workOrderId]/reject/route.ts src/app/api/admin/activation-work-orders/[workOrderId]/processing/route.ts src/app/api/admin/password-reset-work-orders/[workOrderId]/approve/route.ts src/app/api/admin/password-reset-work-orders/[workOrderId]/archive/route.ts src/app/api/admin/password-reset-work-orders/[workOrderId]/processing/route.ts src/app/api/admin/orders/[orderId]/status/route.ts src/app/api/admin/ai-models/[modelId]/route.ts src/app/api/admin/ai-models/[modelId]/status/route.ts src/app/api/admin/ai-models/[modelId]/default/route.ts src/app/api/admin/ai-providers/[providerId]/route.ts src/app/api/admin/ai-providers/[providerId]/status/route.ts src/app/api/admin/agent-capabilities/[capabilityId]/status/route.ts src/app/api/admin/ai-jobs/[jobId]/review/route.ts
git commit -m "feat: add request idempotency storage"
```

### Task 5: Add transport-mode and fingerprint wiring

**Files:**
- Modify: `src/server/auth/session.ts`
- Modify: `src/server/auth/guards.ts`
- Modify: `middleware.ts`
- Modify: `src/features/account/browser-fingerprint.ts`
- Modify: `src/app/layout.tsx` only if transport mode must be exposed to the client shell
- Modify: `src/features/admin/admin-header.tsx`
- Modify: `src/lib/auth-context.tsx`
- Modify: `src/features/account/activation-panel.tsx`

- [ ] **Step 1: Write the failing test**

Cover:
- transport mode resolution from env/config,
- fingerprint extraction normalization,
- admin failure-closed behavior under insecure transport,
- user-facing degraded transport warning signals where needed.

- [ ] **Step 2: Run the test to verify it fails**

Run:
`node --import tsx --test src/server/auth/session.test.ts src/features/account/browser-fingerprint.test.ts`

- [ ] **Step 3: Write the minimal implementation**

Implement config-driven transport mode resolution and expose it where route guards need it. Reuse the existing fingerprint helper instead of inventing a second one.

- [ ] **Step 4: Run the test to verify it passes**

Run:
`node --import tsx --test src/server/auth/session.test.ts src/features/account/browser-fingerprint.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/session.ts src/server/auth/guards.ts middleware.ts src/features/account/browser-fingerprint.ts src/app/layout.tsx src/features/admin/admin-header.tsx src/lib/auth-context.tsx src/features/account/activation-panel.tsx
git commit -m "feat: wire transport mode and fingerprint policy"
```

### Task 6: Verify the user and admin flows end to end

**Files:**
- No new files expected unless a focused regression test is needed

- [ ] **Step 1: Run targeted unit and route tests**

Run:
`node --import tsx --test src/lib/request-security.test.ts src/lib/user-api-client.test.ts src/lib/admin-api-client.test.ts src/server/request-security.test.ts src/server/repositories/request-idempotency.test.ts`

Then run the existing route and feature tests most likely to be touched by the migration, especially login, activation, check-in, admin mutations, and agent runs.

- [ ] **Step 2: Run repository validation**

Run: `pnpm validate`

Expected: pass, or fail only on pre-existing unrelated baseline issues already present in the repo.

- [ ] **Step 3: Run build verification**

Run: `pnpm build`

Expected: pass, or surface integration issues that need final fixes.

- [ ] **Step 4: Browser-check representative flows**

Run the app locally and confirm:
- user GETs are not continuously retriggered,
- duplicate clicks do not create duplicate mutations,
- admin mutations still work,
- HTTP mode degrades rather than breaking the whole app,
- sensitive operations report meaningful errors instead of leaking protection internals.

- [ ] **Step 5: Commit remaining fixes and close out**

Use a final commit only after the above verification is green and the diff is limited to the request-security work.
