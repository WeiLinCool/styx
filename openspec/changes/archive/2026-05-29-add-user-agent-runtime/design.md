## Context

Styx is a Next.js application with protected public AI surfaces and an admin console. The database already has `ai_jobs` for operational review, but users cannot submit a real model request path; chat and generation pages still use local mock behavior. Lingwei provides the relevant architectural reference: a structured `agent.run` contract, an orchestration service, and a worker-owned result path that avoids making terminal state the source of truth. Styx should adapt that shape to a server product: the user submits a request, the server resolves the allowed capability bundle, and a Pi-based runtime adapter executes the run.

## Goals / Non-Goals

**Goals:**

- Provide a single user-facing agent run API for chat, image, video, and workflow tasks.
- Keep users unaware of skills, MCP servers, plugins, provider credentials, and routing decisions.
- Let admins maintain model/provider settings, skills, MCP servers, plugins, and default capability bundles.
- Persist run state, event history, final messages, and artifacts for user history and admin operations.
- Keep the Pi runtime behind a stable TypeScript port so the first implementation can be tested without coupling the app to a specific SDK shape.

**Non-Goals:**

- Build a full multi-agent desktop workspace like Lingwei.
- Expose skills, MCP, or plugin controls to end users.
- Implement billing, quota metering, or provider-specific streaming protocols in the first slice.
- Replace every existing `ai_jobs` admin behavior; `ai_jobs` can remain an operational summary or compatibility view.

## Decisions

1. **Use a server-owned structured run model.**
   - Decision: introduce `agent_runs`, `agent_run_events`, and `agent_artifacts` rather than treating `ai_jobs` JSON as the source of truth.
   - Rationale: run state, event history, tool capability snapshots, and artifacts are core domain records, not just admin table metadata.
   - Alternative considered: overload `ai_jobs.input` and `ai_jobs.output`. That is faster but makes auditing, resuming, and capability review brittle.

2. **Represent Pi as an adapter port.**
   - Decision: define a `PiAgentRuntime` interface under `src/server/agent` with a default local/mock adapter for development and tests.
   - Rationale: the user request path can be built and verified before the exact Pi SDK binding is finalized.
   - Alternative considered: import a concrete Pi implementation immediately. The current repository does not expose a stable Pi package, and Lingwei only shows a small `PiMemoryBranchPort`, so direct coupling would be speculative.

3. **Admin config resolves into immutable run snapshots.**
   - Decision: each run stores the resolved provider/model plus enabled skill, MCP, and plugin references at run creation time.
   - Rationale: later admin edits must not rewrite the meaning of already-executed user requests.
   - Alternative considered: read live config during every event. That makes debugging and audit trails inconsistent.

4. **User API stays capability-first, not tool-first.**
   - Decision: user requests provide task type, prompt, attachments/context, and optional conversation id; the server chooses the capability bundle.
   - Rationale: the product requirement says users are unaware of skills/MCP/plugins.
   - Alternative considered: expose advanced runtime controls to users. That conflicts with the intended user experience and increases support burden.

5. **Admin console owns maintenance surfaces.**
   - Decision: add admin modules or settings sections for model routing, skills, MCP servers, plugins, and default bundles.
   - Rationale: existing admin patterns already centralize operational management, audit, and localized operator copy.

## Risks / Trade-offs

- Pi SDK uncertainty -> mitigate with a narrow `PiAgentRuntime` port and integration tests around the port contract.
- Long-running requests can exceed route handler limits -> first slice can support queued/running/final polling, while streaming can be added later.
- Capability configuration can leak secrets -> store user-visible metadata separately from encrypted or server-only credential fields and never return secrets to public endpoints.
- MCP/plugin execution can be unsafe -> default to disabled or scoped execution, require admin enablement, and snapshot allowed capabilities per run.
- Schema scope is broad -> implement in vertical slices: domain/tests, persistence, admin config, user run API, then page integration.

## Migration Plan

1. Add schema and repository functions for capability configuration and agent runs.
2. Seed development-safe default capability bundles.
3. Add the runtime adapter with deterministic local behavior for tests and development.
4. Add admin configuration pages and actions.
5. Add user run API and connect chat first, then image/video/workflow.
6. Update admin AI job views to include or link agent run state.

Rollback is straightforward before production data migration: remove new routes/UI and keep existing mock pages. After migration, rollback must preserve new tables until run history retention is decided.

## Open Questions

- The concrete Pi runtime package/API is not present in this repository. The implementation will use a typed adapter port and should wire the real Pi binding once its package or service contract is available.
- Streaming delivery is valuable but not required for the first verified slice; initial implementation can use create-run plus poll-run endpoints.
