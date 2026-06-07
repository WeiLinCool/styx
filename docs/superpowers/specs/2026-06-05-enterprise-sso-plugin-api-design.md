---
archived-with: 2026-06-06-enterprise-sso-plugin-api
status: final
---
# Enterprise SSO Plugin API Design

Status: Final
Change: enterprise-sso-plugin-api

## Context

Taiji enterprise desktop builds need this Next.js application to act as the OAuth, entitlement, and model-gateway backend. The desktop app is a public OAuth client, so it uses Authorization Code with PKCE and a loopback redirect URI. The user account is not separate from the WebUI account: the browser authorization flow logs in with the existing user account/password credentials, and all feature access is resolved from existing user entitlements and model configuration.

Relevant local owners:

- `src/app`: App Router route handlers and the OAuth login page boundary.
- `src/server/auth`: account credential verification and active-account policy.
- `src/server/enterprise`: new enterprise OAuth, bearer-token, entitlement, and gateway domain logic.
- `src/server/repositories`: durable OAuth code/token query shape.
- `src/server/ai` and `src/server/repositories/ai-models`: existing model entitlement and provider execution authority.

## Goals

- Implement `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, `/api/entitlements`, `/api/llm/v1/models`, and `/api/llm/v1/chat/completions`.
- Reuse existing user account/password login semantics for OAuth authorization.
- Keep desktop bearer tokens separate from WebUI cookie sessions.
- Reuse existing user entitlement and model availability rules for `models:proxy` and gateway model access.
- Enforce authorization server-side on every protected enterprise endpoint.

## Non-Goals

- External enterprise IdP federation such as Okta, Azure AD, SAML, or Google Workspace.
- Separate enterprise tenant, license, billing, or entitlement administration.
- Refresh-token rotation in the first implementation pass.
- Replacing WebUI cookie session behavior.
- Adding admin UI for enterprise SSO configuration.

## State Ownership

| State | Owner | Write Entry | Source Of Truth |
| --- | --- | --- | --- |
| OAuth authorization code | `src/server/enterprise/oauth-service.ts` + repository | Successful `/oauth/authorize` credential login | Hashed durable authorization-code row |
| OAuth access token | `src/server/enterprise/oauth-service.ts` + repository | Successful `/oauth/token` exchange | Hashed durable access-token row |
| User identity | Existing auth/user repository | Existing account registration and profile flows | `users` and identity fields |
| Enterprise entitlements | `src/server/enterprise/entitlements.ts` | Read-only mapping from existing entitlements/model access | Existing membership, benefit, manual grant, and model availability records |
| Gateway model access | Existing AI model repository plus enterprise gateway guard | Gateway request validation | Existing model/provider config plus user entitlements |

## Invariants

1. An authorization code is bound to one user, client ID, redirect URI, PKCE challenge, expiry, and consumed state; it can produce at most one access token.
2. Enterprise APIs never trust desktop-supplied entitlement claims; they resolve bearer token, active user, `models:proxy`/`all`, and per-model authorization on the server.
3. OAuth account/password login must not create a new account or issue a WebUI cookie session as a side effect of desktop authorization.

## Architecture

```
Taiji desktop
  -> system browser /oauth/authorize
      -> OAuth login page validates query
      -> existing account credential verification
      -> durable authorization code
      -> 302 loopback callback with code/state
  -> POST /oauth/token with code_verifier
      -> PKCE + one-time code validation
      -> durable bearer access token
  -> GET /oauth/userinfo
  -> GET /api/entitlements
  -> GET /api/llm/v1/models
  -> POST /api/llm/v1/chat/completions
      -> bearer token
      -> active user
      -> models:proxy/all
      -> model entitlement
      -> provider adapter
```

Route handlers stay thin. They parse query/body/header input, call `src/server/enterprise` services, and translate domain errors into OAuth or OpenAI-compatible responses.

## Key Decisions

### Durable Code And Token Records

Authorization codes and access tokens will be stored hashed in database tables. Code rows include `clientId`, `redirectUri`, `codeChallenge`, `codeChallengeMethod`, `scope`, `state`, `userId`, `expiresAt`, and `consumedAt`. Token rows include `tokenHash`, `userId`, `clientId`, `scope`, `expiresAt`, and optional revocation metadata.

This is more operationally clear than stateless signed codes because one-time use, replay rejection, expiry, and support investigation are explicit.

### Credential Verification Without WebUI Session Side Effects

The existing `registerOrLoginUser` helper both registers/logs in and creates a browser session. OAuth authorization should only authenticate an existing account. Implementation should add a focused auth-domain helper such as `authenticateExistingUserWithPassword({ login, password })` that:

- finds an existing user by phone or email,
- verifies `metadata.passwordHash` with `verifyStoredUserPassword`,
- rejects accounts without password setup,
- rejects wrong credentials,
- returns the user without creating a session or setting cookies.

The OAuth authorize service then applies the active-account check before issuing a code.

### Redirect URI Policy

The desktop client uses loopback callbacks. The first implementation should allow only `http://127.0.0.1:{port}/callback` and `http://localhost:{port}/callback` redirect URIs. Any other host, scheme, or path is rejected before login.

This keeps the public-client redirect surface tight while matching the Taiji contract.

### Entitlement Mapping

The first release should compute enterprise entitlements from existing model availability:

- `models:proxy` is granted when the bearer-token user has at least one enabled chat-capable model available through existing model entitlement rules.
- `all` is reserved and should only be returned if an explicit existing entitlement code later maps to full enterprise access.

This default avoids inventing a separate entitlement source and makes the desktop model gate match current server-side model truth.

### Gateway Routing

`GET /api/llm/v1/models` returns OpenAI-compatible model objects derived from `listAvailableChatModelsForUser`. `POST /api/llm/v1/chat/completions` validates a minimal OpenAI-compatible payload, resolves the requested model through existing model authorization, and calls the current chat provider adapter.

For `stream=true`, the gateway streams OpenAI-compatible SSE chunks and always finishes successful streams with `data: [DONE]`. Authorization and entitlement failures happen before provider calls.

## API Behavior

- OAuth errors use standard JSON shape on `/oauth/token`.
- Authorization failures in `/oauth/authorize` redirect to the desktop callback with `error`, optional `error_description`, and unchanged `state` when a safe redirect URI exists.
- Protected enterprise endpoints require `Authorization: Bearer <token>`.
- Gateway endpoints return fail-closed 401/403 responses for missing bearer token or missing `models:proxy`.

## Verification Strategy

- Unit tests for PKCE S256 challenge generation/verification, redirect URI validation, OAuth query/body parsing, and entitlement mapping.
- Repository/domain tests for code replay, expiry, token resolution, and inactive-user rejection.
- Route tests for OAuth error shapes and protected endpoint bearer failure modes.
- Gateway tests for model listing, unauthorized model rejection, non-streaming response shape, and streaming `[DONE]`.
- Full validation with `pnpm validate`, `pnpm build`, and database generation/migration checks.

## Risks

- Existing credential helper currently creates sessions and can register users. Mitigation: add a separate existing-account authentication helper and test that OAuth login has no session side effects.
- Model availability may include free development models when no database is configured. Mitigation: keep development behavior explicit in tests and document that production model access depends on database-backed configuration.
- SSE compatibility can drift from OpenAI clients. Mitigation: use a small formatter and test exact `data:` records including `[DONE]`.
