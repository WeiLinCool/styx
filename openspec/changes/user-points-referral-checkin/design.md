## Context

The repository already has a durable credit ledger in [`credit_ledger_entries`](/Users/wlz/Documents/codeSpace/styx/src/server/db/schema.ts:742) plus helper logic in [`src/server/billing/credits.ts`](/Users/wlz/Documents/codeSpace/styx/src/server/billing/credits.ts:1). That ledger is currently used for AI billing debits, while user-facing points remain inconsistent: [`/api/auth/me`](/Users/wlz/Documents/codeSpace/styx/src/app/api/auth/me/route.ts:1) still returns a fixed `0`, and the admin user list currently shows entitlement-derived quantities rather than a true points balance.

This change extends the existing ledger into a complete points system for user growth and retention:

```
Invite code generation
  -> new-user invite binding
  -> first valid conversion
  -> idempotent referral reward grant

Daily check-in action
  -> one record per user per local day
  -> random reward 1..3
  -> ledger grant

Admin adjustment action
  -> validated operator mutation
  -> ledger adjustment
  -> audit event

All reads
  -> shared balance service
  -> user center + admin console + billing checks
```

## Goals / Non-Goals

**Goals:**
- Give each user one stable shareable invite code and registration link.
- Bind invite relationships only during new-user registration and make them immutable afterward.
- Delay the `+200` referral reward until the referred user first qualifies through a paid order or an admin-triggered membership activation.
- Add a once-per-day check-in action with a random integer reward between `1` and `3`.
- Let admins manually add or subtract points with explicit reasons and auditability.
- Make all point balances read from one ledger-backed source of truth.

**Non-Goals:**
- Referral commission tiers, invite leaderboards, or multi-level rewards.
- Consecutive-streak, retroactive, or make-up check-in mechanics.
- Fully configurable campaign/rules engines for rewards.
- Supporting multiple concurrently active invite codes per user in the first release.

## Decisions

### The Credit Ledger Remains The Balance Source Of Truth

All new grants and adjustments SHALL be written into `credit_ledger_entries`, and user-visible balances SHALL be derived from the same balance service already used for AI billing checks. New point features must not create a second durable balance field.

Alternative considered: storing reward state or running totals directly in `users.metadata`. Rejected because retries, admin adjustments, and audits become fragile and difficult to reconcile.

### Referral Binding Is Separate From Reward Qualification

Registration through an invite code SHALL create a referral relationship immediately, but the `+200` reward SHALL only be granted when the referred user first qualifies through one of two server-owned conversion events:
- an order becomes `paid`
- an admin workflow activates the user into membership

Alternative considered: granting points at registration or account activation. Rejected because the user explicitly wants reward timing tied to valid conversion, and immediate grants are easier to abuse.

### Each Referred User Can Qualify Only Once

The referral reward SHALL be keyed by the referred user, not by order count or membership changes. A referred user can cause at most one referral reward, even if they later place more orders or are reprocessed by admin actions.

Implementation consequence: the reward grant must use a stable idempotency key such as `referral-reward:referred-user:<userId>` and persist qualification state alongside the referral record.

### Daily Check-In Uses A Dedicated Day-Record Table

Check-in state SHALL be tracked in a dedicated table keyed by `(user_id, checkin_date)` and not inferred only from ledger rows. This makes "already checked in today" fast and unambiguous, while the actual balance impact still comes from the ledger grant row.

Alternative considered: deriving daily uniqueness from ledger metadata only. Rejected because it makes validation and admin investigations more awkward.

### One Stable Invite Code Per User

The first release SHALL default to one active invite code per user. The system creates it lazily on first access from the user center and returns the same code afterward.

Alternative considered: allowing unlimited rotating invite codes. Rejected as unnecessary scope for this loop and adds admin/support ambiguity around attribution.

### Admin Adjustments Must Fail Closed

Admin point adjustments SHALL require an authorized admin session, an explicit reason, and a signed integer amount. Negative adjustments SHALL be rejected when they would drive the current balance below zero.

Alternative considered: allowing negative balances. Rejected for the first release because the rest of the product already assumes insufficient balance blocks usage rather than creating debt states.

### Business Day For Check-In Is Fixed To Asia/Shanghai

Check-in day boundaries SHALL use the repository's current business context and the user's stated locale expectations by treating a day as the natural day in `Asia/Shanghai`.

Alternative considered: storing a per-user timezone for check-in windows. Rejected because it is not needed for the initial release and increases edge-case complexity.

## Risks / Trade-offs

- Existing point reads are inconsistent across UI and admin surfaces -> centralize balance reads before adding more entry points.
- Referral qualification may be triggered by multiple flows -> require transactionally safe qualification state plus idempotent ledger writes.
- Randomized check-in rewards can be retried by duplicate clicks -> enforce a unique per-day record and stable ledger idempotency key.
- Admin adjustments can be abused or become hard to explain later -> require audit events, visible reasons, and fail-closed permission checks.
- Legacy `users.metadata.credits` may still exist from earlier assumptions -> treat it only as bridge input while preventing new product features from writing to it.

## Migration Plan

1. Add schema for invite codes, referral bindings, and daily check-ins while reusing `credit_ledger_entries`.
2. Add repository/service helpers for invite generation, referral binding, qualification checks, daily check-in, and admin adjustments.
3. Update user auth/session payloads and user-center loaders to expose real balances and growth-loop data.
4. Hook order-paid and admin membership-activation flows into referral qualification.
5. Add admin console balance visibility and manual adjustment actions.
6. Keep existing ledger debit behavior for AI usage unchanged, but route all point reads through the shared balance service.

## Open Questions

- Whether the admin console should expose only recent point ledger entries or a fully filterable points history view in this release.
- Whether the current "activate membership" admin flow already has a single authoritative server entry point or needs boundary cleanup during implementation.
