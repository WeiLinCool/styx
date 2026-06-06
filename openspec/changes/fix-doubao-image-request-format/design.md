# Design

Add `response_format: "b64_json"` to the Doubao image generation request body. Keep endpoint and response parser unchanged. Do not change API route contracts or event streaming behavior.

State/invariants:
- Provider request body is owned by `src/server/ai/image-provider-adapters.ts`.
- Model catalog remains database/admin-owned; runtime must pass the exact configured upstream model string.
- Durable run state remains in `agent_runs`; generated image content remains transient/provider-direct.
