# Managed AI Model Surface Closure Design

## Context

Current repository structure already contains the server-side model listing contracts for product AI surfaces:

- `/api/agent/chat-models`
- `/api/agent/image-models`
- `/api/agent/video-models`

The admin console is already able to configure provider and model records, including chat, image, and video capability flags. The remaining gap is on the product surfaces:

- `/chat`
- `/image-gen`
- `/video-gen`

These entry points are not yet uniformly driven by admin-configured model availability. At least `/video-gen` still reads static front-end catalog data. That leaves the user-visible surfaces out of sync with the real runtime authority and breaks the intended MVP closure.

## Goal

Make chat, image generation, and video generation read their selectable models from the existing admin-configured model APIs, and fail closed in the UI when no user-available models exist.

## Non-Goals

- No admin console schema or workflow expansion.
- No new persistent model configuration source.
- No change to model entitlement semantics.
- No new background refresh or polling system.
- No user-facing exposure of infrastructure error details.

## Industry Consensus -> Local Design

Industry consensus: model catalogs used by end users should be sourced from server-authoritative configuration and entitlement checks, not duplicated in front-end constants.

Transferable principle: capability availability must be resolved server-side, then rendered as a client state machine that prevents invalid submission when no usable option exists.

Local design: reuse the existing `/api/agent/*-models` routes as the sole product-side model source, remove static availability assumptions from AI entry pages, and converge all unavailable states to a maintenance UX.

## Existing Ownership

### Durable truth

Admin-configured provider/model records plus entitlement evaluation determine whether a model is user-available.

### Current read path

- Repository owner: `src/server/repositories/ai-models.ts`
- API boundary: `src/app/api/agent/chat-models/route.ts`, `src/app/api/agent/image-models/route.ts`, `src/app/api/agent/video-models/route.ts`

### Product surfaces to align

- `src/app/chat/page.tsx`
- `src/app/image-gen/page.tsx`
- `src/app/video-gen/page.tsx`

## Mutable State Table

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| Provider/model enablement and capability flags | Admin console + repository | Admin AI config routes | Database / seed fallback |
| User entitlement to a model | Server repository/domain evaluation | Server-side read only | Membership / entitlement records |
| Current page model list | Product page client state | Model list fetch / reload | `/api/agent/*-models` response |
| Current selected model | Product page client state | User selection / successful fetch reconciliation | Last successful model list |
| Maintenance or unavailable status | Product page client state | Empty or failed model fetch | Fetch result interpreted by UI |

## Invariants

1. Product pages must not offer a selectable model that is not present in the latest successful server model list.
2. When the server returns zero user-available models, the page must disable submission and show a maintenance message.
3. Front-end pages may browse without login, but authenticated model availability must only be fetched for logged-in users.

## UX Design

All three product surfaces should converge on the same behavior pattern.

### Unauthenticated

Do not request the protected model API. The page remains browseable, but the model area shows:

`登录后查看可用模型`

Submission continues to use the existing login gate.

### Loading

While fetching the model list after login, the page shows a loading placeholder in the model area and does not assume a default static selection.

### Ready

When the API returns one or more models:

- render the returned models as the only selectable options;
- preserve the current selection only if it still exists in the new list;
- otherwise switch to the default model if the contract exposes it, or the first returned model;
- allow submission only when a valid selected model exists.

### Maintenance / unavailable

When the API returns an empty list, show:

`功能不可用，正在维护`

Disable model selection and disable the primary submit action.

### Fetch failure

When the request fails, the UI should still show the same maintenance message:

`功能不可用，正在维护`

No transport or internal error detail is shown to end users. A retry affordance is still allowed.

### Reload affordance

Each page should provide an in-page `重新加载模型` action so that users can recover without a full page refresh after administrators enable models.

## Surface-Specific Notes

### Chat

- Replace static or assumed model options with `/api/agent/chat-models`.
- If no models are available, the send action must be disabled and the page stays in maintenance state until reload succeeds.

### Image generation

- Replace static image model availability with `/api/agent/image-models`.
- The page must only submit using a model id from the last successful fetch.
- If the image page supports multiple generation modes, its request should continue to use the appropriate existing route contract rather than inventing a new one.

### Video generation

- Replace static `videoModels` usage with `/api/agent/video-models`.
- If the selected model disappears after a reload, reconcile selection before the user can submit again.

## Architecture

Keep the server contracts as-is unless a small compatibility fix is required. Most of the change belongs to product page state management.

Preferred approach:

1. Fetch model lists client-side after login.
2. Represent model availability with a small shared state shape or helper if reuse is clear across the three pages.
3. Gate submit handlers with a final check that a selected model exists in the latest available model set.

This keeps durable truth on the server while avoiding an unnecessary server-component/client-component split for already interactive pages.

## Error Handling

- Empty successful responses and failed requests both converge to the same user-facing maintenance state.
- Internal fetch errors may be logged client-side for development, but must not surface technical details in product copy.
- Existing run creation handlers should defensively reject submission when the page has no valid selected model.

## Testing Strategy

Lowest meaningful layer first:

- Add focused client/page tests for model loading state transitions where existing coverage patterns allow it.
- Cover at least:
  - unauthenticated placeholder state;
  - successful fetch with selectable models;
  - empty list maintenance state;
  - failed fetch maintenance state;
  - reload action recovering from maintenance to ready;
  - stale selection reconciliation after reload.
- Run `pnpm validate`.
- If local runtime is available, verify `/chat`, `/image-gen`, and `/video-gen` in the browser for login, maintenance, and reload flows.

## Risks And Constraints

- These model list APIs require authenticated active accounts; client pages must avoid spamming protected requests while logged out.
- Any page that still assumes static model metadata may need lightweight display mapping updates once it receives repository DTOs.
- Reuse is desirable, but a forced abstraction across all three pages is not required if it obscures page-specific behavior.

## Local Design Summary

The repository already has the correct server-side authority for AI model availability. This change closes the product loop by making `/chat`, `/image-gen`, and `/video-gen` consume that authority directly, show a consistent login placeholder while unauthenticated, and enter a consistent maintenance state when no configured models are available to the current user.
