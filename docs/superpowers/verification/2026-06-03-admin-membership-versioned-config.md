# Admin Membership Versioned Config Verification

- `pnpm exec tsx --test src/server/db/schema.membership-versioning.test.ts src/server/repositories/membership-plan-versions.test.ts src/server/auth/permission-service.test.ts src/server/ai/model-entitlements.test.ts src/server/auth/subscription-work-orders.test.ts src/server/auth/membership-snapshot.test.ts src/server/repositories/ai-models.test.ts src/features/admin/admin-membership-config-module.test.tsx src/features/admin/admin-permissions-module.test.tsx src/app/api/admin/memberships/membership-workspace-route.test.ts` ✅
- `pnpm db:generate` ✅
- `pnpm validate` ⚠️ blocked by pre-existing repository TypeScript errors in `src/server/agent/run-service.ts` and `src/server/media/cos-client.ts`
- `pnpm build` ⚠️ blocked by the same pre-existing `src/server/agent/run-service.ts` TypeScript errors after Next.js compilation succeeds

Notes:

- Membership-versioning schema, repository resolution, entitlement version binding, admin memberships workspace, embedded permissions editing, and membership guide rendering all passed focused verification.
- The current turn removed all TypeScript errors introduced by the membership work; remaining global failures are outside the membership module.
