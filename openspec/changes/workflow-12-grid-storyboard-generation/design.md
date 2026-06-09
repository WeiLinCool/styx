## Context

The `/workflow` page is a multi-step public AI workflow with Step 0 upload, Step 1 storyboard generation, Step 2 scene selection, and Step 3 dream generation. Today the Step 1 card behaves like a generic image generation preview, while the detailed prompt logic lives in the client-side workflow quick-action helpers. The user wants the Step 1 `12宫格分镜图` to be generated as a completed artifact, with the generation prompt owned by the server and retries handled by going back to Step 0, uploading again, and starting a fresh generation.

This change touches the workflow page UI, the workflow quick-action dialog state, and the server agent runtime because the generation prompt template and terminal-state polling semantics need to be server-owned rather than duplicated in the client.

## Goals / Non-Goals

**Goals:**
- Make Step 1 in `/workflow` behave as a one-click `12宫格分镜图` generation surface.
- Move storyboard prompt templating behind the server so the client only triggers generation.
- Keep the generated storyboard as the Step 1 completed result.
- Preserve the Step 0 upload as the source of truth for a new generation attempt.
- Keep the existing workflow step structure and downstream scene/dream steps intact.
- Make the storyboard generation path poll until terminal state instead of failing early on slow runs.

**Non-Goals:**
- Redesign the whole workflow page layout.
- Change the Step 2/Step 3 generation semantics.
- Introduce a new standalone workflow route.
- Add durable storyboard history or storage beyond the existing run result handling.

## Decisions

### 1. Keep the feature inside the existing workflow page
The storyboard generation remains part of `/workflow` rather than becoming a separate route or modal-driven product flow. That keeps the Step 0 -> Step 1 -> Step 2 progression intact and avoids duplicating workflow state management.

Alternatives considered:
- Separate route for storyboard generation: clearer isolation, but it would fragment the workflow and make the Step 0 re-upload + Step 1 retry loop harder to follow.
- Modal-only generation: lighter surface, but it would bury the storyboard result away from the step-based workflow the user expects.

### 2. Treat Step 1 as the completed result surface
Step 1 should show the generated storyboard artifact directly. The existing `12宫格分镜图` card becomes the canonical place where the generated result is displayed, and its retry path is to go back to Step 0 and upload a new base image.

Alternatives considered:
- Keep a separate preview panel and leave Step 1 as a loading shell: this would add unnecessary indirection and weaken the step semantics.
- Auto-reset Step 0 whenever the user re-runs: this would erase useful upload context and make retry behavior less predictable.

### 3. Move storyboard prompt ownership to the server
The prompt template for the storyboard generation should live on the server side, close to the run orchestration that already knows the task type and runtime constraints. The client should only submit a storyboard-generation intent plus the current workflow context needed to start the run.

Alternatives considered:
- Keep the large prompt template in the client: easy to implement short-term, but it would violate the requested ownership model and create duplication risk.
- Store the prompt in a separate config table: more flexible, but unnecessary for a single workflow-specific template and adds migration overhead.

### 4. Use terminal-state polling for the storyboard run
The generation flow should continue polling while the run is active and only resolve when the run succeeds or fails. The current timeout behavior is too eager for a backend process that is still running normally.

Alternatives considered:
- Fire-and-forget with no polling: would make the UI feel faster, but it would not give the user a reliable completion signal.
- Fixed short timeout: simpler, but it would keep reproducing the current false timeout problem.

### 5. Keep manual re-upload as the reset mechanism
The user should return to Step 0, re-upload a new base image, and then trigger generation again when they want a fresh storyboard. That keeps the state transitions explicit and avoids hidden partial resets.

Alternatives considered:
- Add a separate retry button in Step 1 that silently clears and reuses the previous upload: convenient, but it obscures the actual source of truth and makes it easier to regenerate against stale input.

## Risks / Trade-offs

- [More server logic in the workflow path] -> Mitigation: keep the template and polling changes isolated to the workflow-specific runtime branch and reuse the existing run infrastructure.
- [Potential mismatch between Step 1 preview and final generated storyboard semantics] -> Mitigation: define Step 1 as the only completion surface for the storyboard result and keep the Step 0 upload as the retry source.
- [User confusion about why re-upload is required for a fresh run] -> Mitigation: make the Step 1 copy and Step 0 back-navigation explicit so the reset path is visible.
- [Polling can still waste requests on long-running jobs] -> Mitigation: poll only while the run is active and stop immediately on terminal states.
