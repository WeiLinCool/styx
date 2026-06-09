## Why

The `workflow` page currently treats the Step 1 12-grid storyboard as a generic image-generation preview, but the real user intent is a one-click storyboard generation that feeds the next step in the workflow. The prompt content and retry behavior need to move behind the server so the frontend only triggers the action and receives the finished storyboard result.

The workflow now also needs an MVP path for generating video from the full set of workflow materials. Operators should be able to manage that backend Agent ability using a skill-like configuration paradigm: code, description, input schema, prompt template, model binding, and execution protocol. The first video MVP should use Step 0 source image, Step 1 12-grid storyboard output, Step 2 scene background, and server-owned prompt/map snapshots before sending the final request to `doubao-seedance-2-0`.

## What Changes

- Add a dedicated one-click generation flow for the Step 1 `12宫格分镜图` in `/workflow`.
- Move the storyboard generation prompt template to the server so the client no longer owns the detailed prompt text.
- Keep the Step 0 uploaded base image as the source of truth for generation.
- Show the generated storyboard directly in Step 1 as the completed result.
- Preserve the current workflow state so that going back to Step 0 and re-uploading a new image is the way to start a fresh generation.
- Make the generation path poll until the server-side run reaches a terminal state instead of failing early on an in-flight request.
- Extend backend Agent Capability configuration with a skill-like `workflow-video-mvp` ability.
- Let admins configure the final workflow video prompt/defaults while the system validates the fixed MVP input schema and `doubao-seedance-2-0` model binding.
- Add a final workflow video generation path that combines source image, storyboard artifact, scene background, and prompt/map snapshots before creating a video task polling run.
- Fail closed when required materials, capability config, or video model binding are incomplete.

## Capabilities

### New Capabilities
- `workflow-12-grid-storyboard-generation`: one-click Step 1 storyboard generation in `/workflow`, including server-owned prompt templating, polling, completed storyboard display, and step-based reset/retry behavior.
- `workflow-video-mvp-capability`: skill-like backend Agent Capability configuration and runtime orchestration for generating a workflow video through `doubao-seedance-2-0` from the three required workflow material groups.

### Modified Capabilities
- `public-product-experience`: the workflow page now presents a completed storyboard result in Step 1 and requires Step 0 re-upload plus re-generation to start over.
- `user-agent-runtime`: workflow runs need server-owned prompt shaping, material validation, terminal-state polling semantics, and final video task creation using configured skill-like capability metadata.
- `admin-management-console`: Agent Capability administration needs an editor/summary for workflow-video MVP configuration alongside the storyboard template configuration.

## Impact

- Affected UI: `src/app/workflow/page.tsx`, `src/app/workflow/workflow-quick-action-dialogs.tsx`, `src/app/workflow/workflow-quick-actions.ts`
- Affected admin UI: `src/app/admin/(console)/agent-capabilities/page.tsx`, `src/features/admin/admin-action-controls.tsx`
- Affected server runtime: `src/server/agent/run-service.ts`, `src/server/agent/types.ts`
- Affected video runtime: `src/server/ai/video-provider-adapters.ts`, `src/server/video/video-generation-policy.ts`
- Affected repositories: `src/server/repositories/agent-capabilities.ts`
- Affected API/client flow: `src/features/public/agent-runtime-client.ts` if the workflow run input contract changes
- Affected verification: workflow-step UI behavior, polling retry behavior, and one-click reset/re-upload flow
