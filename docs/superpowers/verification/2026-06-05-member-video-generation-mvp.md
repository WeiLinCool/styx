# Member Video Generation MVP Verification

Date: 2026-06-06

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm validate` | PASS | `ts-check` and `lint:build` both completed with exit code 0. |
| `pnpm build` | PASS | Production build completed and listed `/video-gen`, `/api/agent/video-config`, `/api/admin/video-generation-config`, `/api/agent/runs`, and media upload/access routes. Next.js emitted the existing workspace-root inference warning because multiple lockfiles are present. |
| `pnpm db:migrate` | BLOCKED | `.env.local` injected 0 variables and the command exited with `DATABASE_URL is required to run database migrations.` No migration was applied in this environment. |
| `pnpm exec tsx --test src/server/video/video-generation-policy.test.ts src/server/repositories/video-generation-config.test.ts src/app/api/agent/video-config/route.test.ts src/app/api/admin/video-generation-config/route.test.ts src/server/media/upload-user-media.test.ts src/app/api/user/media-assets/upload/route.test.ts src/app/api/agent/runs/route.test.ts src/server/agent/run-service.test.ts src/server/ai/video-provider-adapters.test.ts` | PASS | 107 focused tests passed. Coverage includes member/free video policy, admin/user config APIs, audio upload, canonical video input validation, material ownership/signing, provider task creation failure handling, run-service video execution, and Doubao image/audio request body mapping. |

## Browser And Runtime Checks

- Dev server: `pnpm dev --hostname 127.0.0.1 --port 4010`.
- Ports `4000` and `4001` were already occupied, so `4010` was used.
- In-app Browser verification was attempted but blocked because the Browser plugin reported `Browser is not available: iab`.
- Local Playwright verification was run against `http://127.0.0.1:4010/video-gen` with route-level mocks for auth, video config, saved media, upload, and run creation.

Verified in browser:

- Logged-out user clicking `开始生成` opens the login modal path.
- Disabled/free video config renders the premium message `AI 视频生成是会员权益，开通会员后即可使用。` and disables submit.
- Enabled member config renders style, duration, resolution, model, image, and audio controls.
- Clicking video style `胶片质感` fills the prompt with `复古胶片质感的视频镜头`.
- Media library image/audio selects can select saved image and audio assets.
- Clearing library selections works for both image and audio.
- Local image/audio uploads trigger two upload requests.
- After upload, selected media IDs are reconciled to returned asset IDs: `img-upload` and `aud-upload`.
- During generation, image/audio file inputs and media-library selects are disabled.
- `/api/agent/runs` is invoked from the page. The browser request body is encrypted by the client API layer, so canonical plaintext input was verified through route/service tests instead of browser inspection.

## Requirement Checks

- Video is premium/member-only: PASS. Free users receive a disabled upgrade response at `/api/agent/video-config`; run-service policy validation rejects disabled policy before run creation.
- Styles auto-fill prompts: PASS in browser verification.
- Duration and resolution are admin/member configured: PASS in policy/repository/API tests and browser config rendering.
- Image and audio materials can be uploaded and passed through: PASS in upload tests, run-service material signing tests, adapter request-body tests, and browser upload selection verification.
- Doubao `Doubao-Seedance-2.0` is first adapter target: PASS in video provider adapter tests and model/config browser mock.

## Residual Risk

- Database migrations still need to be applied in an environment with `DATABASE_URL`.
- Full real authenticated browser generation against a seeded membership user was not possible in this worktree because `DATABASE_URL` is unavailable. Route/service tests and mocked browser verification cover the implemented contract and UI behavior.
- Provider-side live Doubao execution was not run; adapter request construction is covered by tests.
