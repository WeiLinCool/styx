## Why

The `workflow` page currently treats the Step 1 12-grid storyboard as a generic image-generation preview, but the real user intent is a one-click storyboard generation that feeds the next step in the workflow. The prompt content and retry behavior need to move behind the server so the frontend only triggers the action and receives the finished storyboard result.

## What Changes

- Add a dedicated one-click generation flow for the Step 1 `12宫格分镜图` in `/workflow`.
- Move the storyboard generation prompt template to the server so the client no longer owns the detailed prompt text.
- Keep the Step 0 uploaded base image as the source of truth for generation.
- Show the generated storyboard directly in Step 1 as the completed result.
- Preserve the current workflow state so that going back to Step 0 and re-uploading a new image is the way to start a fresh generation.
- Make the generation path poll until the server-side run reaches a terminal state instead of failing early on an in-flight request.

## Capabilities

### New Capabilities
- `workflow-12-grid-storyboard-generation`: one-click Step 1 storyboard generation in `/workflow`, including server-owned prompt templating, polling, completed storyboard display, and step-based reset/retry behavior.

### Modified Capabilities
- `public-product-experience`: the workflow page now presents a completed storyboard result in Step 1 and requires Step 0 re-upload plus re-generation to start over.
- `user-agent-runtime`: workflow runs need server-owned prompt shaping and terminal-state polling semantics so the Step 1 storyboard can complete reliably.

## Impact

- Affected UI: `src/app/workflow/page.tsx`, `src/app/workflow/workflow-quick-action-dialogs.tsx`, `src/app/workflow/workflow-quick-actions.ts`
- Affected server runtime: `src/server/agent/run-service.ts`, `src/server/agent/types.ts`
- Affected API/client flow: `src/features/public/agent-runtime-client.ts` if the workflow run input contract changes
- Affected verification: workflow-step UI behavior, polling retry behavior, and one-click reset/re-upload flow
