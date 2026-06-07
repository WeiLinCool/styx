# Workflow Video Model And Quick Actions Design

Status: Draft
Date: 2026-06-07

## Context

The `/workflow` page already provides the high-level stone-print workflow experience:

- upload a pattern;
- choose an image model;
- generate storyboard output;
- choose a scene;
- start the final "dream" step.

However, two product boundaries remain inconsistent with the rest of the WebUI:

1. The workflow page still uses static `workflowVideoModels` front-end data, while `/video-gen` already reads the server-authoritative `GET /api/agent/video-config` contract.
2. The right-side "快捷操作" links jump users away to `/chat` and `/image-gen`, which breaks workflow continuity and forces users to reconstruct context after they come back.

The requested change is intentionally narrower than a full workflow runtime rewrite. The goal is to close the UX gap on `/workflow` by making video model selection authoritative, making step navigation recoverable, and turning quick actions into inline assistive dialogs.

## Goal

Make `/workflow` behave like a recoverable guided editor:

- video model choice is sourced from the same server-side authority as `/video-gen`;
- forward and backward navigation preserves meaningful in-progress state;
- quick actions stay in-page, return candidate results, and only write back when the user explicitly applies them.

## Non-Goals

- No database or schema change.
- No new API route.
- No change to `/video-gen` behavior.
- No full embedded `/chat` or `/image-gen` application inside workflow dialogs.
- No change to the server-side workflow task contract beyond what the current page already submits.

## Reference Research

Reference: Adobe Express help center, generative image flows
- Promise: AI generation and variation tools run from within the active editor, then let the user decide whether to keep, replace, or continue editing the result.
- State owner: the current editor page owns the working design state.
- Authority owner: the editor tool owns generation and result application.
- Invariants:
  - generation happens without forcing users to abandon the current editing surface;
  - generated output is previewed before it replaces or augments existing work;
  - applying a generated result is an explicit user action.
- Transferable principle: assistive AI tools should be inline to the active editing flow and should return explicit candidate results instead of forcing navigation.
- Not directly copied because: this repository has a multi-step workflow page, not a full canvas editor.

Reference: Figma help center, image editing with AI inside a file
- Promise: users can invoke AI edits from the current file context and refine images with a prompt without leaving the file.
- State owner: the active file remains the main working context.
- Authority owner: the AI tool generates a candidate change, but the file continues to own the durable working state.
- Invariants:
  - AI actions stay attached to the current editing context;
  - users refine specific content, not a detached secondary page;
  - the host experience stays responsible for final adoption of the result.
- Transferable principle: contextual AI helpers should be subordinate to the main workflow and feed results back into that workflow.
- Not directly copied because: `/workflow` is form-and-step based rather than layer-and-canvas based.

Industry consensus: multi-step creation flows should preserve user-entered state during back/forward navigation, and should only invalidate downstream work when upstream inputs actually change.

Transferable principle: step navigation itself is non-destructive; upstream source changes are the destructive boundary.

Repository constraints:

- `/workflow` is already a fully client-driven page.
- Durable model authority already exists in `GET /api/agent/video-config`.
- Chat model authority already exists in `GET /api/agent/chat-models`.
- Request validation remains server-side in `POST /api/agent/runs`.
- Existing UI primitives already include `Dialog`.

Local design: keep `/workflow` client-driven, reuse the existing model/config APIs as the only authority, and turn quick actions into lightweight dialogs that return candidate values to the current page.

## Existing Ownership

### Durable truth

- Video model availability and user entitlement are owned by the server-side video config/model repositories surfaced through `/api/agent/video-config`.
- Chat model availability is owned by the existing chat model list contract.
- Workflow step progress, selected assets, prompt text, and dialog draft state are client-only workflow page state.

### Current read path

- `src/app/workflow/page.tsx`
- `src/features/public/agent-runtime-client.ts`
- `src/app/api/agent/video-config/route.ts`
- `src/app/api/agent/runs/route.ts`

### Current inconsistency

- `/video-gen` already resolves models through server authority.
- `/workflow` still renders static `workflowVideoModels`.
- Quick actions are navigational links instead of contextual tools.

