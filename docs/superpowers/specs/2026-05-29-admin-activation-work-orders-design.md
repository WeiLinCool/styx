---
archived-with: 2026-05-29-enhance-admin-activation-localization
status: final
status: final
---
# Admin Activation Work Orders Design

Change: `enhance-admin-activation-localization`
Status: design

## Summary

Activation binding moves from an admin-generated token handoff to a user-originated work order. A pending user opens the activation panel, clicks to generate an activation binding request, and receives a support-facing work order code. The request is tied to the current browser through a server-derived fingerprint digest. Support reviews the pending work order in admin, then approves or rejects it. Approval activates the account and persists an audited device binding context.

## Architecture

The feature adds an `activation_work_orders` table rather than overloading `activation_tokens`. Tokens represent secret redemption; work orders represent a support review lifecycle. The table stores target user, public work order code, status, browser fingerprint digest, limited device metadata, expiry, approval/rejection actor, reason, and timestamps.

User-side generation is handled by a new account API route. The client collects coarse browser signals such as user agent, language, timezone, screen size, platform, hardware concurrency, and color depth. The server canonicalizes that payload and stores a salted digest plus limited review metadata. The raw fingerprint payload is not persisted.

Admin-side review uses repository/service functions that list pending work orders and approve or reject them. Approval validates that the work order is pending and unexpired, marks the account active, stores approval metadata, and records audit events. Rejection records actor, reason, and audit metadata without activating the account.

## Data Flow

```
Pending user browser
  -> collect fingerprint signals
  -> POST /api/account/activation-work-orders
  -> activation_work_orders row with code + digest
  -> user copies code to support

Support admin
  -> /admin/users or activation review section
  -> approve/reject work order by id/code
  -> service updates work order + user state + audit events
```

## Interfaces

- `createActivationWorkOrder(input)` creates a pending work order and returns code, status, expiry, and limited device summary.
- `listActivationWorkOrders(input?)` returns pending/recent work orders for admin review.
- `approveActivationWorkOrder(input)` activates the account and marks the work order approved.
- `rejectActivationWorkOrder(input)` marks the work order rejected with a reason.
- `buildBrowserFingerprintPayload()` runs in the browser and returns coarse fields only.
- `createBrowserFingerprintDigest(payload)` runs on the server using existing `hashSecret`.

## Security And Privacy

Browser fingerprinting is not treated as a proof of identity. It is only a binding context and support review signal. Raw fingerprint material must not be stored in the database. The public work order code is not a bearer activation secret; approval still requires an authorized admin session. Every create, approve, and reject operation records an audit event.

## Admin Localization

The admin UI will continue to use static Chinese strings rather than adding i18n. Shared admin shell components are localized first, followed by module placeholders, action labels, feedback messages, and seed data strings that are visible to support operators.

## Testing

Tests cover canonical digest stability, work order creation, expiry handling, approve/reject transitions, account activation on approval, and invalid-state errors. Existing admin and account tests remain part of verification. UI behavior is smoke-checked through rendered routes and static checks.
