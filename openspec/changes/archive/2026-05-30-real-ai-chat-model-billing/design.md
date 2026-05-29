## Context

The application already has an agent runtime shape: `agent_runs` persist prompts, provider/model snapshots, events, artifacts, and chat history. Admin pages also show AI job metadata, and public chat submits server-side runs. The missing product contract is that providers and models are not operator-configurable, users cannot choose an enabled model, responses are still effectively development-runtime output, and no usage-to-credit billing happens.

This change introduces a server-owned model catalog and billing layer between public chat clients and provider adapters:

```
Admin config
  -> provider/model catalog + pricing + entitlement gates
  -> entitlement-filtered public model list
  -> chat request with modelId
  -> server entitlement recheck
  -> provider adapter
  -> usage normalization
  -> credit ledger debit
  -> persisted run + assistant reply
```

## Goals / Non-Goals

**Goals:**
- Let admins create, update, enable, disable, and price AI providers/models for chat.
- Let active users choose from enabled chat models that their current entitlements allow.
- Execute chat through a real provider adapter when credentials are configured.
- Persist selected model/provider snapshots, provider usage, computed credit cost, and billing status with each run.
- Debit user credits atomically with completed chat runs and expose insufficient-credit errors before provider work where possible.
- Keep deterministic local fallback only as a development path when real credentials are unavailable.

**Non-Goals:**
- Streaming token-by-token UI.
- Multi-turn provider context window optimization beyond sending recent conversation messages already available to the server.
- Image, video, and workflow real-provider billing in this change, except keeping the model/billing schema extensible for those task types.
- Building a full secret manager; credentials can be referenced by environment variable or existing deployment secret conventions.

## Decisions

### Model Catalog Is Database-Backed

Create first-class provider/model records instead of continuing to encode model details only inside agent capability config. Provider records hold display name, provider type, enabled state, base URL, and credential reference. Model records hold provider relation, model identifier, display metadata, task support, enabled state, default flag, entitlement requirements, and pricing rules.

Alternative considered: continue using `agent_capabilities` with JSON config. That keeps schema smaller, but makes admin validation, user-facing model lists, and pricing queries brittle. A typed catalog is more maintainable and can still feed existing capability snapshots.

### Requests Use `modelId`

Public chat requests SHALL pass a selected model id. The server resolves that id to an enabled chat model and snapshots provider/model/pricing into the run before execution.

Alternative considered: accept provider/model strings from the client. That would be easier to wire but allows stale or unauthorized model routing and makes billing rules client-influenced.

### Entitlements Gate Model Visibility And Execution

Model availability is the intersection of provider enabled state, model enabled state, task support, and the user's active entitlements. Entitlement rules should support at least membership-plan access, benefit-code access, and explicit user grants through `user_entitlements`. The public model-list API applies this filter for UX, and the run service repeats the same check before provider execution so a stale client cannot call a premium model.

Alternative considered: only hide premium models in the chat UI. That is not a security boundary and would allow direct API calls to bypass membership limits.

### Provider Execution Goes Through Adapters

Add a provider adapter interface that accepts normalized chat messages plus resolved model config and returns assistant content, raw provider metadata, and normalized usage. Start with OpenAI-compatible HTTP chat completions support because many providers expose that shape, while retaining a development adapter for unconfigured local environments.

Alternative considered: integrate one hard-coded vendor directly in the route handler. That would be faster initially but would mix credentials, request formatting, retries, usage parsing, and billing in one API route.

### Billing Uses a Credit Ledger

Credit debits SHALL be recorded as ledger entries rather than only decrementing a number in user metadata. A completed chat run creates a debit entry tied to the run id, with prompt tokens, completion tokens, total tokens, pricing snapshot, and credit amount. User-visible balance is derived from ledger plus grants/purchases, or from the existing balance field plus ledger while migrating.

Alternative considered: mutate a `credits` metadata field directly. That is not auditable and makes retries/idempotency unsafe.

### Billing Timing

The system SHALL perform a preflight affordability check using either the configured minimum charge or estimated maximum prompt cost, then perform the final debit after provider usage is known. If the final debit fails due to concurrent credit use, the run is marked billing-failed and the assistant content is not presented as a successful charged answer.

Alternative considered: reserve credits before calling the provider. Reservation is more robust but adds more states; this change can model reservations later through the same ledger with `hold/release/debit` entries.

## Risks / Trade-offs

- Provider APIs vary in request and usage formats -> Normalize around an adapter interface and implement OpenAI-compatible providers first.
- Concurrent requests can overspend credits -> Use transactional balance checks and idempotent ledger entries keyed by run id.
- Admin misconfiguration can break chat -> Add validation, test-call affordances, disabled-state handling, and clear user errors.
- Development fallback could be mistaken for real AI -> Mark fallback runs in metadata and keep fallback unavailable in production unless explicitly enabled.
- Entitlement rules can drift from membership/benefit data -> Store model requirements as explicit plan/benefit/user-grant references and validate them in admin screens.
- Existing user credits may be stored as metadata -> Introduce a migration path that seeds initial ledger grants or bridges reads during transition.

## Migration Plan

1. Add catalog, model entitlement requirement, and ledger schema, preserving existing `agent_runs` columns.
2. Seed one development model and optionally one environment-configured OpenAI-compatible model when provider env vars exist.
3. Add admin management screens and repository APIs.
4. Add public model-list API filtered by user entitlements and update chat request parsing to require/resolve `modelId`.
5. Add provider adapter execution and billing transaction.
6. Backfill or bridge existing user credit balances into the ledger model.
7. Keep legacy default-bundle chat behavior only for local fallback until all clients pass `modelId`.

Rollback keeps existing chat route available by disabling all real models and using the deterministic development adapter in non-production. Billing ledger writes are additive and can be ignored by older code if the new routes are reverted.

## Open Questions

- Which real provider should be seeded first in production: OpenAI-compatible endpoint, direct OpenAI, Anthropic, or a domestic vendor?
- Should users see estimated credit cost before sending, or only model labels and post-run charge in the first release?
- Should credit purchases and membership grants be migrated into the same ledger as part of this change or in a follow-up?
- Should model entitlement rules be configured directly on models first, or managed as reusable access tiers shared by multiple models?
