# Proposal: Admin AI Config Closure

## Why

The repository already has typed AI provider and model persistence, admin listing, and runtime provider adapters, but the admin surface is not operationally complete. Support can view provider/model state and toggle model status, yet cannot create or edit provider records, create or edit models, select the default chat model, or run a safe configuration test from the console.

This leaves the AI model page without a full management loop. It also makes the initial OpenAI-compatible provider onboarding path dependent on direct database edits or seed-only behavior, which is incompatible with a production admin workflow.

## What Changes

- Upgrade `/admin/ai-models` from a read-mostly list into a full provider/model configuration console.
- Add admin mutations for provider create/update/status, model create/update/status/default, and provider/model configuration tests.
- Keep secrets out of the database and UI by continuing to store only environment variable key references.
- Add provider-level and model-level configuration testing using the existing OpenAI-compatible provider adapter boundary.
- Establish Playwright-first browser verification requirements for develop workflows that touch user-visible admin surfaces.

## Impact

- Admins can onboard the first OpenAI-compatible provider entirely through the console plus environment configuration.
- Runtime model selection stays aligned with repository-owned durable state.
- Browser verification becomes an explicit develop expectation for admin UI changes, reducing regressions on dense operational pages.