## Mutable State Table

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| Current user's workflow video config | Server API | Read-only fetch | `GET /api/agent/video-config` |
| Current user's available chat models | Server API | Read-only fetch | `GET /api/agent/chat-models` |
| Selected workflow video model | Workflow page client state | Model fetch reconciliation + user selection | Last successful video config |
| Current workflow step | Workflow page client state | Step navigation buttons and workflow actions | Client only |
| Uploaded pattern image | Workflow page client state | Local upload | Client only |
| Storyboard completion state | Workflow page client state | Workflow actions and upstream resets | Client only |
| Selected scene / custom scene / AI scene | Workflow page client state | Scene actions and helper dialog apply | Client only |
| Prompt text | Workflow page client state | Text area + prompt helper apply | Client only |
| Quick action dialog draft result | Dialog-local client state | Dialog actions | Dialog only until apply |

## Invariants

1. `/workflow` must not offer or submit a video model that is absent from the latest successful `video-config` response.
2. Back and forward navigation must preserve current workflow state; only upstream source changes may invalidate downstream results.
3. Quick action dialogs must not overwrite workflow state unless the user explicitly clicks an apply action.
4. If video generation is disabled, loading, or has zero available models, the final dream submission must fail closed in the UI.

## UX Design

### Video Model Authority

`/workflow` should load `getVideoGenerationConfig()` after login and activation checks, following the same authority model already used on `/video-gen`.

The workflow page should:

- stop using `workflowVideoModels` as the data source for real availability;
- keep only a thin presentation mapping for logo, color, and badge decoration;
- reconcile the selected video model exactly like other AI surfaces:
  - preserve the current selection if it still exists;
  - otherwise fall back to the server default model;
  - otherwise fall back to the first available model;
  - otherwise leave the selection empty and disable dream submission.

### Video Model UI States

The right-side video model block should support four explicit states:

#### Unauthenticated

Show a passive placeholder message in the model block:

`登录后查看可用视频模型`

The dream action remains login-gated as it is today.

#### Loading

After login, while the config request is pending, show a non-interactive loading placeholder and prevent submission.

#### Disabled / upgrade required

If the API returns `enabled: false`, show the returned message or an equivalent member/maintenance message. The model block remains non-interactive and the dream action remains disabled.

#### Ready

Render only the models returned by `video-config`. If the current selection becomes stale after reload, reconcile it before allowing another submit.

### Step Navigation

The page should add explicit previous-step controls for the workflow stages after upload.

Navigation rules:

- moving backward or forward does not itself clear data;
- changing upstream inputs does clear downstream derived state.

Destructive reset rules:

- Re-uploading the pattern image resets storyboard completion, scene choice, dream state, and returns to step 0.
- Changing the image model resets storyboard completion, scene choice, dream state, and returns to step 0.
- Replacing the current scene source resets only downstream dream state; if the page is already on step 3, return to step 2.
- Editing the prompt does not erase completed storyboard or scene state; it only affects future AI actions.
- Changing the video model affects only the final dream stage and does not invalidate storyboard or scene choices.

This preserves progress while still preventing obviously stale downstream outcomes.

### Quick Actions Become Inline Dialogs

The quick actions block should stop navigating to other pages and instead open lightweight dialogs.

The dialogs are assistive, not primary workflows. They return candidate results to the page and require explicit user application.

## Dialog Design

### Prompt Optimization Dialog

Purpose: help users improve the current workflow prompt without leaving `/workflow`.

Behavior:

- Opening the dialog seeds it with the current prompt value.
- The dialog uses the existing chat runtime path with the current user's available chat models.
- The dialog auto-selects the default or first available chat model through `listChatModels()` plus `selectChatModelId()`.
- The dialog exposes a single AI action: generate an improved workflow prompt.
- The generated result stays inside the dialog until the user clicks `应用到当前工作流`.
- Closing the dialog without applying leaves the page prompt unchanged.

Scope intentionally excluded:

- no conversation history UI;
- no full chat sidebar;
- no multi-turn assistant thread inside the workflow page.

### Reference Image Dialog

Purpose: generate a candidate reference image and optionally apply it as the current workflow scene.

Behavior:

