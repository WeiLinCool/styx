## 1. Admin Shell Authentication

- [x] 1.1 Add explicit admin login and logout actions in the admin shell using the existing auth routes.
- [x] 1.2 Update the admin access-denied development state so operators can enter the console without editing code or guessing missing steps.

## 2. Route-Aware Navigation

- [x] 2.1 Make the left admin navigation reflect the current pathname instead of permanently highlighting the dashboard item.
- [x] 2.2 Add tests for top-level and nested admin routes so active styling stays correct.

## 3. Activation Work-Order Queue Management

- [x] 3.1 Replace the approval-centric activation work-order status model with an operator queue lifecycle that supports pending, processing, closed, and archived.
- [x] 3.2 Add repository support for status counts, paginated slices, and compatibility mapping from existing stored statuses.
- [x] 3.3 Refactor the admin users page to render a tabbed, paginated work-order management surface with localized actions and archive visibility.

## 4. Verification

- [x] 4.1 Add or update tests for auth actions, nav route state, work-order mapping, and queue pagination behavior.
- [x] 4.2 Run targeted tests plus `pnpm run validate`.
