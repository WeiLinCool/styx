## 1. Workflow Storyboard Runtime

- [ ] 1.1 Add a server-owned storyboard prompt template and a dedicated workflow orchestration path that turns the Step 1 request into a terminal agent run with storyboard-ready image output.
- [ ] 1.2 Update workflow request validation so the Step 1 request carries the source upload context needed by the runtime and does not depend on the client owning the full storyboard prompt.
- [ ] 1.3 Extend the deterministic/dev runtime so workflow storyboard runs can complete with a direct image artifact and safe metadata for preview/access.

## 2. Workflow Step 1 UI

- [ ] 2.1 Update `/workflow` Step 1 submission to start a workflow storyboard run, poll until terminal state, and fetch the generated storyboard artifact for display.
- [ ] 2.2 Replace the Step 1 placeholder preview with the generated storyboard image and keep the result visible until the user re-uploads a new source image.
- [ ] 2.3 Preserve the manual retry path by returning to Step 0, re-uploading, and starting a fresh storyboard generation from the new source image.

## 3. Tests And Verification

- [ ] 3.1 Add or update focused tests for the workflow storyboard runtime, including the new prompt template, terminal polling, and artifact generation path.
- [ ] 3.2 Add or update focused tests for Step 1 reset/retry behavior and the restored storyboard display state after re-upload.
- [ ] 3.3 Run the targeted workflow, runtime, and client verification commands and record any blockers that remain.
