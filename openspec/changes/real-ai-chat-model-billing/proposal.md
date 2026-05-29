## Why

The current AI chat flow still behaves like a simulated runtime: users cannot choose a real configured model, operators cannot manage provider/model routing, and token usage is not converted into platform credits. This change closes the product loop so chat requests are executed through configured AI providers and billed against user credits.

## What Changes

- Add admin-managed AI provider and model configuration, including enabled state, display metadata, provider credentials reference, endpoint/model identifiers, entitlement requirements, and credit pricing rules.
- Expose only entitlement-eligible enabled chat-capable models to active users so they can choose a model before starting a conversation.
- Route chat requests through the selected configured model instead of a deterministic mock response, while preserving persisted run history.
- Capture provider usage metrics from real responses and convert them into credit ledger debits.
- Block or fail chat requests when the selected model is disabled, unavailable, not included in the user's entitlements, or the user has insufficient credits.
- Preserve development fallback behavior only when no external provider credentials are configured, with an explicit non-production runtime marker.

## Capabilities

### New Capabilities
- `ai-model-billing`: AI provider/model configuration, user model availability, real chat execution, usage capture, and credit billing.

### Modified Capabilities
- `admin-management-console`: Add operator workflows for managing AI providers, models, and pricing rules.
- `public-product-experience`: Allow the chat page to load available models, select one, and show billing-aware states.
- `user-agent-runtime`: Extend chat runs to use selected models and persist usage/billing metadata.

## Impact

- Database schema and repositories for AI providers/models, model entitlement requirements, encrypted credential references or environment-backed secrets, model pricing, user credit balances, and credit ledger entries.
- Admin routes/pages for provider and model management.
- Public chat API request/response contracts to include `modelId`, model metadata, usage, and billing result.
- Agent runtime adapter layer for real provider calls, with tests for routing, errors, and billing.
- User-facing chat page model selector, insufficient-credit handling, and persisted history rendering.
