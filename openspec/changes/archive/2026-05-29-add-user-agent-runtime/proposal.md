## Why

User-facing AI pages currently simulate responses locally while the backend only exposes an admin-facing `ai_jobs` operational view. Users need a real model request path that can run an agent, while skills, MCP servers, and plugins must remain an admin-maintained capability layer that users do not have to understand.

## What Changes

- Add a user-facing agent runtime API that accepts chat, image, video, and workflow requests and returns structured run status, messages, and artifacts.
- Add a server-side Pi-based agent runtime adapter that resolves admin-managed model, skill, MCP, and plugin configuration before executing a run.
- Add persistent agent run, event, artifact, and capability configuration records so runs can be audited, resumed, and surfaced in admin operations.
- Extend admin management so operators can maintain enabled models, skills, MCP servers, plugins, and capability bundles without exposing those controls to end users.
- Connect existing user-facing AI pages to the runtime API instead of local mock responses.

## Capabilities

### New Capabilities
- `user-agent-runtime`: User-facing agent request execution, Pi runtime configuration, admin-managed skills/MCP/plugins, run history, and artifacts.

### Modified Capabilities
- `admin-management-console`: Admin console requirements expand to include model, skill, MCP, plugin, and capability bundle maintenance.
- `public-product-experience`: Protected public AI flows submit real agent runs and render run state instead of mock-only responses.

## Impact

- Affected code: `src/app/chat`, `src/app/image-gen`, `src/app/video-gen`, `src/app/workflow`, `src/app/api`, `src/app/admin`, `src/features/admin`, `src/server/db`, `src/server/repositories`, and new `src/server/agent` modules.
- Affected data: PostgreSQL schema and Drizzle migrations for agent configuration, runs, events, and artifacts.
- Affected APIs: new user runtime endpoints and admin configuration endpoints.
- Affected dependencies: no hard dependency on a concrete Pi SDK is required for the first slice; the implementation must expose a `PiAgentRuntime` adapter port that can be wired to the real Pi runtime when available.
