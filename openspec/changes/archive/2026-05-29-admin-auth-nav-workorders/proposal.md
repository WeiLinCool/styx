## Why

The admin console still lacks a usable sign-in and sign-out interaction even though the backend session routes already exist. Operators can open admin routes in development, but there is no explicit entry point for logging in or terminating a session from the management shell.

The left navigation currently navigates correctly but does not reflect the active route. The dashboard item is rendered as permanently selected, which makes the console state misleading once the operator enters user, order, or settings modules.

The user module also mixes activation work orders into a flat card list without lifecycle management. The requested behavior is an operator-facing work-order workspace with status tabs, pagination, and archive semantics where completed work orders move into archived management after closure.

## What Changes

- Add an explicit admin authentication interaction model in the management shell, including a visible login entry state and a sign-out action for authenticated operators.
- Make the admin left navigation derive its active styling from the current route instead of hard-coding the dashboard item.
- Reshape the activation binding work-order area in the user module into a paginated status workspace with tabs for `pending`, `processing`, `closed`, and `archived`.
- Treat closed work orders as operationally archived so support can review completed history separately from active queues.
- Extend admin-side data shaping and mutation flows so work orders can move through the requested lifecycle instead of only `pending/approved/rejected/expired`.

## Capabilities

### Modified Capabilities

- `admin-management-console`: the admin shell must expose authentication actions, route-aware navigation state, and a work-order management surface that reflects operator workflow.
- `account-activation-binding`: activation binding work orders must support an operator lifecycle suitable for queue management and archival visibility.

## Impact

- Admin shell UI: header, navigation, and access-denied state need new interaction affordances.
- Admin user module UI: work-order list becomes a stateful tabbed and paginated workspace rather than a flat card block.
- Admin repositories and domain logic: work-order status vocabulary, list APIs, and approve/reject/close/archive transitions need to be revised.
- Tests: add focused coverage for route highlighting, admin auth actions, lifecycle mapping, and paginated work-order filtering.
