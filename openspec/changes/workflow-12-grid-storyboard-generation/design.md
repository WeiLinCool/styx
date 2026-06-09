## Context

The `/workflow` page is a multi-step public AI workflow with Step 0 upload, Step 1 storyboard generation, Step 2 scene selection, and Step 3 dream generation. Today the Step 1 card behaves like a generic image generation preview, while the detailed prompt logic lives in the client-side workflow quick-action helpers. The user wants the Step 1 `12宫格分镜图` to be generated as a completed artifact, with the generation prompt owned by the server and retries handled by going back to Step 0, uploading again, and starting a fresh generation.

The approved MVP extends this into a workflow video path. Backend Agent capabilities should follow a configuration-first skills paradigm: an ability has a code, description, input schema, prompt template, model binding, execution protocol, and enabled state. The first ability is `workflow-video-mvp`, which combines Step 0 source image, Step 1 storyboard artifact, Step 2 scene background, and prompt/map snapshots before sending a video task to `doubao-seedance-2-0`.

This change touches the workflow page UI, the workflow quick-action dialog state, the admin Agent Capability surface, and the server agent runtime because storyboard prompts, final video prompts, material validation, model binding, and terminal-state polling semantics need to be server-owned rather than duplicated in the client.

## Goals / Non-Goals

**Goals:**
- Make Step 1 in `/workflow` behave as a one-click `12宫格分镜图` generation surface.
- Move storyboard prompt templating behind the server so the client only triggers generation.
- Keep the generated storyboard as the Step 1 completed result.
- Preserve the Step 0 upload as the source of truth for a new generation attempt.
- Keep the existing workflow step structure and downstream scene/dream steps intact.
- Make the storyboard generation path poll until terminal state instead of failing early on slow runs.
- Add a skill-like `workflow-video-mvp` Agent Capability configuration for final workflow video generation.
- Combine uploaded source image, generated storyboard, configured scene background, and prompt/map snapshots before creating the final video run.
- Bind the MVP final video capability to `doubao-seedance-2-0` through the existing video task polling runtime.

**Non-Goals:**
- Redesign the whole workflow page layout.
- Redesign the full Step 2/Step 3 product flow beyond the MVP scene-background material handoff and final video submission.
- Introduce a new standalone workflow route.
- Add durable storyboard history or storage beyond the existing run result handling.
- Build a general runtime plugin loader or arbitrary executable skill system.
- Add multi-template, multi-scene, version history, rollback, or branching workflow project management.
- Accept raw provider prompt/material URLs assembled by the browser for final video execution.

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

### 6. Model backend Agent abilities as skill-like configuration
`workflow-video-mvp` should be represented in Agent Capability config as a declarative ability rather than a code-only branch. The runtime still owns execution, but the admin config owns description, input schema, prompt template, model binding, defaults, and enabled state.

Alternatives considered:
- Full plugin/runtime skill modules: more powerful, but too broad for the MVP and would introduce arbitrary execution and lifecycle concerns before there is more than one proven workflow-video ability.
- Hard-coded video orchestration only: fastest, but it would not satisfy the requested skills paradigm and would make prompt/model changes redeploy-dependent.

### 7. Treat final video as a server-orchestrated workflow stage
The browser should submit material references and intent for `stage: "workflow_video"`. The server resolves the capability config, validates required materials, renders the final prompt, signs material URLs, and creates the video task.

Alternatives considered:
- Let the browser assemble the final prompt and material URLs: simple to wire, but it leaks durable business truth and provider request semantics into UI state.
- Reuse generic video prompt submission unchanged: preserves existing API, but it cannot enforce the three required workflow materials or capability config snapshot.

### 8. Bind MVP to `doubao-seedance-2-0`
The first video workflow should fail closed unless the configured model binding resolves to an enabled Doubao video model using `video_task_polling`.

Alternatives considered:
- Let users choose any video model: flexible, but it weakens the MVP guarantee and increases provider compatibility work.
- Add a new provider abstraction now: unnecessary if the existing video adapter/polling path can carry ordered materials and the rendered prompt.

## Risks / Trade-offs

- [More server logic in the workflow path] -> Mitigation: keep the template and polling changes isolated to the workflow-specific runtime branch and reuse the existing run infrastructure.
- [Potential mismatch between Step 1 preview and final generated storyboard semantics] -> Mitigation: define Step 1 as the only completion surface for the storyboard result and keep the Step 0 upload as the retry source.
- [User confusion about why re-upload is required for a fresh run] -> Mitigation: make the Step 1 copy and Step 0 back-navigation explicit so the reset path is visible.
- [Polling can still waste requests on long-running jobs] -> Mitigation: poll only while the run is active and stop immediately on terminal states.
- [Capability config can drift between admin edits and running jobs] -> Mitigation: snapshot the effective capability config into the created run.
- [Final video may start with incomplete transient UI state] -> Mitigation: validate source image, storyboard artifact, scene background, prompt map, capability config, and model binding server-side before provider task creation.
- [Video provider material support may not match the three-image workflow] -> Mitigation: extend the existing video adapter narrowly for ordered material URLs and preserve existing single-material callers.
