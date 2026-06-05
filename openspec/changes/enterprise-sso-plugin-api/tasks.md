## 1. OAuth Domain And Persistence

- [x] 1.1 Add schema and migration support for enterprise OAuth authorization codes and access tokens with hashed secrets, expiry, user binding, client binding, redirect binding, PKCE challenge, and consumed state.
- [x] 1.2 Implement repository helpers for creating, consuming, and resolving enterprise OAuth records.
- [x] 1.3 Implement enterprise OAuth domain logic for authorize validation, account/password authentication, code issuance, token exchange, PKCE S256 verification, token hashing, and bearer validation.

## 2. Entitlement And Identity Mapping

- [x] 2.1 Implement userinfo mapping from existing user account fields into OpenPawz-compatible claims.
- [x] 2.2 Implement enterprise entitlement mapping from existing user entitlement/model-access configuration into reserved names such as `models:proxy` and `all`.
- [x] 2.3 Add tests for active-user requirements, bearer-token failure modes, and entitlement mapping for users with and without cloud model access.

## 3. Route Handlers

- [ ] 3.1 Add `/oauth/authorize` route support for validating OAuth query parameters, rendering/handling account-password login, and redirecting success or OAuth errors to loopback callbacks.
- [ ] 3.2 Add `/oauth/token` route support for `application/x-www-form-urlencoded` token exchange and standard OAuth error responses.
- [ ] 3.3 Add `/oauth/userinfo` and `/api/entitlements` route handlers protected by enterprise bearer validation.

## 4. OpenAI-Compatible Gateway

- [ ] 4.1 Add `GET /api/llm/v1/models` protected by bearer validation and `models:proxy`/`all` entitlement checks.
- [ ] 4.2 Add `POST /api/llm/v1/chat/completions` with OpenAI-compatible payload validation, model entitlement enforcement, non-streaming response support, and no upstream provider call on authorization failure.
- [ ] 4.3 Add streaming SSE support for `stream=true`, including OpenAI-compatible `data:` chunks and `data: [DONE]`.

## 5. Verification

- [ ] 5.1 Add focused tests for PKCE mismatch, code replay, token expiry, invalid bearer token, missing `models:proxy`, model listing, and gateway rejection of unauthorized models.
- [ ] 5.2 Run `pnpm db:generate` and database migration checks appropriate to the environment.
- [ ] 5.3 Run `pnpm validate` and `pnpm build`.
