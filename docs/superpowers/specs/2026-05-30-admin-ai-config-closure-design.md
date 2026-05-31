---
status: draft
change: admin-ai-config-closure
archived-with: 2026-05-30-admin-ai-config-closure
status: final
---
# Admin AI Config Closure Design

Change: `admin-ai-config-closure`
Status: design
Date: 2026-05-30

## Summary

This change closes the admin-side AI configuration loop. The repository already contains AI provider and model tables, runtime provider adapters, admin listing, and model status toggles. The missing capability is operational ownership: admins cannot create or edit providers, create or edit models, switch the default chat model, or run a safe end-to-end test from the console. This design upgrades `/admin/ai-models` into a full operational configuration surface for the first `openai_compatible` provider onboarding path.

The design keeps the existing ownership model intact. Durable provider/model state remains in `src/server/repositories/ai-models.ts`; admin routes validate input and authorization; the live upstream call path stays in `src/server/ai/provider-adapters.ts`. Secret values remain outside the database and UI. The admin surface only stores and displays environment variable key references plus validity summaries.

## Current State

- `ai_providers` and `ai_models` already exist in schema and seed flows.
- The admin AI model page renders provider and model tables but does not provide write flows.
- Model status can be toggled through `/api/admin/ai-models/[modelId]/status`.
- `provider-adapters.ts` already supports `development` and `openai_compatible`.
- Credential summaries already distinguish `valid`, `invalid`, and `not_required`, but they are passive indicators.
- The repository has not yet codified provider create/update, model create/update, default-model mutation, or safe config-test flows.
- This repository does not yet have a Playwright develop requirement, even though admin surfaces are dense and interaction-sensitive.

## Goals

- Add provider create/edit/status flows for `openai_compatible` onboarding.
- Add model create/edit/status/default flows under provider ownership.
- Enforce a single enabled default chat model.
- Add provider-level and model-level configuration tests.
- Keep secret handling reference-only.
- Add explicit Playwright-first develop guidance for user-visible admin UI changes.

## Non-Goals

- Secret vault management or secret input fields.
- Streaming completions, prompt playgrounds, or long-lived test sessions.
- New provider-specific adapters.
- Broader agent capability redesign.

## Industry Consensus -> Transferable Principle -> Repository Constraints -> Local Design

Industry consensus: admin-facing model catalogs usually separate provider credentials/endpoints from model-level runtime selections and expose lightweight connectivity tests without revealing secrets.

Transferable principle: mutable durable configuration should be edited where the owning table or service boundary already exists, while runtime tests should be explicit operator actions that return safe summaries instead of hidden background state.

Repository constraints: this app uses App Router route handlers for transport validation, `src/server/repositories` for persistence, current `provider-adapters.ts` for real requests, and an admin console that favors dense, scannable operational views. The schema already supports the needed provider/model fields, and secrets must remain environment-owned.

Local design: extend the current AI model repository with provider/model mutation helpers and a small test service layered over the existing adapter contract; expose those capabilities through admin routes; upgrade `/admin/ai-models` into a two-section console with provider and model forms and action buttons; document Playwright browser verification as a develop default for such UI changes.

## Mutable State Table

| State | Owner | Write Entry | Source of Truth |
| --- | --- | --- | --- |
| Provider code/name/type/status/baseUrl/credentialEnvKey | `ai_providers` via repository | Admin provider routes | PostgreSQL row |
| Model code/name/model/status/supportsChat/isDefaultChat/pricing | `ai_models` via repository | Admin model routes | PostgreSQL row |
| Model entitlement rows | `ai_model_entitlement_requirements` via repository | Admin model form submit | PostgreSQL rows |
| Provider/model test result | Test service response | Admin test routes | Ephemeral request result |
| Secret values | Server environment | Deployment/runtime config | `process.env` |

## Invariants

1. At most one enabled chat model can be the default.
2. An `openai_compatible` provider cannot transition to enabled or tested state without `baseUrl` and `credentialEnvKey`.
3. A model-level test can only run when the selected model and its provider are both enabled for chat execution.

## Architecture

### Repository

Extend `src/server/repositories/ai-models.ts` with mutation helpers and invariant enforcement:

- `createAiProvider(input)`
- `updateAiProvider(input)`
- `updateAiProviderStatus(input)`
- `createAiModel(input)`
- `updateAiModel(input)`
- `updateAiModelStatus(input)`
- `setDefaultChatModel(input)`
- `testAiProviderConfiguration(input)`
- `testAiModelConfiguration(input)`

The repository remains the owner of persistence shape and should continue to return credential-safe DTOs. Default model changes should be transactional: clear previous default, set new default, and reject invalid target state.

### Test Service

Introduce a narrow server-side helper, either inside the repository module or as `src/server/ai/provider-config-tests.ts`, depending on code volume. It will:

- validate local prerequisites first
- construct a minimal request using the existing adapter contract
- measure elapsed time
- normalize and trim error output
- return a short safe summary

Provider-level tests require a selected model id under that provider. Model-level tests use the model directly. Neither persists test history in this change.

### API Routes

Add thin admin routes under `src/app/api/admin/ai-providers/*` and `src/app/api/admin/ai-models/*` for create/update/status/test/default mutations. Each route:

- requires admin auth
- validates path/body with `zod`
- calls repository/service code
- normalizes validation and domain failures

### UI

`/admin/ai-models` becomes a two-section page:

- Provider section with table and provider form dialog/drawer
- Model section with table and model form dialog/drawer

The page remains operational and dense. No onboarding wizard. Each section keeps summary signals visible at scan speed: status badges, credential summaries, default state, entitlement summary, and pricing summary.

Provider actions:

- Edit
- Enable/disable
- Test provider

Model actions:

- Edit
- Enable/disable
- Set default chat
- Test model

Unavailable actions should explain why, especially when provider status or missing references block execution.

## Error Handling

- Local validation errors return field-specific feedback.
- Upstream provider errors are shortened and normalized.
- Missing env vars are reported as reference problems, not secret values.
- Default-model mutation rejects disabled or non-chat targets.
- Provider disable should reject if that would leave no enabled default chat model, unless the same transaction assigns a replacement. For this change, the simpler rule is to require the operator to move the default before disabling the current default provider/model.

## Verification Strategy

Lowest meaningful layer first:

- repository tests for invariant and mutation behavior
- route tests for validation/auth boundaries
- `pnpm validate`
- `pnpm build`
- browser verification for `/admin/ai-models`

The browser verification requirement should be formalized in `DEVELOPMENT.md` for develop workflows that touch user-visible admin UI. Following the `../lingwei` practice, local Playwright setup is preferred, browser installation should not be treated as a remote-server routine, and any blocker preventing authenticated end-to-end verification must be written into the verification report explicitly.

## Files Expected To Change During Build

- `src/app/admin/(console)/ai-models/page.tsx`
- `src/features/admin/*` AI model/provider action and form components
- `src/app/api/admin/ai-providers/**`
- `src/app/api/admin/ai-models/**`
- `src/server/repositories/ai-models.ts`
- new or updated tests under `src/app/api/admin/**` and `src/server/repositories/**`
- `DEVELOPMENT.md`
- Playwright config/spec files if introduced for this repository

## Testing

- Repository tests for provider/model create/update/default invariants
- Route tests for admin-only mutation access and validation behavior
- Config-test unit coverage for safe error normalization where practical
- Browser smoke for the admin AI config page and key action affordances
