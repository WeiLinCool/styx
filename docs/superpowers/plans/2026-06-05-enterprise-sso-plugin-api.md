---
change: enterprise-sso-plugin-api
design-doc: docs/superpowers/specs/2026-06-05-enterprise-sso-plugin-api-design.md
base-ref: 21859f175d5cc897834850f3df7f15a0646dca66
archived-with: 2026-06-06-enterprise-sso-plugin-api
---

# Enterprise SSO Plugin API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build OpenPawz enterprise OAuth2 PKCE, entitlement, userinfo, and OpenAI-compatible gateway APIs backed by existing users, entitlements, models, and provider adapters.

**Architecture:** Add `src/server/enterprise` as the domain boundary for OAuth state, bearer validation, entitlement mapping, and gateway response shaping. Route handlers under `src/app` only parse transport input and delegate to enterprise services. Durable OAuth codes/tokens are stored hashed through repository helpers, while account identity and model access continue to use existing auth and AI repositories.

**Tech Stack:** Next.js App Router, TypeScript, Zod, PostgreSQL/Drizzle, Node test runner via existing focused test scripts, existing AI provider adapters.

## File Structure

- Modify: `src/server/db/schema.ts` for enterprise OAuth code/token tables.
- Create: `src/server/repositories/enterprise-oauth.ts` for durable code/token query helpers.
- Test: `src/server/repositories/enterprise-oauth.test.ts` for repository behavior with in-memory stubs or database-gated checks.
- Modify: `src/server/auth/account-service.ts` to add existing-user password authentication without session creation.
- Test: `src/server/auth/account-domain.test.ts` or `src/server/auth/public-auth.test.ts` for password-auth helper behavior.
- Create: `src/server/enterprise/oauth.ts` for OAuth parsing, PKCE, redirect validation, code issuance, token exchange, and bearer validation.
- Create: `src/server/enterprise/entitlements.ts` for `models:proxy`/`all` mapping from existing model availability.
- Create: `src/server/enterprise/userinfo.ts` for OpenPawz-compatible identity claims.
- Create: `src/server/enterprise/gateway.ts` for OpenAI-compatible model/chat response shaping.
- Test: `src/server/enterprise/oauth.test.ts`, `src/server/enterprise/entitlements.test.ts`, `src/server/enterprise/gateway.test.ts`.
- Create: `src/app/oauth/authorize/page.tsx` for browser login form.
- Create: `src/app/oauth/authorize/actions.ts` for server action or form handler that completes authorization.
- Create: `src/app/oauth/token/route.ts`, `src/app/oauth/userinfo/route.ts`, `src/app/api/entitlements/route.ts`, `src/app/api/llm/v1/models/route.ts`, `src/app/api/llm/v1/chat/completions/route.ts`.

