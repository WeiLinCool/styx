# Chat MVP Multimodal History Verification

Change: chat-mvp-multimodal-history
Date: 2026-05-29

## Summary

The minimum MVP path was verified through build validation, migration/seed checks, authenticated API checks, and database inspection.

## Commands

### TypeScript

Command:

```bash
pnpm run ts-check
```

Result: PASS.

### Production Build

Command:

```bash
pnpm run build
```

Result: PASS.

Evidence:

- `/chat` compiled successfully
- `/api/agent/runs`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`

### Database Migration

Command:

```bash
DATABASE_URL=postgresql://wlz@localhost:5432/styx_dev pnpm run db:migrate
```

Result: PASS.

Evidence:

- `agent_runs`
- `agent_artifacts`
- `agent_run_events`
- `agent_capabilities`
- `agent_capability_bundles`
- `agent_capability_bundle_items`

### Seed Idempotency

Command:

```bash
DATABASE_URL=postgresql://wlz@localhost:5432/styx_dev pnpm run db:seed
```

Result: PASS after seed reconciliation fix.

Evidence:

- phone `18120810787` remains active
- existing user id is reused
- `owner` role remains present

### Authenticated Chat Run

Commands:

```bash
curl -sS -X POST http://localhost:3000/api/auth/login -H 'content-type: application/json' -c /tmp/styx-chat.cookies -d '{"phone":"18120810787","nickname":"Super Owner"}'
curl -sS -X POST http://localhost:3000/api/agent/runs -H 'content-type: application/json' -b /tmp/styx-chat.cookies -d '{"taskType":"chat","prompt":"请为石头印画设计一句标题"}'
curl -sS http://localhost:3000/api/agent/runs -b /tmp/styx-chat.cookies
```

Result: PASS.

Evidence:

- login returned authenticated active user
- chat run returned `status: succeeded`
- chat history listing returned the persisted run
- `agent_runs` table contained the created chat record for the superuser
