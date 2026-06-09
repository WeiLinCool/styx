## 1. Workflow Storyboard Runtime

- [x] 1.1 Add a server-owned storyboard prompt template and a dedicated workflow orchestration path that turns the Step 1 request into a terminal agent run with storyboard-ready image output.
- [x] 1.2 Update workflow request validation so the Step 1 request carries the source upload context needed by the runtime and does not depend on the client owning the full storyboard prompt.
- [x] 1.3 Extend the deterministic/dev runtime so workflow storyboard runs can complete with a direct image artifact and safe metadata for preview/access.

## 2. Workflow Step 1 UI

- [x] 2.1 Update `/workflow` Step 1 submission to start a workflow storyboard run, poll until terminal state, and fetch the generated storyboard artifact for display.
- [x] 2.2 Replace the Step 1 placeholder preview with the generated storyboard image and keep the result visible until the user re-uploads a new source image.
- [x] 2.3 Preserve the manual retry path by returning to Step 0, re-uploading, and starting a fresh storyboard generation from the new source image.

## 3. Skill-Like Workflow Video Capability

- [x] 3.1 Add a `workflow-video-mvp` Agent Capability config shape with code, description, input schema, prompt template, model binding, defaults, and enabled status.
- [x] 3.2 Add admin read/save repository support that validates the fixed MVP material schema, non-empty final video prompt template, `doubao-seedance-2-0` model binding, duration default, and resolution default.
- [x] 3.3 Add an Agent Capability admin editor/summary for `workflow-video-mvp`, keeping required materials read-only and editable fields limited to operator description, prompt template, and defaults.

## 4. Workflow Video Runtime

- [x] 4.1 Add a final workflow video-stage request contract that submits material references and workflow intent, not a browser-assembled provider prompt.
- [x] 4.2 Validate Step 0 source image, Step 1 storyboard artifact, Step 2 scene background, and storyboard prompt/map snapshot before creating a provider task.
- [x] 4.3 Render the final video prompt from `workflow-video-mvp` capability config and snapshot the effective config into the created run.
- [x] 4.4 Route the final video task through the existing video task polling runtime bound to `doubao-seedance-2-0`, extending ordered material URL support only as needed.

## 5. Workflow Final Video UI

- [x] 5.1 Update `/workflow` to keep final video generation blocked until the three required material groups are present.
- [x] 5.2 Add the scene background selection/upload handoff required by the final video request.
- [x] 5.3 Render final video running, succeeded, failed, and artifact states from the server run.

## 6. Tests And Verification

- [x] 6.1 Add or update focused tests for the workflow storyboard runtime, including the new prompt template, terminal polling, and artifact generation path.
- [x] 6.2 Add or update focused tests for Step 1 reset/retry behavior and the restored storyboard display state after re-upload.
- [x] 6.3 Add repository, route, and UI-helper tests for `workflow-video-mvp` admin capability configuration.
- [x] 6.4 Add runtime and adapter tests for workflow video material validation, prompt rendering, `doubao-seedance-2-0` binding, and ordered material URL handoff.
- [x] 6.5 Run targeted workflow, runtime, admin capability, video adapter, type/lint, and browser verification commands and record blockers.
