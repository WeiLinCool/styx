## Why

The product already displays user points and uses a credit ledger for AI billing, but the user growth and retention loop is incomplete. There is no closed business flow for referral rewards, daily check-in rewards, or operator-driven point adjustments, which leaves points partially simulated and difficult to audit.

This change closes the user points loop by introducing referral binding, delayed referral qualification, daily check-in rewards, and admin point adjustments on top of a single ledger-backed balance model.

## What Changes

- Add user invite code and invite-link flows so a signed-in user can share a system-generated registration link from the user center.
- Bind a newly registered user to a referrer when they register through a valid invite code, without granting points immediately.
- Grant `+200` points to the referrer exactly once when the referred user first qualifies through either a paid order or an admin-triggered membership activation.
- Add a once-per-day check-in action that grants a random integer reward between `1` and `3` points.
- Add admin workflows to inspect real point balances and manually adjust user points with required reasons and audit events.
- Unify user-visible and admin-visible point balance reads around the credit ledger instead of fixed placeholder values.

## Capabilities

### New Capabilities
- `user-points-growth-loop`: Invite-code referral binding, qualified referral rewards, daily check-in rewards, admin point adjustments, and auditable point balances.

### Modified Capabilities
- `public-product-experience`: Expose invite sharing, daily check-in, and real point balances in the user center.
- `admin-management-console`: Add point balance visibility, point-adjustment actions, and referral/ledger summaries for operators.
- `ai-model-billing`: Reuse the existing credit ledger as the single durable point balance source for both rewards and debits.

## Impact

- Database schema and repositories for invite codes, referral bindings, daily check-in records, and optional ledger-backed summaries.
- User registration flow and user-center APIs/UI for invite generation, invite binding, check-in status, and balance display.
- Admin users pages and admin mutation routes for manual point adjustment and related audit records.
- Order and membership-activation service flows so a referred user's first valid conversion can qualify the referral reward exactly once.