- The dialog is only useful once the user has reached the scene/dream part of the flow.
- On step 0 or 1, the trigger remains visible but disabled with a short explanation such as `完成分镜后可生成参考图`.
- Inside the dialog, the user generates a candidate image and previews the result.
- Applying the result writes it to `customSceneUrl`.
- Applying the result also clears preset-scene selection and AI-scene flags so the page has one unambiguous scene source.
- If the user is currently on step 3, applying the generated reference image returns the page to step 2 so the user can confirm the new scene before starting dream generation again.

### Dialog Interaction Principle

Both dialogs follow the same rule:

- generate candidate output inside the dialog;
- preview it there;
- only mutate main workflow state on explicit apply.

This keeps the workflow page as the primary owner of user-visible progress.

## Architecture

### Page State

Keep the implementation in `/workflow` client-side and reuse existing model availability helpers where practical:

- `buildUnavailableModelMessage`
- `createInitialModelAvailabilityState`
- `nextReloadKey`
- `reconcileSelectedModelId`
- `selectChatModelId`

The page should maintain a dedicated video-model availability state instead of assuming static defaults.

### Presentation Mapping

Because `VideoModelOption` from the API does not carry the current decorative UI metadata, add a lightweight client-side mapping helper:

- input: server-returned `VideoModelOption`
- output: display-only properties such as emoji/logo, chip style, or accent color

This mapping must never drive capability logic, entitlement logic, or submit gating.

### Runtime Calls

No new backend contract is needed.

Reuse:

- `getVideoGenerationConfig()` for workflow video model authority;
- `listChatModels()` and `selectChatModelId()` for prompt helper dialog model resolution;
- `createAgentRun()` for existing workflow and helper AI actions.

### Thin Route Files, Existing Server Authority

No route contract should be moved into the page. The page only renders and orchestrates local state. Server-side model validation and run submission remain where they are today.

## Error Handling

- Video config fetch failure: show a maintenance-style unavailable message in the workflow video model block, offer an in-page reload action, and prevent dream submission.
- Video config disabled: show the returned message or member-upgrade copy, keep selection non-interactive, and fail closed on submit.
- No available chat model for prompt optimization: disable the generate action inside the dialog and show a short unavailable message.
- Prompt optimization failure: show the error only inside the dialog; do not erase the existing workflow prompt.
- Reference image generation failure: show the error only inside the dialog; do not overwrite the current scene state.
- Closing or cancelling a dialog: leave the main workflow untouched.
- Stale selected video model after config refresh: reconcile automatically before the user can submit again.

## Verification

Lowest meaningful checks:

- Focused UI/client tests for `/workflow` state transitions:
  - video config ready state selects the server default model;
  - disabled or empty video config blocks dream submission;
  - back/forward navigation preserves state;
  - upstream changes invalidate only the intended downstream state;
  - prompt helper dialog only applies changes on explicit confirmation;
  - reference image dialog applies generated output to `customSceneUrl` and returns step 3 users to step 2.
- Existing client helper tests may be extended where reuse makes sense, especially around selection fallback behavior.
- `pnpm validate`
- `pnpm build`
- Browser verification on `/workflow` for:
  - loading, disabled, and ready video model states;
  - previous-step and next-step behavior;
  - prompt helper dialog open/close/apply;
  - reference image dialog open/close/apply.

## Risks And Constraints

- `/workflow` is already a large client page; the dialog logic should be extracted into focused local components or helpers rather than further inflating one render path.
- The workflow page currently uses placeholder local imagery for several stages; this design improves interaction quality without claiming a full real-media workflow.
- If local auth or API state is unavailable during browser checks, the verification note must record the exact blocker instead of implying full end-to-end coverage.

## Open Decisions Resolved

- The workflow page should use `GET /api/agent/video-config`, not `GET /api/agent/video-models`, so model availability and disabled/member states come from the same authority as `/video-gen`.
- "交互做好" includes loading, disabled, stale-selection reconciliation, and submit gating for the video model block.
- Forward and backward navigation should preserve state; only upstream content changes reset downstream derived state.
- Quick actions should use lightweight dialogs, not full embedded `/chat` or `/image-gen` pages.
- Prompt optimization should return an explicit candidate prompt that the user may apply to the workflow.
- Generated reference images should apply to the current scene slot, not replace the original uploaded pattern.
