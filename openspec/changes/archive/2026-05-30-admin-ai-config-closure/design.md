# Design: Admin AI Config Closure

## Summary

The admin AI model page becomes a two-layer operations console: providers own endpoint and credential references; models own model identifiers, default chat selection, pricing, entitlement rules, and enablement. The console adds write paths and test actions while preserving the current security posture that only environment variable names, never secret values, are stored.

## Goals

- Allow admins to create and edit `openai_compatible` providers.
- Allow admins to create and edit models under those providers.
- Allow admins to set exactly one enabled default chat model.
- Allow admins to run provider-level and model-level safe test actions.
- Keep route files thin and place durable logic in repositories and server services.
- Add Playwright-based browser verification expectations for develop workflows.

## Non-Goals

- Secret storage UI.
- Streaming or advanced playground tooling.
- Non-chat model task types.
- Provider-specific adapters beyond the existing `openai_compatible` path.

## State Ownership

- Provider durable state is owned by `ai_providers` and repository mutations in `src/server/repositories/ai-models.ts`.
- Model durable state is owned by `ai_models` and `ai_model_entitlement_requirements` through the same repository boundary.
- Provider/model live test results are transient request outputs, not persisted durable configuration.
- Secret values remain owned by server environment configuration and are never written through the admin UI.

## Invariants

1. At most one enabled model may have `isDefaultChat = true`.
2. An `openai_compatible` provider cannot be enabled or tested unless `baseUrl` and `credentialEnvKey` are present.
3. A model test must execute against an enabled provider and a concrete model string.

## Architecture

The existing `/admin/ai-models` route continues to render the management console, but the page grows from a read-only table into a dense two-section operational surface:

- Provider section for provider records and provider-level actions.
- Model section for model records and model-level actions.

API routes validate input, enforce admin authorization, and call repository/service functions. Repository code continues to own query shape and persistence. Live test requests call a small server-side testing service that reuses the existing provider adapter contract with sanitized, temporary request payloads.

## Data And API Changes

No schema migration is required for the main closure because the current schema already contains the required provider/model fields. The change adds repository mutations and admin API routes for:

- create/update provider
- enable/disable provider
- create/update model
- enable/disable model
- set default model
- test provider configuration
- test model configuration

Provider tests accept a selected model id so the adapter can issue a minimal chat-completions request using the provider's current endpoint and credential reference. Model tests run directly against the selected model. Both return a short, safe summary containing result state, response timing, and a trimmed error summary when needed.

## UI Design

The page remains an admin operations surface: compact, scannable, and form-driven. It should not become a wizard. Editing uses modal or drawer forms attached to each section. Inline badges continue to show provider type, status, default state, chat support, entitlement summary, pricing summary, and credential reference validity.

Provider row actions:

- Edit
- Enable/disable
- Test provider

Model row actions:

- Edit
- Enable/disable
- Set as default chat
- Test model

Forms should surface validation before submit where possible and return specific server validation errors after submit. When a provider is disabled or incomplete, model test and default-setting actions should clearly explain why they are unavailable.

## Security

- Secret values must not be accepted, stored, logged, or rendered.
- Test endpoints must fail closed for non-admin sessions.
- Error summaries from upstream providers must be trimmed and normalized before returning to the browser.
- Middleware remains unchanged; all new logic stays in route handlers and server modules.

## Verification

- Repository and route tests for new mutations and invariant enforcement.
- Build and validate for typing and App Router wiring.
- Browser verification for the admin page.
- Develop guidance update in `DEVELOPMENT.md` establishing Playwright-first expectations for user-visible admin UI changes, local browser preparation, and explicit blocker reporting when full authenticated browser coverage is unavailable.
