# Transient Image Generation Design

Date: 2026-05-31
Scope: user-facing `/image-gen` MVP
Classification: Large

## Goal

Complete the user-facing AI image generation loop for the `AI生图` tab:

1. User enters a prompt and generation options.
2. The server creates and runs an authenticated image generation request.
3. The page renders the returned image directly from the response.
4. The user downloads the image locally.

The generated media content is intentionally transient. The server may keep run, audit, model, billing, and summary records, but it must not store generated image binary data, base64 payloads, provider media URLs, or uploaded copies of the image.

`高清修复` and `图片换风格` are out of scope for this MVP because they require source-image upload handling and provider-specific multimodal input formats. They should remain available as existing UI affordances or be clearly unavailable until the upload path is designed.

## Existing Context

The repository already has:

- `src/app/image-gen/page.tsx`, which submits `taskType: 'image'` through `createAgentRun`.
- `src/app/api/agent/runs/route.ts`, which validates runtime requests and requires an active account.
- `src/server/agent/run-service.ts`, which creates `agent_runs`, resolves an image capability bundle, runs the runtime, and persists returned artifacts.
- `src/server/repositories/agent-runs.ts`, which persists `agent_runs` and `agent_artifacts`.
- `agent_artifacts.body` and `agent_artifacts.url`, which can currently store text or URL payloads.

The existing historical design treated `agent_artifacts` as the unified persisted output container. This change narrows that contract for media outputs: durable records may describe a generated artifact, but generated media content itself is not durable.

## Reference Research

Industry consensus: mature image-generation products make download/save a primary action and usually provide cloud history or project libraries.

Transferable principle: users expect generated media to be recoverable unless the UI states otherwise. If the product chooses not to save media server-side, the result surface must make local saving obvious and must explain the loss condition before the user leaves the page.

Repository constraints: this app already has a server-owned agent runtime, account checks, run records, audit/admin surfaces, and future billing hooks. Bypassing that runtime would weaken traceability and duplicate work when video generation receives the same transient-media requirement.

Local design: keep the existing runtime and run persistence, but introduce an explicit transient media response channel for image outputs. Persist only safe summaries and metadata.

## State Ownership

| State | Owner | Write Entry | Source Of Truth | Notes |
| --- | --- | --- | --- | --- |
| Image run status | `agent_runs` repository | agent run service | database | Durable and recoverable. |
| Prompt and generation options | agent run service/repository | `/api/agent/runs` | database | Store user prompt and non-sensitive options. |
| Billing and audit facts | billing/runtime services | agent run service | database | Required for operations and later reconciliation. |
| Generated image media | client page state | API response handler | current browser session | Not recoverable after refresh/navigation/state replacement. |
| Artifact summary | `agent_artifacts` or run metadata | agent run service | database | May record kind/title/status/mime/size/dimensions/transient flag, but not media content or URL. |

## Invariants

1. The database must not persist generated image binary data, base64 image payloads, provider media URLs, or uploaded copies of generated image output.
2. A completed image run may be auditable without being visually recoverable.
3. The client must not claim the server saved the generated image.
4. Download uses only the current API response and current browser state.
5. If a run succeeds but no transient image payload is returned, the UI must show an explicit incomplete-output state instead of a fake preview.

## API And Runtime Contract

The preferred contract keeps `/api/agent/runs` as the user-facing entrypoint and extends its successful response for transient outputs:

```ts
type TransientAgentArtifactDto = {
  kind: 'image' | 'video';
  title: string;
  mimeType: string;
  dataUrl?: string;
  filename?: string;
  metadata: {
    transient: true;
    width?: number;
    height?: number;
    byteLength?: number;
    model?: string;
  };
};
```

For this MVP, only `kind: 'image'` is required.

The route may return:

```ts
{
  run: AgentRunDto;
  transientArtifacts?: TransientAgentArtifactDto[];
}
```

`AgentRunDto.artifacts` remains the durable artifact list. For image runs it should either:

- include a summary artifact with `kind: 'image'`, title/status/metadata, and null `body`/`url`, or
- remain empty while the run metadata records that media was transient.

The first option is preferred because admin/history screens can show that an image artifact existed without exposing non-existent media.

## Persistence Rule

When completing image generation, repository writes must sanitize media artifacts before persistence:

- `body` must be `null` for image/video artifacts that contain generated media.
- `url` must be `null` for image/video artifacts that point to provider-generated output.
- `metadata` may include safe summary fields: `transient: true`, `mimeType`, dimensions, byte length, provider/model identifiers, generation mode, and option summaries.

Text artifacts may continue using `body` for text responses. Chat behavior is unchanged.

## UI Design

The `/image-gen` success state uses the selected result layout:

1. Large generated image preview.
2. Primary `下载图片` button immediately below the image.
3. Secondary action such as `复制提示词` and optionally `重新生成`.
4. Warning copy below the actions:

   `图片不会保存到服务器，请及时下载。刷新、离开页面或生成下一张后无法恢复。`

The empty, loading, and failed states remain in the right preview panel:

- Empty: preview placeholder and prompt to generate.
- Loading: spinner/progress copy.
- Failed: stable error message from the API.
- Succeeded without image payload: show `任务完成，但没有返回可展示图片。请重试或联系管理员。`

The page should clear the previous transient image when starting a new generation so old output is not mistaken for the current run.

## Error Handling

- Authentication and account activation continue to fail before runtime execution.
- Provider/runtime failure marks the run failed and returns a user-visible error.
- Oversized or unsupported image payloads should fail the request with a stable error code rather than persisting media content.
- If browser download creation fails, keep the preview visible and tell the user to use browser image save behavior.

## Boundaries

- Route handler validates request shape and account state before calling domain/runtime code.
- Agent run service owns the decision to split durable artifact summaries from transient media payloads.
- Repository owns persistence details and must not receive unsanitized media body/url for generated image artifacts.
- UI owns only current-session rendering and download interactions.
- Admin/history views must treat media previews for transient artifacts as unavailable.

## Verification Plan

Focused checks:

1. Unit/service test: image run with generated media returns a transient artifact to the caller.
2. Unit/service or repository test: persisted image artifact summary has `body === null` and `url === null`.
3. API contract test: `/api/agent/runs` image response can include `transientArtifacts` while `run.artifacts` contains no media payload.
4. UI/client test or browser verification: success state renders preview, `下载图片`, and the warning copy.
5. Browser check: refreshing after a successful generation does not show a recoverable image from server state.

General checks:

- Run the focused route/service/client tests touched by the implementation.
- Run `pnpm validate`.
- Run browser verification for `/image-gen` when the local environment can serve the app.

## Future Extension

The same transient media contract should be reused for video generation. Video-specific implementation can add MIME/size/duration metadata and a browser download path, but should keep the same invariant: operational records are durable; generated media content is not server-owned.