## Task 1: OAuth Persistence

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/server/repositories/enterprise-oauth.ts`
- Create: `src/server/repositories/enterprise-oauth.test.ts`

- [ ] **Step 1: Write failing schema/repository tests**

Create tests covering:

```ts
test('consumeAuthorizationCode marks a matching unconsumed code exactly once', async () => {
  const repo = createInMemoryEnterpriseOAuthRepository();
  const code = await repo.createAuthorizationCode({
    codeHash: 'hash-code-1',
    userId: 'user-1',
    clientId: 'openpawz-desktop',
    redirectUri: 'http://127.0.0.1:49231/callback',
    codeChallenge: 'challenge',
    codeChallengeMethod: 'S256',
    scope: 'openid profile email entitlements models',
    state: 'state-1',
    expiresAt: new Date(Date.now() + 60_000),
  });

  const consumed = await repo.consumeAuthorizationCode(code.codeHash, new Date());
  const replay = await repo.consumeAuthorizationCode(code.codeHash, new Date());

  assert.equal(consumed?.id, code.id);
  assert.equal(consumed?.consumedAt instanceof Date, true);
  assert.equal(replay, null);
});
```

Run: `pnpm tsx src/server/repositories/enterprise-oauth.test.ts`
Expected: FAIL because the file/module does not exist.

- [ ] **Step 2: Add schema tables**

Add `enterpriseOauthAuthorizationCodes` and `enterpriseOauthAccessTokens` near existing auth/session tables:

```ts
export const enterpriseOauthAuthorizationCodes = pgTable(
  'enterprise_oauth_authorization_codes',
  {
    id,
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    clientId: text('client_id').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull(),
    scope: text('scope').notNull().default(''),
    state: text('state').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: now,
    updatedAt: updated,
  },
  (table) => [
    index('enterprise_oauth_codes_user_id_idx').on(table.userId),
    uniqueIndex('enterprise_oauth_codes_hash_unique_idx').on(table.codeHash),
    index('enterprise_oauth_codes_expires_at_idx').on(table.expiresAt),
  ],
);
```

Add access token table with `tokenHash`, `userId`, `clientId`, `scope`, `expiresAt`, `revokedAt`, timestamps, indexes, and unique token hash.

- [ ] **Step 3: Implement repository helpers**

Implement exported functions:

```ts
export async function createEnterpriseAuthorizationCode(input: CreateEnterpriseAuthorizationCodeInput): Promise<EnterpriseAuthorizationCodeRecord>
export async function consumeEnterpriseAuthorizationCode(codeHash: string, now?: Date): Promise<EnterpriseAuthorizationCodeRecord | null>
export async function createEnterpriseAccessToken(input: CreateEnterpriseAccessTokenInput): Promise<EnterpriseAccessTokenRecord>
export async function getEnterpriseAccessTokenByHash(tokenHash: string, now?: Date): Promise<EnterpriseAccessTokenWithUserRecord | null>
```

Use `db` when available; tests may also export/create an in-memory repository for pure behavior.

- [ ] **Step 4: Run focused tests**

Run: `pnpm tsx src/server/repositories/enterprise-oauth.test.ts`
Expected: PASS.

## Task 2: Existing Account Password Authentication

**Files:**
- Modify: `src/server/auth/account-service.ts`
- Test: `src/server/auth/account-domain.test.ts`

- [ ] **Step 1: Write failing auth helper tests**

Add tests for an injected helper or exported pure function showing that OAuth auth:

- returns an existing user for phone/email plus valid password,
- rejects missing password setup,
- rejects wrong password,
- does not create a session or register a new account.

Run: `pnpm tsx src/server/auth/account-domain.test.ts`
Expected: FAIL because helper is missing.

- [ ] **Step 2: Implement helper**

Add:

```ts
export async function authenticateExistingUserWithPassword(input: {
  login: string;
  password: string;
}) {
  const normalizedLogin = input.login.trim();
  const user = normalizedLogin.includes('@')
    ? await getUserByEmail(normalizedLogin.toLowerCase())
    : await getUserByPhone(normalizedLogin);

  if (!user) {
    throw new AccountDomainError('session_required', '账号或密码错误。', 401);
  }

  if (!('passwordHash' in (user.metadata ?? {}))) {
    throw new AccountDomainError('password_setup_required', '当前账号尚未设置密码，请先设置密码后再登录。', 403);
  }

  if (!verifyStoredUserPassword(input.password, user.metadata)) {
    throw new AccountDomainError('session_required', '账号或密码错误。', 401);
  }

  return user;
}
```

Refactor only if needed to make tests injectable; do not alter `registerOrLoginUser` behavior.

- [ ] **Step 3: Run focused tests**

Run: `pnpm tsx src/server/auth/account-domain.test.ts`
Expected: PASS.

## Task 3: OAuth Domain Service

**Files:**
- Create: `src/server/enterprise/oauth.ts`
- Test: `src/server/enterprise/oauth.test.ts`

- [ ] **Step 1: Write failing OAuth domain tests**

Cover:

- `validateLoopbackRedirectUri` accepts `http://127.0.0.1:49231/callback` and rejects `https://evil.example/callback`.
- `verifyPkceS256` accepts the matching verifier and rejects a mismatch.
- `exchangeAuthorizationCode` rejects replay and mismatched redirect URI/client ID.
- `resolveEnterpriseBearerToken` rejects missing/expired/inactive-user tokens.

Run: `pnpm tsx src/server/enterprise/oauth.test.ts`
Expected: FAIL because module is missing.

- [ ] **Step 2: Implement OAuth primitives and errors**

Implement:

```ts
export class EnterpriseOAuthError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}
```

Add `validateAuthorizeRequest`, `validateTokenRequest`, `validateLoopbackRedirectUri`, `verifyPkceS256`, `buildOAuthErrorRedirect`, and bearer header parsing.

- [ ] **Step 3: Implement issue/exchange/resolve services**

Implement functions that accept injected repository/auth dependencies so tests can use fakes:

```ts
export async function issueEnterpriseAuthorizationCode(input, deps)
export async function exchangeEnterpriseAuthorizationCode(input, deps)
export async function resolveEnterpriseBearerToken(request, deps)
```

Use `createOpaqueToken()` and `hashSecret()` from existing account crypto. Default access token TTL: 3600 seconds.

- [ ] **Step 4: Run focused OAuth tests**

Run: `pnpm tsx src/server/enterprise/oauth.test.ts`
Expected: PASS.

## Task 4: UserInfo And Entitlements

**Files:**
- Create: `src/server/enterprise/userinfo.ts`
- Create: `src/server/enterprise/entitlements.ts`
- Test: `src/server/enterprise/entitlements.test.ts`

- [ ] **Step 1: Write failing mapping tests**

Test that userinfo chooses `email`, then `phone`/display name as fallback, always includes `sub`, and entitlement mapping returns `models:proxy` when injected model availability has at least one model.

Run: `pnpm tsx src/server/enterprise/entitlements.test.ts`
Expected: FAIL because modules are missing.

- [ ] **Step 2: Implement userinfo mapper**

Implement:

