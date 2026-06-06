## Why

Image and video generation are long-running asynchronous tasks, but the current user experience treats the latest result as page-local state. Users can lose result context after navigation or refresh, and generated media remains dependent on provider output URLs until the user explicitly saves it.

This change makes multimodal generation behave like AI chat history: submitted tasks become recoverable records, completed outputs are temporarily cached by the server, and users can return later to inspect or explicitly save results.

## What Changes

- Add multimodal run history behavior for image and video generation so users can see their own prompt/result records and continue adjusting from prior outputs.
- Change image/video submission UX to return quickly after creating a run and tell the user the task is running in the background and can be checked later.
- Add a temporary generated-media cache for AI response media. Cached results are recoverable from run history but are not formal user media assets and do not count as saved media.
- Change "存储媒体" behavior to promote an existing cached generated result into the user's formal media library and update artifact save metadata.
- Extend existing run/detail APIs and client parsing as needed so media artifacts can be rendered from stored cache references, not only from immediate SSE/transient browser state.
- Preserve explicit-save semantics: no generated image/video is added to the user's formal media library unless the user chooses to save it.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `user-agent-runtime`: Extend run history, media artifact durability, and save semantics for image/video runs.
- `public-product-experience`: Extend public image/video generation UX with background-running feedback, recoverable multimodal history, and explicit save affordances.

## Impact

- Affected routes and UI: `src/app/image-gen`, `src/app/video-gen`, `src/app/api/agent/runs`, `src/app/api/user/media-assets`.
- Affected server domains: `src/server/agent`, `src/server/media`, `src/server/repositories`, `src/server/db`.
- Affected persistence: likely additive Drizzle schema or repository fields for temporary cached media references and lifecycle metadata.
- Affected storage: Tencent COS or equivalent SSO/cloud storage path may be used for temporary cache objects before formal media promotion.
- Affected verification: repository/domain tests for artifact cache state, route tests for validation and history visibility, and browser verification for image/video generation history states.
