# Workflow Video Parameter Selection Design

## Summary

Add explicit duration and resolution selection to the user-facing AI video workflow "开始造梦" step. The selectable values come from the current membership plan's video generation policy. Video model availability remains controlled by AI model configuration, not by membership plan binding.

## Problem

The workflow page currently submits video generation with `videoConfig.defaults.durationSeconds` and `videoConfig.defaults.resolution` directly, without letting the user choose. This leaves existing membership configuration only partially exposed to the user and makes the "开始造梦" step inconsistent with the configured entitlement boundary.

## Goals

- Let users choose video duration before starting workflow generation.
- Let users choose video resolution before starting workflow generation.
- Keep video model availability controlled by the existing AI model configuration pipeline.
- Use membership policy defaults as the initial selected values.
- Enforce the same duration and resolution limits on the server side.

## Non-Goals

- Do not add membership-plan model binding.
- Do not redesign the normal `/video-gen` page in this change.
- Do not change the current membership configuration data shape beyond existing duration and resolution fields.

## Current Structure

- Workflow UI lives in `src/app/workflow/page.tsx`.
- User video config is resolved by `src/app/api/agent/video-config/route.ts`.
- Membership video policy resolution and selection validation live in `src/server/video/video-generation-policy.ts`.
- Admin membership policy editing already supports allowed durations, allowed resolutions, and defaults in `src/features/admin/admin-membership-config-module.tsx`.

## Design Decisions

### 1. Source of Truth

- Membership plan video policy remains the durable source of truth for allowed durations, allowed resolutions, and default values.
- `/api/agent/video-config` remains the runtime API consumed by the workflow UI.
- AI model availability continues to come from the AI model entitlement/configuration path.

### 2. Workflow UI Behavior

At the "开始造梦" step, the workflow page will show:

- A duration selector populated from `videoConfig.durations`.
- A resolution selector populated from `videoConfig.resolutions`.
- The existing model selection UI populated from `videoConfig.models`.

Initialization rules:

- Default the selected duration to `videoConfig.defaults.durationSeconds`.
- Default the selected resolution to `videoConfig.defaults.resolution`.
- If the current local selection becomes invalid after a config refresh, reset it to the current default.

Single-option behavior:

- If only one duration is allowed, still render the duration selector in a disabled/read-only state.
- If only one resolution is allowed, still render the resolution selector in a disabled/read-only state.

Disabled-state purpose:

- Users should be able to see which parameters are currently enforced by their membership rights, even when there is no real choice.

### 3. Submission Behavior

When the user clicks "开始造梦", the workflow run payload must use:

- `durationSeconds: selectedDurationSeconds`
- `resolution: selectedResolution`

The page must stop using hardcoded fallbacks such as `5` and `720p` when a valid runtime config is available.

### 4. Server Validation

Before a workflow video run is accepted, the server must validate:

- selected style is allowed
- selected duration is allowed
- selected resolution is allowed

Validation should reuse the existing `validateVideoGenerationSelection` logic so the client and server enforce the same policy semantics.

If validation fails, the request must be rejected with a user-facing error that clearly explains the permission boundary, for example that the current membership plan does not support the selected resolution.

## State Ownership

### Durable state

- Membership video policy per plan/version:
  - `enabled`
  - `allowedDurations`
  - `allowedResolutions`
  - `defaultDuration`
  - `defaultResolution`

Owner:
- Membership plan version configuration and repository layer

### Runtime derived state

- `videoConfig` returned by `/api/agent/video-config`

Owner:
- API route backed by current entitlements, plan version resolution, policy resolution, and model availability lookup

### Local UI state

- `selectedDurationSeconds`
- `selectedResolution`
- `selectedVideoModel`

Owner:
- Workflow page component

Write entry:
- User interaction before run submission

## Invariants

1. Submitted duration must be one of the durations allowed by the current membership video policy.
2. Submitted resolution must be one of the resolutions allowed by the current membership video policy.
3. When video generation is enabled, initial workflow selection must come from resolved policy defaults rather than page-local constants.

## Boundary Plan

- UI: render selectors, maintain local selections, submit chosen values.
- API route `/api/agent/video-config`: continue to provide resolved user-facing options and defaults.
- Server/domain: validate submitted workflow video selection against resolved membership policy.
- Repository/config: no new schema required for this change.

## Error Handling

- If video config is still loading, keep the current "请稍后再试" behavior.
- If no video model is available, keep the existing model-unavailable error path.
- If membership policy disables video generation, keep the existing unavailable/upgrade-required flow.
- If submitted duration or resolution is invalid, reject on the server and surface a clear runtime error in the workflow UI.

## Verification Strategy

Lowest meaningful layers:

- Targeted UI tests for workflow selection initialization and disabled single-option rendering.
- Targeted server tests for workflow selection validation.
- Validation/build baseline with `pnpm validate`.
- Browser verification of the workflow page after implementation because the change is user-visible and interaction-sensitive.

## Risks

- Local UI state can drift from refreshed config if selection reset rules are incomplete.
- Workflow submission may still bypass validation if the server-side run creation path is not updated at the correct boundary.
- Copy must distinguish model unavailability from membership-policy restriction to avoid misleading users.

## Recommended Implementation Shape

1. Extend workflow page state with selected duration and resolution.
2. Render duration and resolution controls in the "开始造梦" area.
3. Initialize and reconcile those selections from `videoConfig.defaults`.
4. Submit selected values instead of default constants.
5. Add server-side validation in the workflow video run creation path by reusing `validateVideoGenerationSelection`.
6. Add targeted tests for both UI behavior and server validation.
