# User Check-In Redis Closure Verification

## Scope

This verification covers the development-environment closure for user-center points refresh, open-source captcha dialog verification for check-in and login, Redis-backed server cache configuration, and Docker deployment documentation.

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/app/api/auth/login/route.test.ts src/server/cache/server-cache.test.ts src/server/points/checkin-challenge.test.ts src/app/api/user/points/checkin/route.test.ts src/server/points/service.test.ts` | PASS | 14/14 target tests passed. |
| `pnpm exec tsc -p tsconfig.json --noEmit --pretty false 2>&1 \| rg "src/(components/human-verification-dialog\|types/react-simple-captcha\|lib/auth-context\|app/user-center\|app/api/auth/(login\|human-verification)\|app/api/user/points/checkin\|server/(cache\|points/checkin-challenge))" \|\| true` | PASS | No TypeScript errors were reported for the files changed by this work. |
| `pnpm exec eslint src/components/human-verification-dialog.tsx src/lib/auth-context.tsx src/app/user-center/page.tsx src/app/api/auth/login/route.ts src/app/api/auth/login/route.test.ts src/app/api/auth/human-verification/route.ts src/app/api/user/points/checkin/route.ts src/app/api/user/points/checkin/challenge/route.ts src/server/cache/server-cache.ts src/server/points/checkin-challenge.ts --quiet` | PASS | Changed-file lint passed. |
| `curl http://127.0.0.1:3000/home` and `curl http://127.0.0.1:3000/user-center` | PASS | Both routes returned `200 OK` from the running dev server. |
| `pnpm ts-check` | FAIL | Blocked by existing points test typing errors in `src/server/db/schema.points.test.ts` and `src/server/repositories/admin-mutations.points.test.ts`. |
| `pnpm lint:build` | FAIL | Blocked by existing unrelated errors in `src/lib/api-response.ts`, `src/server/agent/run-service.ts`, and `src/server/repositories/ai-models.ts`. |

## Invariants Checked

- Check-in requires the open-source captcha dialog to pass before the client can request a one-time server verification token.
- Login and registration require the same captcha dialog and one-time server verification token before account mutation runs.
- Verification token state lives in the server cache, with Redis preferred and memory fallback for development.
- The check-in mutation uses a short server-side lock and still relies on DB uniqueness plus ledger idempotency as the durable authority.
- User-center points refresh goes back through `/api/auth/me`; browser cookie/context data is only a display snapshot.
- Redis deployment configuration is documented with placeholders. The real Redis password is only in ignored local environment configuration, not committed.

## Remaining Risk

- Full in-app browser verification was blocked because the Browser plugin returned `Browser is not available: iab`; local HTTP route checks were used instead.
- Full repository type/lint checks remain blocked by pre-existing errors outside the changed files.
