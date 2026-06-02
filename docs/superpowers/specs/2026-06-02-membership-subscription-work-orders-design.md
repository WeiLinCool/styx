# Membership Subscription Work Orders Design

Date: 2026-06-02

## Scope

Close the user membership subscription loop through a work-order based manual payment review flow.

This design covers:

- User selects a monthly or yearly membership plan and submits a subscription work order.
- The system creates a pending order at the same time as the work order.
- Admin reviews the submitted payment details through a queue.
- Approval atomically marks the order paid and creates or extends membership entitlement.
- Rejection closes the work order and cancels the pending order.

This design does not cover:

- Payment gateway integration.
- Automatic subscription renewal.
- Refunds, user-initiated subscription cancellation, entitlement rollback, or prorated refund logic.
- Uploading payment proof images or managing file storage.
- Editing membership plan pricing or entitlement rules.

## Classification

Large.

This change crosses public UI, admin UI, API routes, domain policy, repositories, database schema, order state, entitlement state, admin authorization, and audit behavior.

## Reference Research

Industry consensus -> transferable principle -> repository constraints -> local design:

- Stripe bank transfer invoices separate an invoice/payment obligation from reconciliation. Automatic reconciliation can match payments, but manual reconciliation remains an explicit operator action when matching is ambiguous. Reference: <https://docs.stripe.com/invoicing/bank-transfer?locale=en-GB>
- Shopify keeps order progress as multiple operational states, including order status, payment status, fulfillment status, and return status, so one field does not carry every workflow meaning. Reference: <https://help.shopify.com/en/manual/orders/manage-orders/order-status>
- Atlassian Jira work items separate status from resolution: status tells the queue position, while resolution explains how the work completed. Reference: <https://support.atlassian.com/jira-cloud-administration/docs/what-are-issue-statuses-priorities-and-resolutions/>

Local translation:

- `orders` remain the durable payment obligation and payment status record.
- A new subscription work-order table owns manual review state and submitted payment details.
- `user_entitlements` remains the durable membership authority.
- Approval is the only state transition that connects all three records: work order closed/approved, order paid, entitlement granted or extended.

## Existing Context

The repository already has:

- `orders` and `order_events` in `src/server/db/schema.ts`.
- `membership_plans`, `benefits`, and `user_entitlements`.
- Activation and password-reset work order patterns with `pending -> processing -> closed -> archived`.
- Admin mutation APIs protected by `requireAdmin`, `readJsonBody`, and `runProtectedMutation`.
- Referral reward qualification that can be triggered by membership activation.

Current membership display and AI access should continue deriving from entitlements. The design must not introduce a second durable membership truth in cookies, UI state, or order metadata.

## Mutable State

| State | Owner | Write entry | Source of truth |
| --- | --- | --- | --- |
| Order payment status | Order domain/repository | User order creation, admin approval/rejection | `orders.status`, `orders.paid_at`, `order_events` |
| Subscription review status | Subscription work-order domain/repository | User submission, admin queue actions | `subscription_work_orders.status/result` |
| Membership access | Entitlement domain/repository | Subscription approval only | `user_entitlements` |
| User-facing current application status | Derived API response | None | Latest active subscription work order joined to order/plan |
| Admin audit trail | Audit service | Admin queue actions | Audit events plus order/work-order events |

## Invariants

1. Every subscription work order must reference exactly one order and one membership plan.
2. A user cannot create a second active subscription work order for the same plan while an existing one is `pending` or `processing`.
3. Only `pending` work orders can move to `processing`.
4. Only `processing` work orders can be approved or rejected.
5. Approval must be atomic: no committed state may leave an order paid without the corresponding entitlement grant/extension.
6. Approval must be idempotent: repeating the same approval request must not extend the membership twice.
7. Entitlement expiry is extended from the current active expiry when present; otherwise it starts at approval time.
8. Rejection closes the work order and cancels the linked pending order.

## Data Model

Add a dedicated subscription work-order table rather than reusing activation work orders.

Proposed enum:

```ts
subscription_work_order_status = ['pending', 'processing', 'closed', 'archived']
subscription_work_order_result = ['approved', 'rejected']
```

Proposed table: `subscription_work_orders`

- `id`
- `code`
- `status`
- `result`
- `user_id`
- `order_id`
- `plan_id`
- `submitted_payment_method`
- `submitted_amount_cents`
- `submitted_paid_at`
- `submitted_reference`
- `submitted_note`
- `processor_admin_id`
- `processed_at`
- `closed_at`
- `archived_at`
- `decision_note`
- `metadata`
- `created_at`
- `updated_at`

Indexes and constraints:

- Unique `code`.
- Index `user_id`.
- Index `order_id`.
- Index `plan_id`.
- Index `status`.
- Check `submitted_amount_cents >= 0`.
- Prefer a repository-level duplicate guard for active work orders because partial unique indexes are not currently a common local schema pattern in this repository.

## User Flow

1. User opens `/membership`.
2. User selects monthly or yearly membership.
3. If not logged in, the UI prompts login before submission.
4. The submission form collects:
   - payment method
   - paid amount
   - paid time
   - transaction reference or remark
   - optional note
5. On submit, the server creates:
   - a pending order with the selected plan and locked price
   - a pending subscription work order linked to that order
