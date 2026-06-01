# API Request Security And Idempotency Design

Date: 2026-06-01
Status: Draft approved for planning

## Problem

User-facing and admin-facing API calls are currently scattered across client components as direct `fetch` calls. This makes it easy to introduce duplicate requests, repeated submissions, inconsistent error handling, and uneven security posture.

The system needs request debouncing, idempotency, browser fingerprint risk signals, request integrity checks, and transport-aware behavior. HTTPS must be configurable and must not be a hard business availability dependency, but the system must avoid pretending that HTTP provides the same security guarantees.

## Research Summary

Industry consensus: TLS is the normal foundation for web transport security, idempotency keys are the standard way to make retryable unsafe requests safe, and browser fingerprints are risk signals rather than identity credentials.

Transferable principle: security must be layered. Client controls raise abuse cost, but server-side authorization, idempotency, replay checks, rate limits, and audit logs remain authoritative.

Repository constraints: this is a Next.js App Router application with route handlers under `src/app/api`, auth/session policy under `src/server/auth`, durable query ownership under `src/server/repositories`, and PostgreSQL/Drizzle for persistence.

Local design: introduce separate user and admin API clients, a server-side request protection layer, durable idempotency for side-effecting operations, and configurable transport security modes.

References:

- OWASP API Security Top 10 2023
- OWASP Transport Layer Security Cheat Sheet
- RFC 9557: Idempotency-Key HTTP Header Field

## Goals

- Separate user API and admin API request behavior.
- Reduce duplicate GETs and accidental repeated mutations from the browser.
- Make important mutations idempotent across retries, double clicks, refreshes, and network uncertainty.
- Add request integrity and replay-resistance controls where practical.
- Support HTTPS and HTTP deployments through explicit security modes.
- Keep business available when HTTPS is unavailable, while marking HTTP as a lower-security mode.
- Preserve server-side authority for auth, authorization, mutation policy, and durable state.

## Non-Goals

- Do not claim browser fingerprinting can replace HTTPS.
- Do not use client-side encryption as the main protection for passwords, cookies, or admin sessions.
- Do not make admin and user APIs share one client wrapper or one policy profile.
- Do not manually edit generated Drizzle metadata or lock files.
- Do not block all business traffic only because HTTPS is unavailable.

## Transport Security Modes

Configuration:

```env
STYX_TRANSPORT_SECURITY_MODE=strict | compatible | insecure
```

`strict`:

- HTTPS is required outside localhost.
- Non-HTTPS requests are rejected or redirected before sensitive API handling.
- Cookies use secure production attributes.
- Full request protection is required for protected API routes.
- Recommended for production, especially admin.

`compatible`:

- HTTPS receives full protections.
- HTTP remains business-available but is marked as degraded.
- Protected routes still require auth, authorization, idempotency where applicable, browser fingerprint where configured, rate limits, and request integrity headers.
- The server records `transportSecurity: "insecure"` for HTTP requests in diagnostics and security logs.

`insecure`:

- HTTP is explicitly allowed.
- Intended for local, demo, private-network, or risk-accepted deployments.
- The system does not claim confidentiality or strong anti-tamper guarantees.
- Management operations remain allowed only if admin policy explicitly permits insecure transport.

Invariant: HTTPS is a security capability, not a business startup prerequisite. HTTP mode is allowed, but must be visible, auditable, and risk-scoped.

## User API Client

Add a user-facing client wrapper, for example `src/lib/user-api-client.ts`.

Responsibilities:

- Wrap user-side `/api/*` calls from public/product/account pages.
- Debounce configured user actions such as repeated button clicks.
- Coalesce identical in-flight GETs for a short window.
- Attach request metadata headers:
  - request id
  - client timestamp
  - nonce
  - browser fingerprint digest when available
  - body hash for JSON mutation requests
  - `Idempotency-Key` for mutation requests that can create side effects
- Use `AbortController` for superseded read requests where the caller opts in.
- Normalize JSON and non-JSON API errors into one client shape.

Default user policy:

- GET: short in-flight dedupe and optional stale avoidance.
- POST/PATCH/DELETE: no client-side silent retries unless endpoint policy declares idempotent retry safe.
- Sensitive user mutations require an idempotency key.

## Admin API Client

Add a separate admin-facing client wrapper, for example `src/lib/admin-api-client.ts`.

Responsibilities:

- Wrap admin console API calls only.
- Attach admin-specific request metadata.
- Require idempotency keys for admin mutations.
- Avoid aggressive GET caching that could hide current operational state.
- Surface transport degradation warnings to admin UI affordances when needed.

Default admin policy:

- GET: minimal dedupe, no long-lived client cache by default.
- POST/PATCH/DELETE: idempotency required.
- In insecure transport, operations remain available only when server policy permits it.
- Admin mutation failures must fail closed when auth, authorization, signature, body hash, or idempotency requirements are missing.

Invariant: admin request policy is stricter and separate from user request policy.

## Server Request Protection

Add server-side helpers under `src/server/auth` or a focused `src/server/request-security` boundary.

Responsibilities:

