## Why

OpenPawz enterprise desktop builds need this web application to act as the server-side SSO, entitlement, and model-gateway backend. The desktop client has no bundled user session, so it must authenticate through this application's existing user account system before enterprise features and cloud model requests are enabled.

## What Changes

- Add OAuth2 Authorization Code with PKCE endpoints for the OpenPawz desktop public client.
- Implement an OAuth authorization browser flow that authenticates with the existing user account/password system and only authorizes active users.
- Issue enterprise bearer access tokens that are bound to existing users but separate from WebUI cookie sessions.
- Add userinfo and entitlement APIs that resolve identity and feature access from existing user records and entitlement configuration.
- Add an OpenAI-compatible enterprise model gateway under `/api/llm/v1` for model listing and chat completions.
- Enforce `models:proxy` or `all` server-side before accepting enterprise cloud model requests.

## Capabilities

### New Capabilities
- `enterprise-sso-plugin-api`: OAuth2 PKCE login, bearer token validation, userinfo, entitlement resolution, and OpenAI-compatible enterprise model gateway APIs for OpenPawz enterprise builds.

### Modified Capabilities
- `ai-model-billing`: Enterprise gateway model access reuses existing model configuration, user entitlements, and provider routing instead of introducing separate desktop-only model truth.

## Impact

- New App Router route handlers for `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, `/api/entitlements`, `/api/llm/v1/models`, and `/api/llm/v1/chat/completions`.
- New server-domain modules for enterprise OAuth state, bearer token validation, entitlement mapping, and gateway request handling.
- Database schema and migration support for authorization codes and access tokens unless implementation can satisfy security invariants with an equivalent durable store.
- Existing user account login, account-state guard, entitlement resolution, AI model repository, and provider adapter behavior become authority sources for enterprise desktop access.
- Focused tests for PKCE validation, code reuse prevention, bearer-token failure modes, entitlement mapping, and gateway authorization.