```ts
export function toEnterpriseUserInfo(user: Pick<UserRecord, 'id' | 'email' | 'phone' | 'displayName'>) {
  return {
    sub: user.id,
    email: user.email ?? undefined,
    name: user.displayName,
    preferred_username: user.email ?? user.phone ?? user.id,
  };
}
```

- [ ] **Step 3: Implement entitlement mapper**

Implement:

```ts
export async function resolveEnterpriseEntitlements(userId: string, deps = defaultDeps) {
  const models = await deps.listAvailableChatModelsForUser(userId);
  const entitlements = models.length > 0 ? ['models:proxy'] : [];
  return { plan: entitlements.length > 0 ? 'enterprise' : 'enterprise-limited', entitlements };
}
```

- [ ] **Step 4: Run mapping tests**

Run: `pnpm tsx src/server/enterprise/entitlements.test.ts`
Expected: PASS.

## Task 5: OAuth And Entitlement Routes

**Files:**
- Create: `src/app/oauth/authorize/page.tsx`
- Create: `src/app/oauth/authorize/actions.ts`
- Create: `src/app/oauth/token/route.ts`
- Create: `src/app/oauth/userinfo/route.ts`
- Create: `src/app/api/entitlements/route.ts`
- Test route helpers if route tests exist locally.

- [ ] **Step 1: Write route/helper tests**

At minimum, test exported helpers for token form parsing and OAuth JSON error response shape.

Run the new focused route-helper test with `pnpm tsx`.
Expected: FAIL before route helpers exist.

- [ ] **Step 2: Implement authorize page and action**

The page reads search params, validates authorize input, and renders a compact username/password form. The action authenticates existing user credentials, checks `accountState === 'active'`, issues an authorization code, and redirects to the loopback URI with `code` and `state`. On failure with safe redirect URI, redirect with `error` and `state`.

- [ ] **Step 3: Implement token/userinfo/entitlements routes**

`/oauth/token` reads `application/x-www-form-urlencoded`, calls exchange service, and returns OAuth JSON. `/oauth/userinfo` and `/api/entitlements` call bearer validation, then mapping services.

- [ ] **Step 4: Run route/helper tests**

Run focused tests created in Step 1.
Expected: PASS.

## Task 6: OpenAI-Compatible Gateway

**Files:**
- Create: `src/server/enterprise/gateway.ts`
- Create: `src/server/enterprise/gateway.test.ts`
- Create: `src/app/api/llm/v1/models/route.ts`
- Create: `src/app/api/llm/v1/chat/completions/route.ts`

- [ ] **Step 1: Write failing gateway tests**

Cover:

- `toOpenAiModelList` maps public chat models to `{ data: [{ id, object: 'model', owned_by: 'enterprise' }] }`.
- missing `models:proxy` rejects before provider call.
- non-streaming chat returns OpenAI-compatible `choices[0].message.content`.
- streaming formatter emits `data: ...` records and final `data: [DONE]`.

Run: `pnpm tsx src/server/enterprise/gateway.test.ts`
Expected: FAIL because gateway module is missing.

- [ ] **Step 2: Implement gateway helpers**

Implement model list mapping, chat payload schema, non-streaming response mapper, and SSE formatter. Keep provider execution injectable for tests.

- [ ] **Step 3: Implement gateway routes**

Routes validate bearer token and `models:proxy`/`all` before resolving models or calling provider adapter. Model resolution uses existing `listAvailableChatModelsForUser` and `resolveChatModelForUser`.

- [ ] **Step 4: Run gateway tests**

Run: `pnpm tsx src/server/enterprise/gateway.test.ts`
Expected: PASS.

## Task 7: Migrations And Final Verification

**Files:**
- Generated: `drizzle/*` migration files from `pnpm db:generate`
- Modify: `openspec/changes/enterprise-sso-plugin-api/tasks.md`

- [ ] **Step 1: Generate migration**

Run: `pnpm db:generate`
Expected: new Drizzle migration for enterprise OAuth tables.

- [ ] **Step 2: Run focused tests**

Run all new focused tests:

```bash
pnpm tsx src/server/repositories/enterprise-oauth.test.ts
pnpm tsx src/server/auth/account-domain.test.ts
pnpm tsx src/server/enterprise/oauth.test.ts
pnpm tsx src/server/enterprise/entitlements.test.ts
pnpm tsx src/server/enterprise/gateway.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run repository validation**

Run: `pnpm validate`
Expected: PASS.

- [ ] **Step 4: Run production build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Update OpenSpec tasks**

Mark completed items in `openspec/changes/enterprise-sso-plugin-api/tasks.md` and commit implementation changes.

## Self-Review

- Spec coverage: OAuth authorize/token/userinfo, bearer validation, entitlements, model listing, chat completions, streaming, and model authorization all map to tasks above.
- Placeholder scan: no task uses TBD/TODO/fill-in language as an implementation substitute.
- Type consistency: service names and file paths are consistent across tasks; exact exports can be refined during TDD while keeping module boundaries stable.
