# Admin Configured Workflow Backgrounds Design

Status: Approved
Date: 2026-06-09

## Context

The workflow video MVP currently requires a scene background material. The public `/workflow` page still exposes user-owned scene options, including custom upload and AI-generated scene placeholders. The new product requirement is stricter: workflow video background images must come from the official background set under `docs/官网背景`, and administrators configure which backgrounds are available. Public users must not upload custom scene backgrounds for this workflow.

This is a cross-boundary change: admin capability configuration owns the available background set, the public workflow UI renders only enabled admin-configured choices, and the agent runtime must reject arbitrary client-supplied scene material references.

## Design

### Background Catalog

The official background images are treated as built-in product assets. During implementation, they are copied from `docs/官网背景` into a public static asset directory such as `public/workflow-backgrounds/`. The source `docs/官网背景` directory remains an input/source reference; runtime code uses only the public asset URLs.

Each configured background has:

- `id`: stable string identifier.
- `name`: display name editable by admins.
- `styleName`: category/style label derived from the source folder by default.
- `publicUrl`: public static URL under `/workflow-backgrounds/...`.
- `enabled`: whether public users can select it.
- `sortOrder`: admin-controlled display ordering.

### Admin Configuration

`workflow-video-mvp` capability config gains `sceneBackgrounds`. The admin workflow video config editor adds a compact background section where admins can enable/disable backgrounds, adjust display names, and set sort order. The MVP does not support uploading or deleting backgrounds from the admin UI; adding/removing official backgrounds remains a code/assets operation.

The existing editable fields remain:

- operator description;
- final video prompt template;
- default duration;
- default resolution.

The fixed material schema still requires `source_image`, `storyboard_image`, and `scene_background`, but `scene_background` now means one selected configured official background.

### Public Workflow UI

Step 2 on `/workflow` removes custom upload and AI-generated scene modes. It renders only enabled configured backgrounds from `workflow-video-mvp`. Users select one official background card. The final video button remains blocked until:

- a local source image can be uploaded/saved;
- the Step 1 storyboard artifact can be saved;
- an enabled configured background has been selected.

The client sends `sceneBackgroundId`, not `sceneBackgroundAssetId`, for final workflow video creation.

### Runtime Enforcement

The API boundary accepts `sceneBackgroundId` for `input.stage === "workflow_video"` and rejects client-submitted custom background asset IDs for this flow. The server runtime resolves the selected background from the capability config, ensures it is enabled, builds an absolute URL for the provider, and sends ordered materials to `doubao-seedance-2-0` as:

1. saved source image URL;
2. saved storyboard image URL;
3. official configured background URL.

If the background ID is missing, disabled, or unknown, the runtime fails before provider task creation.

## State Ownership

- Background catalog source: repository static assets copied from `docs/官网背景`.
- Background availability/order/name truth: `workflow-video-mvp` capability config.
- User selected background: transient UI state and request input.
- Provider material URL: derived server-side from capability config and request host/origin.

## Invariants

1. Public workflow users cannot submit arbitrary scene background files or URLs for final workflow video generation.
2. Runtime only uses enabled `workflow-video-mvp.sceneBackgrounds` entries for the third video material.
3. Existing source-image and storyboard material validation remains server-owned and still uses saved media asset references.

## Verification

Focused tests should cover:

- default workflow video capability config includes official backgrounds;
- admin route accepts and saves background enable/order/name edits;
- API route accepts `sceneBackgroundId` and rejects missing/invalid workflow video background input;
- runtime resolves configured background URLs and rejects unknown/disabled IDs;
- `/workflow` material readiness requires a selected configured background, not a custom uploaded scene file.

Full verification should include targeted tests, `pnpm validate`, `pnpm build`, and a browser smoke check of `/workflow` Step 2 plus the admin capability editor when local auth state allows it.
