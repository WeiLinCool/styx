# User Points Referral Check-In Design

## Summary

This change completes the user points business loop on top of the existing credit ledger. It adds a stable invite-code flow, delayed referral rewards, daily check-in rewards, and admin point adjustments, then unifies balance reads across user-facing and admin-facing surfaces.

The core decision is to keep the ledger as the only durable balance source while storing referral-binding and check-in state in small dedicated tables. Rewards are issued only through server-owned qualification events so retries and duplicate triggers stay idempotent.

## Problem

The current application mixes real and placeholder point behavior:

- The codebase already contains a real credit ledger and balance helpers in [`src/server/billing/credits.ts`](/Users/wlz/Documents/codeSpace/styx/src/server/billing/credits.ts:1).
- The authenticated user payload in [`src/app/api/auth/me/route.ts`](/Users/wlz/Documents/codeSpace/styx/src/app/api/auth/me/route.ts:1) still returns `points: 0`.
- The user center shows points, but those numbers are not reliably sourced from a real growth/reward workflow.
- The admin users module in [`src/features/admin/admin-users-module.tsx`](/Users/wlz/Documents/codeSpace/styx/src/features/admin/admin-users-module.tsx:1) and [`src/server/repositories/users.ts`](/Users/wlz/Documents/codeSpace/styx/src/server/repositories/users.ts:1) is currently oriented around account lifecycle and entitlement summaries, not a true points ledger.

The requested feature set is small in surface area but large in business semantics because it introduces mutable durable state, multiple qualification paths, and operator-driven balance changes.

## Industry Pattern

Industry consensus -> Referral and rewards systems usually separate relationship binding from reward qualification, keep a ledger or transaction history for all balance changes, and enforce one-time qualification with stable idempotency keys.

Transferable principle -> Bind the invite relationship early, but only grant value on a later server-owned business event that represents real conversion.

This repository's constraints -> The project already has a ledger and admin audit surface, so the cleanest design is to extend those primitives instead of inventing a second points store.

Local design -> Use dedicated tables for invite code ownership, referral binding, and daily check-ins; issue all monetary-like point changes through the existing ledger.

## State Ownership

### Durable state

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| User point balance | Ledger service | Reward / debit / adjustment services | `credit_ledger_entries` + legacy bridge reader |
| User invite code | Points growth repository/service | Invite summary loader | `user_invite_codes` |
| Referral relationship | Points growth repository/service | Registration binding flow | `user_referrals` |
| Referral qualification | Points growth service | Paid order or admin membership activation | `user_referrals.qualified_*` + reward ledger id |
| Daily check-in completion | Points growth service | Check-in action | `user_daily_checkins` |
| Admin point adjustment audit | Audit service | Admin adjustment action | `audit_events` |

### Derived state

- Current point balance
- Invite statistics: total invited, qualified invited, total rewarded points
- Today's check-in status
- Recent point activity feed

## Invariants

1. User-visible and admin-visible point balance must be derived from the ledger-backed balance service, not a second mutable field.
2. A referred user can trigger at most one referral reward, regardless of how many qualifying events later occur.
3. A user can receive at most one daily check-in reward per `Asia/Shanghai` natural day.

## Data Model

### Reuse existing ledger

Keep using [`credit_ledger_entries`](/Users/wlz/Documents/codeSpace/styx/src/server/db/schema.ts:742) for all balance changes:

- Invite reward: `entryType = grant`
- Daily check-in: `entryType = grant`
- Admin adjustment: `entryType = adjustment`
- AI usage debit remains unchanged

The `reason` and `metadata` fields distinguish business sources:

- `reason = invite reward`
- `reason = daily checkin`
- `reason = admin adjustment`

### New table: `user_invite_codes`

Purpose: stable per-user invite code ownership.

Suggested fields:

- `id`
- `user_id`
- `code`
- `status`
- `created_at`
- `disabled_at`

Suggested constraints:

- unique `code`
- at most one active code per user in the first release

### New table: `user_referrals`

Purpose: immutable referral relationship plus delayed qualification state.

Suggested fields:

- `id`
- `referrer_user_id`
- `referred_user_id`
- `invite_code_snapshot`
- `bound_at`
- `qualified_at`
- `qualified_by`
- `reward_ledger_entry_id`
- `created_at`

Suggested constraints:

- unique `referred_user_id`
- optional unique pair `(referrer_user_id, referred_user_id)`

`qualified_by` values:

- `order_paid`
- `membership_activated`

### New table: `user_daily_checkins`

Purpose: one row per user per business day to enforce one successful daily check-in.

