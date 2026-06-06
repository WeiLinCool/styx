## 1. Data Model And Repository Contracts

- [ ] 1.1 Define temporary generated-media cache metadata shape and artifact save/cache state values.
- [ ] 1.2 Add additive schema/migration changes if existing `agent_artifacts.metadata` is insufficient for indexed lifecycle queries.
- [ ] 1.3 Extend agent run repository list/detail methods so image and video runs can be listed by task type and loaded with artifact cache/save metadata.
- [ ] 1.4 Add repository tests for user-owned image/video history, run ownership isolation, and cache/save metadata preservation.

## 2. Temporary Media Cache Service

- [ ] 2.1 Add a server media cache service that stores generated image/video outputs in temporary object storage and returns safe cache metadata.
- [ ] 2.2 Support caching from provider URL and data URL without persisting large media payloads in the database.
- [ ] 2.3 Add preview/access helper that returns short-lived access only after run ownership is verified.
- [ ] 2.4 Add tests for cache success, unsupported media, expired/unavailable cache, and ownership-checked access.

## 3. Agent Runtime Integration

- [ ] 3.1 Update image orchestration so provider outputs are cached before run artifacts are presented as recoverably completed.
- [ ] 3.2 Update video sync/completion so provider outputs are cached before completed run detail depends on them.
- [ ] 3.3 Ensure stream events can still render immediate results while persisted artifacts point to cached/saved media.
- [ ] 3.4 Add service tests for provider output -> cache -> artifact metadata for image and video paths.
- [ ] 3.5 Document or handle stale running recovery behavior for process-local image orchestration and provider-backed video sync.

## 4. Explicit Save Promotion

- [ ] 4.1 Update generated-media save service to promote cached artifacts to formal media assets before falling back to provider source URLs.
- [ ] 4.2 Preserve idempotency for repeated saves of the same `(runId, artifactId)`.
- [ ] 4.3 Update artifact metadata for saving, saved, save failed, cache expired, and saved asset id states.
- [ ] 4.4 Add tests for save from cache, duplicate save, quota failure, expired cache, and cross-user rejection.

## 5. API And Client Contracts

- [ ] 5.1 Add or extend API routes for task-type-filtered run history and run-detail media access.
- [ ] 5.2 Extend client DTO parsing for cached/saved direct media results and save/cache state.
- [ ] 5.3 Ensure route handlers validate input and ownership before domain calls.
- [ ] 5.4 Add route tests for history filtering, run detail ownership, media access, and save validation.

## 6. Image And Video Page UX

- [ ] 6.1 Add history list/detail UI to `/image-gen` for recent image runs across generate, HD repair, and style transfer.
- [ ] 6.2 Add history list/detail UI to `/video-gen` for recent video runs.
- [ ] 6.3 Change submission copy to "后台运行中，可稍后回来查看结果" and avoid requiring users to keep the page open.
- [ ] 6.4 Render running, succeeded cached, succeeded saved, failed, expired, saving, and save-failed states.
- [ ] 6.5 Let users reuse prior prompt/options for a new task without mutating the prior run.

## 7. Verification

- [ ] 7.1 Run focused tests for repositories, media cache, run service, routes, and save promotion.
- [ ] 7.2 Run `pnpm validate`.
- [ ] 7.3 If schema changes are made, run `pnpm db:generate` and inspect the generated migration.
- [ ] 7.4 Run `pnpm build`.
- [ ] 7.5 Browser-verify `/image-gen` and `/video-gen` history, background-running notice, completed cached result, save action, and expired/failure states when local auth/database setup is available.