- Resolve transport mode from config and request scheme.
- Classify requests as secure or insecure transport.
- Validate request metadata for protected API routes.
- Check timestamp tolerance.
- Check nonce replay where enabled.
- Verify body hash for JSON mutation requests.
- Validate browser fingerprint presence where route policy requires it.
- Provide route-level policy helpers for user routes and admin routes.

Request signatures may be added as a risk-control mechanism, but in HTTP mode they are not a confidentiality or strong tamper-proofing guarantee because the delivered browser code can be modified in transit.

Invariant: route handlers remain boundary adapters. They call request protection helpers before domain/repository code, then keep domain policy in server modules.

## Idempotency

Use RFC 9557-style `Idempotency-Key` headers for side-effecting operations.

Create durable idempotency storage when PostgreSQL is configured:

- key
- actor type: user, admin, anonymous
- actor id when authenticated
- route or operation name
- request body hash
- status: processing, completed, failed
- response summary or replayable response payload where safe
- created at
- expires at

When no database is configured in development, use a bounded in-memory fallback with short expiry.

Rules:

- Same actor + same operation + same key + same body hash returns the stored result when completed.
- Same key with different body hash is rejected.
- Concurrent duplicate requests see processing conflict or wait/retry behavior, depending on route policy.
- Failed idempotent operations are replayed only when route policy marks failure replay safe.

First target operations:

- User: login/register, account binding, activation work order creation, daily check-in, agent run creation.
- Admin: user activation/suspension, activation work order transitions, password reset work order transitions, point adjustment, order status changes, AI model/provider mutations, capability status changes.

Invariant: idempotency is enforced on the server. Client-generated keys are convenience, not authority.

## Browser Fingerprint Risk Signal

Reuse and extend the existing account fingerprint capability under `src/features/account/browser-fingerprint`.

Use fingerprint data for:

- rate-limit buckets
- device continuity hints
- activation workflow matching
- suspicious admin operation diagnostics
- additional review prompts in insecure transport mode

Do not use fingerprint data as:

- primary authentication
- admin authorization
- proof that a request is legitimate
- a replacement for session validation

Invariant: fingerprint can influence risk scoring and throttling, but cannot grant authority.

## Rate Limiting And Abuse Controls

Define route policies by sensitivity:

- public read
- authenticated user read
- authenticated user mutation
- sensitive user mutation
- admin read
- admin mutation
- sensitive admin mutation

Rate limit dimensions:

- actor id
- browser fingerprint digest
- IP or forwarded IP where reliable
- route policy bucket
- transport security state

In HTTP/insecure transport, apply stricter thresholds for sensitive actions and record degradation in logs.

## Error Handling

API errors should use stable machine-readable codes:

- `idempotency_key_required`
- `idempotency_key_reused_with_different_body`
- `request_replay_detected`
- `request_timestamp_expired`
- `request_body_hash_mismatch`
- `browser_fingerprint_required`
- `transport_security_required`
- `rate_limit_exceeded`

Admin UI should show operationally useful messages. User UI should avoid leaking protection internals.

## Mutable State

| State | Owner | Write Entry | Source Of Truth |
| --- | --- | --- | --- |
| request metadata | client API wrappers | per request | request headers |
| nonce replay state | server request protection | protected route entry | database or bounded memory fallback |
| idempotency records | repository/request-security store | protected mutation route | database, memory fallback in dev |
| fingerprint digest | browser client and server policy | client collection, server normalization | request metadata plus server logs |
| transport mode | server config | environment | runtime config |
| domain mutation result | domain/repository modules | route after protection checks | database/domain state |

## Boundary Graph

Client UI -> `userApiClient` or `adminApiClient` -> API route handler -> request protection helper -> auth/admin guard -> domain service -> repository -> database.

For public read routes, request protection may only classify transport and apply lightweight throttling.

For sensitive mutations, route handlers must validate request protection before calling domain code.

## Rollout Plan

1. Introduce policy types and pure helpers with tests.
2. Add user/admin API clients and migrate the highest-risk callers.
3. Add idempotency storage and route helper.
4. Apply to user mutations.
5. Apply to admin mutations.
6. Add transport mode handling and logs.
7. Add browser fingerprint risk hooks where route policy requires it.
8. Verify with unit tests, focused API route tests, and browser checks for representative user/admin flows.

## Verification Strategy

- Pure tests for transport mode resolution, body hash validation, idempotency key behavior, nonce replay behavior, and route policy classification.
- API route tests for required idempotency, duplicate key replay, mismatched body rejection, and insecure transport policy.
- Repository tests for durable idempotency records.
- Browser checks for duplicate-click behavior and representative user/admin mutation flows.
- `pnpm validate` when current repository baseline allows it; otherwise record pre-existing blockers and run focused checks.

## Open Questions For Planning

- Exact expiry duration for idempotency records by operation class.
- Whether nonce replay storage should be durable for all protected requests or only sensitive mutations.
- Which admin operations should require explicit insecure-transport confirmation in `compatible` mode.
- Whether response replay stores full JSON payloads or route-specific response summaries.
