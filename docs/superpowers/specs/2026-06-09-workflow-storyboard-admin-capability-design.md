# Workflow Storyboard Admin Capability Design

Status: Draft
Date: 2026-06-09

## Context

The `/workflow` page currently treats storyboard generation as a mostly code-owned feature:

- the storyboard prompt is assembled in `src/server/agent/workflow-storyboard.ts`;
- the canonical layout is hard-coded in server constants;
- the fixed 12-grid base image exists only as a product assumption, not as admin-managed configuration;
- any storyboard template change currently pushes work back into front-end or server implementation.

This is now a product problem, not just an image prompt problem. The business need is to let operators change the storyboard template image and the full storyboard system prompt from the admin console without editing front-end code or redeploying for every template update.

The requested first phase is intentionally narrow:

- storyboard only;
- one active template only;
- admin uploads the template image directly inside Agent Capability configuration;
- admin edits the full prompt as freeform text;
- if configuration is incomplete, storyboard generation must fail closed.

## Goal

Turn workflow storyboard generation into a server-authoritative admin configuration surface by extending the existing Agent Capability system so that:

- a single active storyboard template image is managed from the admin console;
- a single active full storyboard prompt is managed from the admin console;
- runtime storyboard generation reads this configuration instead of hard-coded template defaults;
- missing or invalid storyboard configuration blocks generation with a clear admin-facing remediation message.

## Non-Goals

- No multi-template switching in phase one.
- No template version history, drafts, or rollback UI.
- No automatic template selection by model, scene, or user segment.
- No admin configuration for scene generation, reference image generation, or final video prompts in this phase.
- No provider-parity guarantee across every image provider for template-backed storyboard generation.
- No replacement of the broader Agent Capability bundle system.

## Reference Research

