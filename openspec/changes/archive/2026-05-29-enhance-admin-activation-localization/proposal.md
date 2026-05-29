## Why

Activation should be initiated by the user from the browser that will be bound, not generated directly by admin support. The current admin-assisted flow can reissue activation tokens, but it does not create a user-originated activation/binding work order that support can verify and approve.

Admin copy also remains partly English, which makes the management console inconsistent for Chinese support operators.

## What Changes

- Add a user-side activation binding request flow where the user clicks to generate a browser-bound activation work order.
- Capture a browser fingerprint-derived device digest and user-visible work order code without storing raw browser fingerprint material.
- Add server-side persistence for activation binding work orders with statuses such as pending, approved, rejected, and expired.
- Let the user provide the work order code to admin/customer support.
- Let authorized admins review pending activation binding work orders and approve/reject them from the admin console.
- On approval, activate the target account and bind the request to the captured device/fingerprint context through audited server-side state.
- Localize admin navigation, headers, module controls, action buttons, success/error fallbacks, placeholders, empty states, and access-denied copy into Chinese.

## Capabilities

### New Capabilities

### Modified Capabilities
- `account-activation-binding`: Activation must support a user-originated, browser-bound work order flow that admins approve before account activation/binding completes.
- `admin-management-console`: Admin-facing console UI must be consistently Chinese and must expose activation binding work orders for support review.

## Impact

- Database: add activation binding work order persistence and related migration metadata.
- User UI/API: update activation panel and add an account endpoint for generating browser-bound activation work orders.
- Admin UI/API: expose work orders in user/admin operations and add approve/reject actions.
- Security: browser fingerprint is a risk signal and binding context, not a sole authentication factor; store only a digest plus normalized metadata needed for review/audit.
- Tests: add domain/repository tests for work order creation and approval; run existing admin/account tests.