6. The user sees work-order code, order number, plan, amount, and status.
7. If the same user already has a `pending` or `processing` work order for the same plan, the API returns the existing active work order instead of creating another order.
8. If the previous work order is rejected or archived, the user can submit again and receives a new locked-price order.

User-facing states:

- `pending`: waiting for admin review
- `processing`: admin is checking payment
- `approved`: membership opened or extended
- `rejected`: application rejected, user can resubmit

## Admin Flow

Admin surface:

- Add a subscription work-order queue under the membership or order admin workspace, choosing the least invasive route during implementation.
- The queue must support status filtering using the existing admin queue style.

Displayed fields:

- Work-order code
- Order number
- User
- Membership plan
- Order amount
- Submitted payment method
- Submitted amount
- Submitted paid time
- Submitted reference
- Submitted note
- Status
- Processor
- Processed/closed time
- Decision note

Amount mismatch:

- The admin UI should highlight when submitted amount differs from the locked order total.
- Amount mismatch does not automatically reject the work order because manual reconciliation is the stated workflow.

Transitions:

- Start processing: `pending -> processing`.
- Approve: `processing -> closed`, `result = approved`.
- Reject: `processing -> closed`, `result = rejected`, linked order `cancelled`.
- Archive: `closed -> archived`.

Approval transaction:

1. Lock or re-read the work order and linked order.
2. Confirm work order is `processing`.
3. Confirm linked order is still `pending`.
4. Mark order `paid` and set `paid_at`.
5. Insert `order_events` row with type `paid`.
6. Create or extend `user_entitlements` for the selected plan.
7. Mark work order `closed` with `approved` result.
8. Qualify referral reward through the existing membership activation source.
9. Write audit event.

Rejection transaction:

1. Confirm work order is `processing`.
2. Mark linked order `cancelled` if it is still `pending`.
3. Insert `order_events` row with type `cancelled`.
4. Mark work order `closed` with `rejected` result.
5. Write audit event.

## API Boundary

User APIs:

- `POST /api/membership/subscription-work-orders`
  - Validates selected plan, payment fields, and authenticated user.
  - Creates pending order and work order.
  - Returns existing active work order for duplicate active submission.
- `GET /api/membership/subscription-work-orders/current`
  - Returns current active or most recent subscription work-order summary.

Admin APIs:

- `GET /api/admin/subscription-work-orders`
- `POST /api/admin/subscription-work-orders/[workOrderId]/processing`
- `POST /api/admin/subscription-work-orders/[workOrderId]/approve`
- `POST /api/admin/subscription-work-orders/[workOrderId]/reject`
- `POST /api/admin/subscription-work-orders/[workOrderId]/archive`

Boundary rules:

- Route handlers validate input with `zod`.
- User routes require an authenticated user.
- Admin routes require `requireAdmin`.
- Mutation routes use the existing protected mutation guard.
- Domain/repository code owns state transitions; route handlers stay thin.

## Entitlement Rules

For a plan with billing period `month`, approval grants one calendar month.

For a plan with billing period `year`, approval grants one calendar year.

For an existing active entitlement for the same plan:

- base date = current `expires_at` if it is in the future
- otherwise base date = approval time

For a user without an active entitlement for that plan:

- `starts_at` = approval time
- `expires_at` = approval time plus plan period

If a user buys a different plan, implementation should choose the conservative first version:

- Extend or create entitlement for the purchased plan only.
- Do not attempt automatic upgrade conversion, downgrade proration, or entitlement merging.

## Error Handling

User side:

- Missing login: prompt login before creating a work order.
- Inactive or missing plan: return validation error and do not create an order.
- Invalid payment fields: return validation error and preserve form input.
- Duplicate active work order: return existing active work order.

Admin side:

- Unauthorized admin mutation: fail closed.
- Invalid transition: return domain error, no partial writes.
- Already approved work order: return the current closed/approved state without extending entitlement again.
- Database unavailable: return existing account/domain unavailable response pattern.

## UI Notes

Public membership page:

- Reuse the existing membership plan cards and add a subscription application path for paid plans.
- Button state should reflect active work order: apply, application pending, processing, approved, rejected.
- Avoid presenting the user as a member until entitlement exists.

User center:

- Show recent subscription application status and current membership entitlement.
- Keep application status separate from membership status.

Admin console:

- Operational, dense, and scannable.
- Use existing admin table/card patterns and status badges.
- Highlight payment amount mismatch and pending processing age.

## Verification Plan

Lowest meaningful layers:

- Domain/unit tests:
  - status transition rules
  - duplicate active submission behavior
  - entitlement expiry extension
  - approval idempotency
  - rejection cancels linked pending order
- Repository/API tests:
  - user creation validates plan and payment payload
  - admin routes fail closed without admin session
  - approval writes order event, entitlement, work-order result, and audit event
- Type/lint:
  - `pnpm validate`
- Database:
  - `pnpm db:generate`
  - `pnpm db:migrate` when database configuration is available
- UI:
  - Browser check for membership application form, user status display, admin queue transitions.

## Open Decisions For Implementation

- Whether the queue is placed under `/admin/memberships` or `/admin/orders` should be decided after inspecting the current admin module composition in the implementation plan.
- Whether to expose a dedicated user work-order history page or only a current-status summary can be decided in implementation. The first version should include current status at minimum.
- Uploading payment screenshots remains out of scope until file storage, retention, and privacy rules are designed.