Reference: Vercel Project Settings and Environment Variables
- Source: [Project settings](https://vercel.com/docs/projects/project-configuration/project-settings), [Managing environment variables](https://vercel.com/docs/projects/environment-variables/managing-environment-variables)
- Observed pattern: project-scoped operational settings live in one dashboard-owned surface, are edited in place, and apply to future executions without source-code edits.
- Transferable principle: product operators should change runtime configuration in an admin settings surface, not by editing app code.
- Local implication: storyboard template image and prompt belong in admin-managed capability configuration, not in front-end constants.

Reference: Stripe Dashboard basics / branding settings
- Source: [Web Dashboard basics](https://docs.stripe.com/dashboard/basics)
- Observed pattern: a single active asset-backed configuration surface can own logo, icon, and brand settings directly inside the dashboard.
- Transferable principle: when a product has one authoritative active visual configuration, the dashboard should expose direct upload plus immediate current-state visibility.
- Local implication: storyboard template configuration should expose one active uploaded template image with prompt text, preview, and summary state, not a file-picker maze or code fallback.

Industry consensus:
- operational templates should be editable from dashboard settings;
- current active configuration should be obvious;
- incomplete settings should fail closed for dependent runtime actions;
- direct upload plus in-context preview is preferable to requiring code changes or hidden fallback behavior.

Repository constraints:

- the repository already has an Agent Capability admin surface and bundle-resolution path;
- `agentCapabilities.config` already exists as JSON storage and can hold structured config without a schema migration;
- storyboard image generation currently bypasses workflow capability configuration and uses hard-coded prompt/layout constants;
- the current user media upload flow is membership-gated and user-owned, so it is not the right ownership boundary for admin storyboard template configuration;
- the repository already has Tencent COS upload and signed-read primitives that can be reused for admin-owned template objects.

Local design:
- keep storyboard configuration inside the existing Agent Capability system;
- add a workflow-specific editable capability record;
- store prompt and template asset descriptor in capability config;
- upload the template binary through an admin-only route backed by COS;
- remove runtime dependence on hard-coded storyboard template defaults.

## Existing Ownership

### Current durable truth

- Workflow default capability bundles are owned by `src/server/repositories/agent-capabilities.ts`.
- Generic workflow runtime requests can read a capability snapshot through `resolveDefaultAgentCapabilityBundle(...)`.
- Storyboard image generation in `createAndRunWorkflowStoryboardImageAgentRun(...)` does **not** currently read workflow capability config and instead builds its prompt directly from code-owned storyboard helpers.

### Current read path

- `src/app/admin/(console)/agent-capabilities/page.tsx`
- `src/server/repositories/agent-capabilities.ts`
- `src/server/agent/capability-resolution.ts`
- `src/server/agent/run-service.ts`
- `src/server/agent/workflow-storyboard.ts`
- `src/server/ai/image-provider-adapters.ts`

### Current inconsistency

- The repository already has an admin-managed capability system, but storyboard template behavior is still hard-coded.
- Workflow storyboard image execution is split from generic workflow capability resolution, so the one workflow stage that most needs admin configuration currently ignores the bundle system.

## Mutable State Table

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| Storyboard capability record | Admin capability repository | Admin config save route | `agent_capabilities` row |
| Storyboard prompt text | Storyboard capability config | Admin config save route | `agent_capabilities.config.promptText` |
| Storyboard template asset descriptor | Storyboard capability config | Admin template upload/save route | `agent_capabilities.config.templateAsset` |
| Storyboard layout metadata | Storyboard capability config | Server-owned config normalization on save | `agent_capabilities.config.layout` |
| Template binary in COS | Admin upload service | Admin template upload/save route | COS object referenced by config |
| Workflow selected image model | Workflow request input | User request | request payload |
| Workflow uploaded pattern image | Workflow request input | User request | request payload |
| Runtime storyboard prompt sent to provider | Storyboard runtime service | Server prompt renderer | derived at run time from config + request context |

## Invariants

1. Storyboard generation must not run unless a single enabled storyboard capability exists and contains both a non-empty prompt and a readable template asset descriptor.
2. The storyboard template image and prompt must be server-authoritative admin configuration; there is no code fallback once this phase lands.
3. Admin template upload must be direct and single-active: each save leaves exactly one current template descriptor in capability config.
4. Storyboard runtime must use the configured template dimensions as its canonical output basis instead of legacy hard-coded layout constants.
5. If the selected provider cannot support the configured template-backed execution path, storyboard generation must fail with an explicit capability/provider message instead of silently degrading to the old text-only path.

## Capability Design

Phase one will extend the existing Agent Capability system rather than introducing a separate storyboard configuration subsystem.

The workflow default bundle will include one dedicated capability record for storyboard configuration. To avoid widening the capability enum in phase one, this record will reuse an existing capability kind, with a workflow-specific code such as:

- kind: `skill`
- code: `workflow-storyboard-template`

The important contract is the `code`, not the reused kind label.

The capability `config` becomes the only runtime-owned storyboard configuration payload:

```json
{
  "mode": "workflow_storyboard_template_v1",
  "promptText": "full storyboard prompt with placeholders",
  "templateAsset": {
    "storageProvider": "tencent_cos",
    "bucket": "bucket-name",
    "region": "ap-shanghai",
    "objectKey": "admin-config/development/agent-capabilities/<capabilityId>/storyboard-template/<uploadId>.png",
    "mimeType": "image/png",
    "byteSize": 123456,
    "width": 1086,
    "height": 1448,
    "originalFilename": "storyboard-template.png",
    "uploadedAt": "2026-06-09T12:00:00.000Z"
  },
  "layout": {
    "width": 1086,
    "height": 1448,
    "columns": 4,
    "rows": 3
  },
  "updatedAt": "2026-06-09T12:00:00.000Z",
  "updatedByUserId": "admin-user-id"
}
```

### Layout metadata

Phase one will treat storyboard layout shape as server-owned policy:

- width and height are read from the uploaded image;
- columns and rows are stored as the phase-one supported storyboard shape for this template family: `4 x 3`.

This keeps the admin surface simple and matches the approved requirement that layout metadata be visible but not manually edited. Future multi-template work can generalize layout semantics if needed.

## Admin UX Design

The existing Agent Capability admin page remains the primary surface:

- `src/app/admin/(console)/agent-capabilities/page.tsx`

The list should add an `编辑配置` action for the storyboard capability row. This action opens an editor dialog or drawer instead of sending the user to a different module.

### Editor fields

- Template image upload
- Full storyboard prompt text area
- Current template preview
- Read-only template metadata:
  - image width
  - image height
  - columns
  - rows
  - last updated time

### UX rules

- There is only one active template image at a time.
- Uploading a new template replaces the current template after a successful save.
- Prompt text is freeform full-text editing, not segmented field editing.
- The save action validates the full configuration as one unit.
- Empty prompt cannot be saved as valid storyboard config.
- Missing template cannot be saved as valid storyboard config.

### List-page summary

The capability row summary should make current state obvious:

- prompt configured / missing
- template configured / missing
- template dimensions
- layout `4 x 3`
- last updated timestamp

This keeps operators from opening the editor just to answer “is storyboard currently configured?”

## API And Boundary Design

### Repository boundary

- Reuse `agent-capabilities` as the durable owner.
- Add targeted repository methods for reading and updating storyboard capability config instead of letting route code patch raw JSON ad hoc.

### Admin routes

Phase one should add admin-only routes dedicated to storyboard capability editing:

- `GET /api/admin/agent-capabilities/[capabilityId]/storyboard-config`
  - returns current prompt, template descriptor, layout, and a signed preview URL if a template exists.
- `PUT /api/admin/agent-capabilities/[capabilityId]/storyboard-config`
  - accepts `multipart/form-data`
  - fields:
    - `promptText`
    - optional `templateFile`
  - validates admin auth, image type, prompt presence, and normalized config
  - uploads a new template file when present
  - updates the capability config atomically from the server’s point of view

### Why multipart in one save route

This keeps the admin workflow simple:

- one editor;
- one save action;
- no temporary orphan upload state in the browser;
- prompt and image are validated together.

### Storage boundary

Do not route admin storyboard template upload through the user media upload API:

- it is membership-policy gated;
- it is user-owned rather than admin-configuration-owned;
- it creates the wrong product boundary.

Instead, create a dedicated admin upload service that reuses existing COS primitives:

- `createTencentCosClient().uploadObject(...)`
- `createTencentCosClient().createSignedReadUrl(...)`

The template descriptor lives in capability config, while the binary lives in COS.

### Object key strategy

Use versioned object keys, not a single overwritten file path:

- `admin-config/<env>/agent-capabilities/<capabilityId>/storyboard-template/<uploadId>.<ext>`

Versioned keys avoid stale-cache problems and let the server safely swap to a new template only after the new object is uploaded and validated.

### Cleanup rule

When a new template replaces an old one:

- upload the new object first;
- update capability config to reference the new object;
- delete the previous object after the config update succeeds.

If the config update fails, delete the newly uploaded object before returning the error.

## Runtime Design

### Storyboard capability resolution

`createAndRunWorkflowStoryboardImageAgentRun(...)` must stop behaving like a capability bypass.

Before resolving the selected image model or building the storyboard prompt, it should:

1. resolve the enabled default workflow capability bundle;
2. find the storyboard configuration capability by code;
3. validate that prompt and template asset are present and complete.

If any of these fail, storyboard generation should return a clear configuration error such as:

`工作流分镜模板未配置，请先在管理端 Agent 能力中上传模板图并填写提示词。`

### Prompt rendering

The configured `promptText` remains full freeform text, but the runtime should support a small placeholder vocabulary so operators can keep dynamic context in the prompt:

- `{{workflow_prompt}}`
- `{{source_image_origin}}`
- `{{selected_image_model_id}}`
- `{{template_width}}`
- `{{template_height}}`
- `{{template_columns}}`
- `{{template_rows}}`

Unknown placeholders should be left untouched rather than stripped. Missing known values should render as empty strings.

### Canonical size

Storyboard canonical dimensions must come from configured template metadata:

- width = `config.layout.width`
- height = `config.layout.height`

The legacy `821x1916 / 3 columns x 4 rows` constants should no longer define storyboard runtime behavior after this change.

### Provider request shape

The storyboard template-backed flow needs two input images:

1. admin-configured fixed storyboard template image
2. user-uploaded pattern source image

To support this cleanly, the image provider request contract should evolve from a single source image assumption to a multi-image edit-capable shape for storyboard runs. The preferred direction is:

- keep legacy single-image callers working;
- add ordered multi-image support for edit-capable providers.

For OpenAI image edit providers, the runtime should upload both images in order through the edit endpoint. The provider adapter should append multiple `image[]` entries to the multipart payload.

### Provider support policy

Phase one should fail closed for providers that cannot support the configured storyboard template execution path.

That means:

- OpenAI edit-compatible providers with multi-image support are first-class storyboard-template providers.
- Providers that only support one edit image or incompatible edit semantics should return a clear unsupported-provider error for storyboard template mode instead of silently degrading to text-only behavior.

This keeps storyboard output faithful to the admin-managed template requirement.

## Media And Validation Design

### Server-side upload validation

The admin upload service should validate:

- MIME type is `image/png`, `image/jpeg`, or `image/webp`
- file bytes are present
- file dimensions can be read server-side

The repository should not trust browser-provided dimensions. The implementation should use a server-side image metadata reader and record the measured width and height in config.

### Preview access

Admin preview should use a signed read URL created from the stored COS object key. The preview URL is read-only derived state and should not be persisted in the capability config JSON.

## Testing And Verification

### Unit and service tests

- capability config parser returns the storyboard config when capability code matches
- missing storyboard capability fails closed
- missing prompt fails closed
- missing template descriptor fails closed
- placeholder rendering injects known values correctly
- canonical storyboard dimensions resolve from capability config, not legacy constants

### Admin route tests

- `GET storyboard-config` returns current config and preview URL
- `PUT storyboard-config` rejects empty prompt
- `PUT storyboard-config` rejects missing template when no existing template is configured
- `PUT storyboard-config` accepts prompt-only updates when an existing template already exists
- replacing the template uploads the new object and updates config
- failed config update deletes the newly uploaded object

### Provider adapter tests

- OpenAI storyboard edit requests append two `image[]` files in order
- single-image edit callers still work unchanged
- unsupported providers return explicit storyboard-template incompatibility errors

### Workflow runtime tests

- storyboard image runs read workflow capability config before provider execution
- storyboard generation fails with admin-remediation copy when config is incomplete
- storyboard runs pass template-backed dimensions into runtime prompt/render flow

### Browser verification

- admin can open storyboard capability editor
- admin can upload the supplied template image and save prompt text
- admin sees preview and dimensions after save
- `/workflow` storyboard generation uses the newly configured template-backed path

## Local Design Summary

Phase one keeps the system narrow and operationally useful:

- extend the existing Agent Capability system rather than inventing a new storyboard settings subsystem;
- store one active storyboard prompt and one active template descriptor in capability config;
- upload the template file through an admin-only capability save flow backed by COS;
- make storyboard runtime read this capability config before building the provider request;
- fail closed when configuration or provider support is incomplete.

This solves the product problem the current implementation cannot solve well: changing storyboard template behavior becomes an admin operation instead of a front-end change.
