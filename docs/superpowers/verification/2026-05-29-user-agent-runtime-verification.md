# User Agent Runtime Verification

Change: add-user-agent-runtime
Date: 2026-05-29

## Summary

The user agent runtime implementation was verified with focused unit/route tests, project validation, and a production build. Direct dev-server route smoke checks were blocked by an existing `next-server` process holding port `3000` and the `.next/dev/lock`; `pnpm build` was used as route compilation evidence and listed the new user/admin routes.

## Commands

### Focused Tests

Command:

```bash
pnpm exec tsx --test src/server/agent/capability-resolution.test.ts src/server/repositories/agent-runs.test.ts src/server/agent/run-service.test.ts src/app/api/agent/runs/route.test.ts src/server/repositories/agent-capabilities.test.ts src/features/public/agent-runtime-client.test.ts
pnpm exec tsx 'src/app/api/admin/agent-capabilities/[capabilityId]/status/route.test.ts'
```

Result: PASS.

Evidence:

- Core focused suite: 21 tests passed, 0 failed.
- Admin capability status route parser: 2 tests passed, 0 failed.

### Project Validation

Command:

```bash
pnpm run validate
```

Result: PASS.

Evidence:

- `ts-check`: Done.
- `lint:build`: Done.

### Production Build

Command:

```bash
pnpm build
```

Result: PASS.

Evidence:

- Build compiled successfully.
- TypeScript completed.
- Static generation completed for 19 pages.
- Build route output included:
  - `/admin/agent-capabilities`
  - `/api/admin/agent-capabilities/[capabilityId]/status`
  - `/api/agent/runs`
  - `/api/agent/runs/[runId]`
  - `/chat`
  - `/image-gen`
  - `/video-gen`
  - `/workflow`

## Route Smoke Limitation

Attempted command:

```bash
pnpm dev
```

Result: BLOCKED by environment.

Evidence:

- Port `3000` was already in use by PID `21766` (`next-server v16.1.1`).
- Starting another dev server selected port `3001`, then failed with:
  - `Unable to acquire lock at /Users/wlz/Documents/codeSpace/styx/.next/dev/lock`
- `curl -I --max-time 10` against existing `localhost:3000` for `/chat`, `/admin/agent-capabilities`, and `/admin/ai-jobs` timed out with no bytes received.

Because the existing dev server was externally running and unresponsive, no direct HTTP route smoke result is claimed. The successful production build verifies that the routes compile and are registered.

## Review Notes

Each implementation task received spec and code-quality review through subagents. Issues found during review were fixed and re-reviewed:

- Task 1 fixed UUID-compatible seed ids, clone boundaries, and lifecycle repository methods.
- Task 2 fixed event recording isolation, runtime request cloning, and missing-bundle summary behavior.
- Task 3 fixed malformed JSON handling, non-JSON client error handling, and documented temporary memory repository behavior.
- Task 4 fixed malformed JSON handling in the admin capability status route.
- Task 5 fixed workflow loading/race/stale-status issues and image/video stale success messages.
- Final review fixes added default DB seed data for agent capabilities/bundles, constrained DB bundle resolution to enabled bundles, wired admin capability status actions, exposed default bundle composition in admin, and prevented agent-run rows from posting to AI job review APIs.

## Known Constraints

- Current workspace contains unrelated uncommitted activation/admin changes. Commits were not created to avoid mixing unrelated work.
- Drizzle migration `0002_unusual_major_mapleleaf` was generated after an existing uncommitted `0001_special_hardball` migration. If `0001` changes, regenerate the migration chain.
- Agent run persistence now uses the database-backed repository when `DATABASE_URL` is configured; development/test without `DATABASE_URL` use memory storage, and production without `DATABASE_URL` fails closed.