Suggested fields:

- `id`
- `user_id`
- `checkin_date`
- `reward_points`
- `ledger_entry_id`
- `created_at`

Suggested constraints:

- unique `(user_id, checkin_date)`

## Business Flows

### 1. Invite code generation

User opens the user center invite card.

Service behavior:

- If the user already has an active invite code, return it.
- Otherwise create one lazily and return it.
- Build a registration URL containing `?invite=<code>`.

The first release should not allow arbitrary regeneration because one stable code keeps attribution and support simpler.

### 2. Registration binding

New user arrives through invite URL and completes registration.

Service behavior:

- Validate invite code exists and is active.
- Prevent invalid self-binding semantics.
- After user creation completes, bind exactly one referral record if the new user has no existing referrer.
- Do not grant any points yet.

This keeps registration lightweight and prevents premature rewards.

### 3. Referral qualification on paid order

When a referred user's first qualifying order becomes `paid`:

- Load referral by `referred_user_id`.
- If no referral exists, do nothing.
- If referral already qualified, do nothing.
- In one transaction:
  - mark `qualified_at`
  - set `qualified_by = order_paid`
  - write `+200` ledger grant to referrer
  - store `reward_ledger_entry_id`

Idempotency key:

- `referral-reward:referred-user:<userId>`

This prevents duplicate reward grants across webhook or admin retries.

### 4. Referral qualification on admin membership activation

When an admin server action promotes a referred user into membership before any paid order has qualified them:

- Reuse the same qualification service
- Use `qualified_by = membership_activated`
- Reuse the same referred-user idempotency key

This keeps multiple conversion channels under one reward rule.

### 5. Daily check-in

User clicks check-in in the user center.

Service behavior:

- Resolve current business day in `Asia/Shanghai`
- Check whether `(user_id, checkin_date)` already exists
- If yes, return already checked-in response
- If no:
  - generate random integer `1..3`
  - create daily check-in row
  - create ledger grant row

Idempotency key:

- `daily-checkin:<userId>:<YYYY-MM-DD>`

The table constraint plus idempotency key protects against duplicate clicks and retry races.

### 6. Admin manual adjustment

Admin opens a point-adjustment dialog from the users console.

Inputs:

- target user
- signed integer amount
- required reason
- optional note

Service behavior:

- Require an authorized admin session
- Read current balance
- Reject negative adjustment when it would drive balance below zero
- Create ledger row
- Create audit event with operator, target, amount, reason, note, and resulting balance

## Boundary Graph

- `src/app/api` or server actions
  - validate payloads
  - authenticate user/admin
  - call points service
- `src/server/points` or `src/server/billing`
  - own invite, referral, check-in, and adjustment business rules
- `src/server/repositories`
  - own query shape for invite/referral/check-in/admin summaries
- `src/server/db/schema.ts`
  - own durable tables and constraints
- `src/features`
  - render user center and admin users UI

## UI Changes

### User center

Add:

- invite card with code, registration link, and copy actions
- referral summary: invited count, qualified count, reward total
- daily check-in card with today's status and latest reward result
- recent points activity list

Update:

- current points display to use real balance

### Admin users page

Update:

- point balance column to use real balance

Add:

- adjustment action in the user row actions area
- recent ledger/referral summary where it helps operator decisions

## Error Handling

- Invalid invite code: registration continues without binding or returns explicit validation error depending on current registration UX boundary.
- Duplicate referral qualification event: return no-op success rather than throwing.
- Second same-day check-in: return deterministic already-checked-in response.
- Negative admin adjustment below zero: reject with validation error, no ledger row.
- Database unavailable: follow existing fail-closed server error behavior.

## Testing Strategy

Lowest meaningful layer first:

- Service/repository tests for:
  - invite binding only once
  - referral reward issued exactly once across order-paid and membership-activation paths
  - daily reward always in `1..3`
  - second same-day check-in rejected
  - admin negative adjustment below zero rejected
- Type/lint verification:
  - `pnpm validate`
- Build/runtime wiring:
  - `pnpm build`
- Database change verification:
  - `pnpm db:generate`
  - `pnpm db:migrate` when environment allows
- Browser verification:
  - user center invite/check-in flow
  - admin user points adjustment flow

## Implementation Notes

- Prefer a dedicated server module for points-growth rules instead of scattering ledger writes in route handlers.
- Reuse the existing balance helper and evolve it so old metadata-based credits are only bridge input, not a write target for new features.
- Keep admin authorization fail-closed and avoid importing Node-only modules into middleware.
