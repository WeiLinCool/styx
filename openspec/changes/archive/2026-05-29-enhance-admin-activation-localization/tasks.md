## 1. Activation Work Order Domain

- [x] 1.1 Add schema and migration support for browser-bound activation work orders.
- [x] 1.2 Add repository/service functions to create, list, approve, reject, and expire activation work orders.
- [x] 1.3 Store only a derived browser/device digest and limited review metadata; audit creation, approval, and rejection.

## 2. User-Side Generation Flow

- [x] 2.1 Add a client fingerprint collection helper using browser-available signals with graceful fallback.
- [x] 2.2 Add an account API route for pending users to create an activation binding work order.
- [x] 2.3 Update the activation panel so users click to generate a work order and see the support-facing work order code.

## 3. Admin Review And Chinese Localization

- [x] 3.1 Add admin API actions to approve and reject activation binding work orders.
- [x] 3.2 Surface pending activation work orders in the admin console with approve/reject controls.
- [x] 3.3 Localize admin shell, header, navigation, access-denied copy, shared module controls, action labels, placeholders, empty states, and feedback messages into Chinese.

## 4. Verification

- [x] 4.1 Add focused tests for work order creation, fingerprint digest handling, approval, rejection, and audit behavior.
- [x] 4.2 Run existing admin/account tests and static checks.
- [x] 4.3 Smoke-check representative user activation and admin work order review pages.
