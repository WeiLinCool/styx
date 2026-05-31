## 1. Data Model And Services

- [ ] 1.1 Add schema and migration support for user invite codes, referral bindings, and daily check-in records while reusing `credit_ledger_entries` for balance changes.
- [ ] 1.2 Implement repository/service helpers for invite-code creation, referral binding during registration, referral qualification, daily check-in grants, and admin point adjustments.
- [ ] 1.3 Add balance-summary helpers so user-facing and admin-facing point reads use the same ledger-backed source.

## 2. Referral Qualification Flows

- [ ] 2.1 Update the registration flow to accept and validate an invite code, prevent self-invites, and bind the newly created user exactly once.
- [ ] 2.2 Hook the order-paid flow to qualify an existing referral exactly once and grant `+200` points to the referrer.
- [ ] 2.3 Hook the admin membership-activation flow to qualify an existing referral exactly once when no paid-order qualification has already happened.

## 3. User Experience

- [ ] 3.1 Extend the authenticated user payload and user-center data loaders to return real point balances, invite-code summaries, and check-in state.
- [ ] 3.2 Add user-center UI for invite-code sharing, invite statistics, and daily check-in action/results.
- [ ] 3.3 Add user-visible recent points activity for at least referral rewards, daily check-ins, admin adjustments, and AI debits.

## 4. Admin Console

- [ ] 4.1 Update the admin user module to display real point balances instead of placeholder/entitlement-only counts.
- [ ] 4.2 Add admin actions and route handlers for signed point adjustments with required reasons and audit events.
- [ ] 4.3 Add referral and recent ledger summaries where they help operators understand why a balance changed.

## 5. Verification

- [ ] 5.1 Add focused tests for referral binding, single qualification across both conversion paths, daily one-time check-in, random reward bounds, and admin non-negative adjustment enforcement.
- [ ] 5.2 Run `pnpm validate` and `pnpm build`.
- [ ] 5.3 Run database generation/migration commands appropriate to the environment and perform browser verification for the user center and admin users page.
