## 1. Data Model And Repositories

- [ ] 1.1 Add database schema and migrations for AI providers, AI models, model entitlement requirements, pricing snapshots, and credit ledger entries tied to agent runs.
- [ ] 1.2 Implement repositories for provider/model CRUD, entitlement-filtered chat model lookup, model resolution by id, entitlement authorization, and ledger balance/debit operations.
- [ ] 1.3 Seed development model data and environment-backed real provider defaults without exposing secret values.

## 2. Provider Runtime And Billing

- [ ] 2.1 Define provider adapter interfaces for normalized chat messages, model config, provider metadata, and usage output.
- [ ] 2.2 Implement an OpenAI-compatible chat adapter and retain an explicit development fallback adapter for non-production unconfigured environments.
- [ ] 2.3 Extend agent run creation to require selected `modelId` for chat, snapshot resolved model/provider/pricing/entitlement basis, and reject disabled, unavailable, or entitlement-ineligible models.
- [ ] 2.4 Implement preflight credit checks, final usage-to-credit calculation, transactional ledger debits, and idempotent billing failure handling.

## 3. APIs

- [ ] 3.1 Add an authenticated user API for entitlement-filtered enabled chat model options with display metadata, default marker, entitlement label, and pricing summary.
- [ ] 3.2 Update the agent run API request/response contract to accept `modelId` and return selected model, entitlement basis, usage, credit cost, billing status, insufficient-credit errors, and model-entitlement errors.
- [ ] 3.3 Add admin APIs or server actions for provider/model configuration, enable/disable operations, pricing updates, and configuration validation.

## 4. Admin Console

- [ ] 4.1 Add provider/model management UI reachable from admin AI/settings navigation.
- [ ] 4.2 Show provider status, model support, default model, entitlement requirements, pricing summary, and credential-reference validation without revealing secrets.
- [ ] 4.3 Extend AI job/run review views to show model snapshot, usage, billing status, credit cost, and linked ledger entry.

## 5. Public Chat Experience

- [ ] 5.1 Load the user's entitlement-filtered enabled chat models on the chat page and select the configured default model when no valid prior selection exists.
- [ ] 5.2 Submit chat prompts with selected `modelId` and render real assistant responses, selected model labels, usage/charge summaries, and billing-aware error states.
- [ ] 5.3 Update persisted chat history rendering to recover assistant replies with selected model and credit charge metadata.

## 6. Verification

- [ ] 6.1 Add unit tests for model resolution, entitlement filtering, disabled model rejection, unauthorized model rejection, provider adapter normalization, pricing calculation, and idempotent ledger debits.
- [ ] 6.2 Add API tests for model listing by entitlement, chat run creation with `modelId`, insufficient credits, model-entitlement errors, and provider configuration errors.
- [ ] 6.3 Run typecheck, lint, tests, and browser verification for admin model management and public chat model selection.
