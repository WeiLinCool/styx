# Membership Subscription Work Orders Verification

Date: 2026-06-02

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/server/auth/subscription-work-orders.test.ts src/server/repositories/subscription-work-orders.test.ts` | PASS | 8 focused tests passed for transition rules, expiry windows, active-work-order selection, approval idempotency, and code formatting. |
| `pnpm exec eslint <changed runtime files>` | PASS with existing warning | Changed files passed with no errors. `src/app/user-center/page.tsx` still reports the pre-existing `@next/next/no-img-element` warning at line 568. |
| `pnpm validate` | FAIL | `ts-check` fails in pre-existing points test typing: `src/server/db/schema.points.test.ts` Drizzle table symbol access errors and `src/server/repositories/admin-mutations.points.test.ts` referral mock type mismatches. No subscription-work-order files are listed in the failure. |
| `pnpm build` | PASS | Production build completed and listed new `/api/membership/subscription-work-orders`, `/api/membership/subscription-work-orders/current`, and admin subscription work-order mutation routes. |
| `pnpm db:generate` | PASS | Generated `drizzle/0013_sudden_karen_page.sql` and metadata for `subscription_work_orders`. |
| `pnpm db:migrate` | BLOCKED | `DATABASE_URL is required to run database migrations.` No migration was applied in this environment. |

## Browser And Runtime Checks

- Dev server: `pnpm dev --hostname 127.0.0.1 --port 4010`
- `/membership`: HTTP 200. The page rendered server output and includes the membership page route.
- `/admin/memberships`: HTTP 200 server output includes `会员订阅工单`, seed subscription work-order data, and `AdminSubscriptionWorkOrderActions`.
- `/user-center`: HTTP 200 for unauthenticated page request; full authenticated UI interaction was not covered.
- In-app Browser verification was attempted but blocked because the plugin reported `Browser is not available: iab`.

## Invariant Checks

- Entitlement remains the membership source of truth: PASS. The public membership page no longer calls `updateUser` to grant local membership; approval writes `user_entitlements`.
- Duplicate active work order guard: PASS in helper tests and reinforced in `createSubscriptionWorkOrder` by locking the user row and rechecking active `pending/processing` work orders inside the transaction.
- Approval idempotency: PASS in helper tests and domain logic; already closed/approved work orders return current state without extending entitlement again.
- Rejection cancels pending order: Implemented in the rejection transaction by setting linked pending order to `cancelled` and writing a `cancelled` order event.
- Approval atomicity: Implemented with `database.transaction` for order paid, order event, entitlement grant, and work-order closure.

## Residual Risk

- Database migration needs to be applied in an environment with `DATABASE_URL`.
- Authenticated browser interaction for submitting a real work order and clicking admin transitions needs seeded credentials/database state plus an available browser surface.
- Referral reward qualification is invoked after the approval transaction, matching the existing helper behavior. If referral qualification fails independently, order/entitlement approval remains committed; this mirrors existing order-paid/admin-activation behavior but is not fully atomic with referral rewards.
